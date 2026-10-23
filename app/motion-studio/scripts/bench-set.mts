// Bench-набор качества сцен (quality-strategy §3, шаг 1). Гонит фиксированный набор запросов
// через настоящий пайплайн (bootCore + очередь + обработчики сервера, реальные агенты и
// рендер) и оценивает превью калиброванным судьёй (`prompts/rubric-judge.md`, медиана
// нескольких прогонов). Итог — `tmp/bench/<run>/scores.{json,md}`; в docs/evidence — только
// с флагом `--write-evidence`. Как пользоваться — `scripts/BENCH.md`.
//
// Запуск из app/motion-studio:
//   export MS_DATA_DIR="/Volumes/External SSD/MotionStudio"
//   ./scripts/with-node.sh npx tsx scripts/bench-set.mts                    # новый прогон: 12 сцен + судья
//   ./scripts/with-node.sh npx tsx scripts/bench-set.mts --run <id>         # продолжить прерванный прогон
//   ./scripts/with-node.sh npx tsx scripts/bench-set.mts --run <id> --judge-only [--rejudge]
//   ./scripts/with-node.sh npx tsx scripts/bench-set.mts --run <id> --judge-only --no-judge   # только отчёт
//   ./scripts/with-node.sh npx tsx scripts/bench-set.mts --only test1,bench-oauth
//   ./scripts/with-node.sh npx tsx scripts/bench-set.mts --calibrate [--split train|holdout|all]
//   ./scripts/with-node.sh npx tsx scripts/bench-set.mts --run <после> --compare <до>
//   ./scripts/with-node.sh npx tsx scripts/bench-set.mts --set user --run user-<sha> --gen-timeout-min 180
// Флаги: --set explainer|user (набор, explainer; user — 6 кейсов пользователя, 60 с, информативно),
//   --runs N (прогонов судьи, 3), --parallel N (задач генерации, 3), --judge-parallel N (6),
//   --judge-model M (opus), --gen-timeout-min N (60), --no-judge, --write-evidence,
//   --allow-dirty (генерировать при незакоммиченных правках app/motion-studio; сцены — -dirty),
//   --second-take revise|fresh|off (режим второго дубля, S5; A/B — два прогона и --compare),
//   --second-take-threshold N (порог overall Visual QA для второго дубля, 6.5).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Job, type Settings, defaultSettings } from "@ms/contracts";
import { MARKER_FILE, initStore, macosProbe } from "@ms/core";
import { ensureRenderBrowser } from "@ms/render";
import { bootCore } from "../server/src/boot.js";
import { loadConfig, readConfigFile } from "../server/src/config.js";
import * as jobs from "../server/src/db/repos/jobs.js";
import * as projects from "../server/src/db/repos/projects.js";
import * as versions from "../server/src/db/repos/versions.js";
import { tx } from "../server/src/db/tx.js";
import { type Scores, compareRuns, comparisonMd } from "../server/src/bench/compare.js";
import { type JudgeOutput, judgeFrames, judgeRuntime, loadJudgePrompt, prepareJudgeInput, runJudge, scoresOf } from "../server/src/bench/judge.js";
import { type Agreement, type Aggregate, CRITERIA, type FrameMetrics, type Split, agreementBySplit, aggregateRuns, frameMetrics, mean, pairOrder } from "../server/src/bench/metrics.js";
import { type JudgeFingerprint, judgeFingerprint, promptHashes, sameFingerprint, short } from "../server/src/bench/provenance.js";
import { HOLDOUT_SEEN_BY_RUBRIC, REFERENCE, anchorsFor } from "../server/src/bench/reference.js";
import { isTransientFailure } from "../server/src/bench/resume.js";
import { type AttemptLine, genStats, stageWallOf } from "../server/src/bench/gen-stats.js";
import { EXPLAINER_SET, HELD_OUT, type SetName, canonicalSceneId, parseSetName, setItems } from "../server/src/bench/sets.js";
import { registerHandlers } from "../server/src/jobs/handlers.js";
import { cancelJob, enqueue, provideInput } from "../server/src/jobs/queue.js";
import type { GenerateResult } from "../server/src/pipeline/generate.js";
import { motionKitHash } from "../server/src/pipeline/render-env.js";
import { type TreeState, dirtyStartError, sceneTree } from "../server/src/bench/tree.js";
import { loadPng } from "../server/src/qa/image.js";
import { newId } from "../server/src/scenes/ids.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** Наборы запросов — `server/src/bench/sets.ts`: explainer (12 сцен) и user (6 кейсов, информативно). */
const SET = EXPLAINER_SET;
/** Цель разброса прогонов судьи на сцену (quality-strategy). */
const SPREAD_TARGET = 0.4;

// ---------- аргументы ----------
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
if (flag("--help") || flag("-h")) {
  // справка — шапка этого файла (запуск и флаги)
  const head = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  console.log(head.slice(0, head.findIndex((l) => !l.startsWith("//"))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}
const opt = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const int = (name: string, d: number) => {
  const v = opt(name);
  const n = v === undefined ? d : Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name}: нужно целое ≥ 1`);
  return n;
};
const calibrate = flag("--calibrate");
const setName: SetName = parseSetName(opt("--set"));
if (calibrate && setName !== "explainer") throw new Error("--calibrate: только набор explainer (оценки дизайнера есть только у него)");
const userSet = setName === "user";
const judgeOnly = flag("--judge-only");
const noJudge = flag("--no-judge");
const rejudge = flag("--rejudge");
const runs = int("--runs", 3);
const parallel = int("--parallel", 3);
const judgeParallel = int("--judge-parallel", 6);
const genTimeoutMs = int("--gen-timeout-min", 60) * 60_000;
const judgeModel = opt("--judge-model") ?? "opus";
// старые id сцен (до переименования харнесса) принимаются через алиасы
const only = opt("--only")?.split(",").map((s) => canonicalSceneId(s.trim())).filter(Boolean);
const split = opt("--split") ?? "train";
if (!["train", "holdout", "all"].includes(split)) throw new Error(`--split: train, holdout или all: ${split}`);
const git = (...a: string[]) => execFileSync("git", a, { cwd: REPO, encoding: "utf8" }).trim();
const sha = git("rev-parse", "--short", "HEAD");
/** Коммит, на котором идёт этот запуск; незакоммиченные правки приложения — суффикс `-dirty`. */
const isDirty = () => git("status", "--porcelain", "--", "app/motion-studio") !== "";
const commit = isDirty() ? `${sha}-dirty` : sha;
const allowDirty = flag("--allow-dirty");
// второй дубль (S5): режим для A/B — поверх config.json хранилища
const secondTake = opt("--second-take");
if (secondTake !== undefined) {
  if (!["revise", "fresh", "off"].includes(secondTake)) throw new Error(`--second-take: revise, fresh или off: ${secondTake}`);
  process.env.MS_SECOND_TAKE = secondTake;
}
const secondTakeThreshold = opt("--second-take-threshold");
if (secondTakeThreshold !== undefined) process.env.MS_SECOND_TAKE_THRESHOLD = secondTakeThreshold;
/** Дерево сейчас: незакоммиченные правки приложения и хэш kit (рендер хэширует kit живьём). */
const treeNow = async (): Promise<TreeState> => ({ dirty: isDirty(), kit_hash: await motionKitHash() });
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
const runId = opt("--run") ?? `${calibrate ? "calib" : userSet ? "user" : "bench"}-${stamp}-${sha}`;
const SAFE_ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
if (!SAFE_ID.test(runId)) throw new Error(`--run: только латиница, цифры, _ . -: ${runId}`);
const RUN_DIR = join(REPO, "tmp", "bench", runId);
const EVIDENCE = join(REPO, "docs", "evidence", "phase-1", "bench");
const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const writeJson = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");

// ---------- сравнение до/после ----------
const compareWith = opt("--compare");
if (compareWith !== undefined) {
  if (!SAFE_ID.test(compareWith)) throw new Error(`--compare: только латиница, цифры, _ . -: ${compareWith}`);
  if (!opt("--run")) throw new Error("--compare <до>: укажи и --run <после>");
  const load = (id: string): Scores => {
    const p = [join(REPO, "tmp", "bench", id, "scores.json"), join(EVIDENCE, id, "scores.json")].find((f) => existsSync(f));
    if (!p) throw new Error(`bench: нет scores.json прогона ${id} (tmp/bench или docs/evidence)`);
    return readJson<Scores>(p);
  };
  const c = compareRuns(load(compareWith), load(runId));
  const md = comparisonMd(c);
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(join(RUN_DIR, `compare-${compareWith}.md`), md);
  console.log(md);
  process.exit(c.accepted ? 0 : 1);
}

const dataDir = process.env.MS_DATA_DIR?.trim();
if (!dataDir) throw new Error("MS_DATA_DIR не задан");
mkdirSync(RUN_DIR, { recursive: true });
const log = (s: string) => console.log(`[bench ${runId}] ${s}`);

/** Сцены прогона: id → запрос (и для калибровки — оценка дизайнера). */
interface Item {
  id: string;
  /** Имя запроса (для leave-one-scene-out). */
  scene: string;
  prompt: string;
  /** Длина сцены набора (user — 60 с); нет — `defaultSettings()`. */
  duration_frames?: number;
  ref?: number;
  split?: Split;
}
const items: Item[] = calibrate
  ? REFERENCE.filter((r) => split === "all" || r.split === split)
    .map((r) => ({ id: r.id, scene: r.scene, prompt: SET[r.scene]!, ref: r.grade, split: r.split }))
    .filter((it) => !only || only.includes(it.id) || only.includes(it.scene))
  : setItems(setName, only);
if (items.length === 0) throw new Error(`--only: нет таких сцен: ${only?.join(", ")}`);
const dirOf = (it: { id: string }) => join(RUN_DIR, it.id);

// run.json пишется один раз при создании прогона; повторные запуски (--judge-only,
// --rejudge, продолжение) только дописывают себя в invocations
const runFile = join(RUN_DIR, "run.json");
const invocation = { at: new Date().toISOString(), commit, argv };
if (!existsSync(runFile)) {
  writeJson(runFile, {
    run: runId, mode: calibrate ? "calibrate" : "bench", set: setName, created_commit: commit, judge_model: judgeModel, judge_runs: runs,
    ...(calibrate ? { split } : {}),
    items: items.map((i) => ({ id: i.id, scene: i.scene, prompt: i.prompt, ref: i.ref ?? null, split: i.split ?? null, held_out: HELD_OUT.has(i.scene), ...(i.duration_frames ? { duration_frames: i.duration_frames } : {}) })),
    invocations: [invocation],
  });
} else {
  // прогон одного набора: продолжать его другим набором нельзя (у прогонов до флага --set — explainer)
  const prev = readJson<{ set?: string; invocations?: unknown[] }>(runFile);
  if ((prev.set ?? "explainer") !== setName) throw new Error(`--run ${runId}: прогон набора ${prev.set ?? "explainer"}, а запрошен --set ${setName}`);
  writeJson(runFile, { ...prev, invocations: [...(prev.invocations ?? []), invocation] });
}

// ---------- источник превью ----------
interface GenInfo {
  status: string;
  job_status?: string;
  failure?: unknown;
  version_status?: string;
  cost_usd: number;
  wall_ms: number;
  engineer_calls?: number;
  duration_frames: number;
  fps: number;
  source: string;
  /**
   * Чем сгенерировано: коммит (`-dirty` — дерево грязное до или после сцены, или kit поменялся
   * за время сцены), kit, промпты.
   */
  commit: string;
  dirty?: boolean;
  /** Хэш motion-kit после сцены (`kit_hash_start` — если за сцену он поменялся). */
  kit_hash?: string;
  kit_hash_start?: string;
  motion_kit_version: string | null;
  motion_kit_sha256?: string | null;
  prompts_sha256: Record<string, string> | null;
  /** Прежние неудачные попытки сцены (без превью): их стоимость входит в итог прогона. */
  prior_attempts?: GenInfo[];
  /** Время этапов по часам, мс (S5; у старых журналов — сумма timings), и total. */
  stage_wall_ms?: Record<string, number> | null;
  /** Попытки с оценкой Visual QA и опубликованная (S5). */
  attempts?: AttemptLine[];
  /** Режим второго дубля, с которым шла генерация (S5). */
  second_take?: string;
}

const KIT_INDEX = "app/motion-studio/render/src/motion-kit/index.ts";
const kitVersionOf = (src: string) => /MOTION_KIT_VERSION = "([^"]+)"/.exec(src)?.[1] ?? null;
const kitSha = (manifestFile: string) => {
  if (!existsSync(manifestFile)) return null;
  return readJson<{ render_env?: { motion_kit?: string } }>(manifestFile).render_env?.motion_kit ?? null;
};

/** Калибровка: превью и spec сцены из git на коммите ревью. */
function fromGit(it: Item): void {
  const ref = REFERENCE.find((r) => r.id === it.id)!;
  const out = dirOf(it);
  if (existsSync(join(out, "gen.json"))) return;
  mkdirSync(out, { recursive: true });
  const base = `docs/evidence/phase-1/pipeline/${ref.scene}`;
  for (const f of ["preview.mp4", "spec.json", "manifest.json", "qa.json"]) {
    writeFileSync(join(out, f), execFileSync("git", ["show", `${ref.commit}:${base}/${f}`], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 }));
  }
  const spec = readJson<{ duration_frames: number }>(join(out, "spec.json"));
  const manifest = readJson<{ status: string; settings: Settings }>(join(out, "manifest.json"));
  writeJson(join(out, "gen.json"), {
    status: "reference", version_status: manifest.status, cost_usd: 0, wall_ms: 0,
    duration_frames: spec.duration_frames, fps: manifest.settings.fps.num / manifest.settings.fps.den,
    source: `git ${ref.commit}:${base}`,
    commit: ref.commit, motion_kit_version: kitVersionOf(git("show", `${ref.commit}:${KIT_INDEX}`)),
    motion_kit_sha256: kitSha(join(out, "manifest.json")), prompts_sha256: null,
  } satisfies GenInfo);
}

/** Генерация недостающих сцен настоящим пайплайном; уже готовые (gen.json) пропускаются. */
async function generateMissing(todo: Item[]): Promise<void> {
  if (todo.length === 0) return;
  const refuse = dirtyStartError(await treeNow(), allowDirty);
  if (refuse) throw new Error(refuse);
  log(`генерация: ${todo.map((t) => t.id).join(", ")} (параллельно ${parallel})`);
  await ensureRenderBrowser();
  const mine = new Set<string>();
  const results = new Map<string, GenerateResult>();
  const core = await bootCore({
    env: process.env,
    kind: "cli",
    runner: { onlyIds: mine, maxRunning: parallel },
    handlers: (svc) => registerHandlers(svc, { log: (l) => console.log(`  ${l}`), onGenerateResult: (job, r) => results.set(job.id, r) }),
    storageLog: (l) => console.log(`  [storage] ${l}`),
  });
  // свой проект на прогон: сцены bench не попадают в playground, а подсказки против повторов
  // (последние spec проекта) не тянутся из прошлых прогонов — иначе «до» и «после» неравны
  // (продолжение прогона, начатого до переименования харнесса, — в его прежнем проекте)
  const legacyProject = projects.BENCH_PROJECT_PREFIXES.slice(1).map((p) => `${p}${runId}`).find((id) => projects.get(core.db, id));
  const projectId = legacyProject ?? `${projects.BENCH_PROJECT_PREFIXES[0]}${runId}`;
  try {
    if (core.reaped.alive.length > 0 || core.reaped.strays.length > 0) throw new Error("stale_process: остались процессы прежних прогонов; заверши их и повтори");
    tx(core.db, () => {
      if (!projects.get(core.db, projectId)) projects.create(core.db, { id: projectId, kind: "video", title: `Bench ${runId}` });
    });
    const one = async (it: Item) => {
      const out = dirOf(it);
      const failedFile = join(out, "gen-failed.json");
      const old = existsSync(failedFile) ? readJson<GenInfo>(failedFile) : null;
      const prior = old ? [...(old.prior_attempts ?? []), { ...old, prior_attempts: undefined }] : [];
      const settings = defaultSettings();
      if (it.duration_frames) settings.duration_frames = it.duration_frames;
      const t0 = Date.now();
      const treeStart = await treeNow();
      const provenance = {
        commit, motion_kit_version: kitVersionOf(readFileSync(join(REPO, KIT_INDEX), "utf8")), prompts_sha256: promptHashes(),
      };
      const job = tx(core.db, () => {
        const scene = core.repo.createScene(projectId, { prompt: it.prompt, settings });
        return enqueue(core.db, { type: "playground.generate", projectId, sceneId: scene.id, input: { sceneId: scene.id, prompt: it.prompt, settings }, idempotencyKey: `bench-${runId}-${it.id}-${newId("run")}` }).job;
      });
      mine.add(job.id);
      let j: Job | undefined;
      let giveUpAt = Infinity;
      for (;;) {
        try {
          j = jobs.get(core.db, job.id);
        } catch {
          // storage_offline: база закрыта до возврата хранилища
        }
        if (j?.status === "awaiting_input") provideInput(core.db, j.id, "skip");
        else if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) break;
        if (giveUpAt === Infinity && Date.now() - t0 > genTimeoutMs) {
          log(`${it.id}: дольше ${genTimeoutMs / 60_000} мин — отменяю задачу`);
          await cancelJob(core.db, core.processes, job.id).catch((e: unknown) => log(`${it.id}: отмена не удалась: ${(e as Error).message}`));
          giveUpAt = Date.now() + 120_000;
        }
        if (Date.now() > giveUpAt) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      const timedOut = giveUpAt !== Infinity;
      const r = results.get(job.id);
      const [v] = versions.listByJob(core.db, job.id);
      const vdir = v ? join(core.root, v.path) : r?.versionDir;
      rmSync(out, { recursive: true, force: true });
      mkdirSync(out, { recursive: true });
      const runsCost = (core.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM agent_runs WHERE job_id = ?").get(job.id) as { c: number }).c;
      if (vdir && !timedOut) {
        for (const f of ["preview.mp4", "spec.json", "qa.json", "manifest.json", "pipeline-log.json", "warnings.json"]) {
          if (existsSync(join(vdir, f))) copyFileSync(join(vdir, f), join(out, f));
        }
        if (existsSync(join(vdir, "src", "Scene.tsx"))) copyFileSync(join(vdir, "src", "Scene.tsx"), join(out, "Scene.tsx"));
      }
      const plog = existsSync(join(out, "pipeline-log.json")) ? readJson<Parameters<typeof stageWallOf>[0] & { attempts?: AttemptLine[] }>(join(out, "pipeline-log.json")) : undefined;
      const info: GenInfo = {
        status: timedOut ? "timeout" : existsSync(join(out, "preview.mp4")) ? (r?.status ?? j?.status ?? "unknown") : "no_preview",
        job_status: j?.status, failure: r?.failure ?? j?.error ?? undefined, version_status: v?.status,
        cost_usd: runsCost, wall_ms: Date.now() - t0, engineer_calls: r?.engineerCalls,
        stage_wall_ms: r?.stageWallMs ?? stageWallOf(plog), ...(r?.attempts ?? plog?.attempts ? { attempts: r?.attempts ?? plog?.attempts } : {}),
        second_take: core.config.scene.secondTake.mode,
        duration_frames: settings.duration_frames, fps: settings.fps.num / settings.fps.den, source: vdir ?? "",
        ...provenance, ...sceneTree(sha, treeStart, await treeNow()), motion_kit_sha256: kitSha(join(out, "manifest.json")),
        ...(prior.length ? { prior_attempts: prior } : {}),
      };
      if (info.dirty) log(`${it.id}: дерево или kit менялись во время сцены — ${info.commit}, kit ${info.kit_hash}`);
      // без превью gen.json не пишется: повторный запуск с --run сгенерирует сцену заново
      if (info.status !== "no_preview" && info.status !== "timeout") writeJson(join(out, "gen.json"), info);
      else writeJson(failedFile, info);
      log(`${it.id}: ${info.job_status} (${info.status}), $${info.cost_usd.toFixed(2)}, ${(info.wall_ms / 60000).toFixed(1)} мин`);
    };
    await Promise.all(todo.map((it) => one(it).catch((e) => log(`${it.id}: ошибка генерации: ${(e as Error).message}`))));
  } finally {
    await core.close();
  }
}

// ---------- судья ----------
interface JudgeRunFile {
  status: string;
  output?: JudgeOutput;
  error?: unknown;
  cost_usd: number;
  model: string;
  wall_ms: number;
  /** Коммит запуска судьи и отпечаток судьи (хеши рубрики и якорей). */
  commit?: string;
  judge?: Partial<JudgeFingerprint>;
}

const isRun = (f: string) => /^\d+\.json$/.test(f);
const isFailedRun = (f: string) => /^\d+\.failed(-\d+)?\.json$/.test(f);
const judgeFiles = (dir: string, pick: (f: string) => boolean) =>
  existsSync(join(dir, "judge-runs")) ? readdirSync(join(dir, "judge-runs")).filter(pick).sort((a, b) => parseInt(a) - parseInt(b)) : [];

async function judgeStore(): Promise<string> {
  // отдельное хранилище судьи внутри MS_DATA_DIR: свои журналы и реестр процессов, без
  // owner lock основного (судью можно гонять, пока идёт генерация)
  const root = join(dataDir!, "bench");
  if (!existsSync(join(root, MARKER_FILE))) await initStore(root, macosProbe, {});
  return root;
}

async function judgeAll(todo: Item[]): Promise<void> {
  const fp = judgeFingerprint();
  const tasks: { it: Item; k: number }[] = [];
  for (const it of todo) {
    const dir = dirOf(it);
    if (!existsSync(join(dir, "gen.json"))) {
      log(`${it.id}: нет превью — судья пропущен`);
      continue;
    }
    if (rejudge) rmSync(join(dir, "judge-runs"), { recursive: true, force: true });
    // готовые прогоны другой рубрики с новыми не смешиваются: отказ до трат на вызовы
    sameFingerprint([
      ...judgeFiles(dir, isRun).map((f) => ({ where: `${it.id}/${f}`, fp: readJson<JudgeRunFile>(join(dir, "judge-runs", f)).judge })),
      { where: "текущая рубрика", fp },
    ]);
    for (let k = 1; k <= runs; k++) if (!existsSync(join(dir, "judge-runs", `${k}.json`))) tasks.push({ it, k });
  }
  log(`судья: ${tasks.length} вызовов (${judgeModel}, ${short(fp)}, параллельно ${judgeParallel})`);
  if (tasks.length === 0) return;
  const config = loadConfig(process.env, await readConfigFile(dataDir!));
  const store = await judgeStore();
  const agents = judgeRuntime({ bin: config.claudeBin, logRoot: join(store, "logs"), systemPrompt: await loadJudgePrompt() });
  for (const it of new Set(tasks.map((t) => t.it))) {
    const dir = dirOf(it);
    const gen = readJson<GenInfo>(join(dir, "gen.json"));
    if (!existsSync(join(dir, "judge", "sheets", "sheet-d.png"))) {
      await prepareJudgeInput(join(dir, "preview.mp4"), join(dir, "judge"), { prompt: it.prompt, duration_frames: gen.duration_frames, fps: gen.fps });
    }
    mkdirSync(join(dir, "judge-runs"), { recursive: true });
  }
  const ac = new AbortController();
  process.once("SIGINT", () => ac.abort());
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const { it, k } = tasks[next++]!;
      const dir = dirOf(it);
      const gen = readJson<GenInfo>(join(dir, "gen.json"));
      const t0 = Date.now();
      let file: JudgeRunFile;
      try {
        const r = await runJudge({
          agents, dir: join(dir, "judge"), anchors: anchorsFor(it.scene), durationFrames: gen.duration_frames, model: judgeModel,
          runRef: { root: store, runId: `${runId}.${it.id}.${k}`, attempt: 1 }, signal: ac.signal,
        });
        file = { status: r.status, output: r.output, error: r.error, cost_usd: r.usage.costUsd, model: r.usage.model, wall_ms: Date.now() - t0, commit, judge: fp };
      } catch (e) {
        file = { status: "error", error: { message: (e as Error).message }, cost_usd: 0, model: judgeModel, wall_ms: Date.now() - t0, commit, judge: fp };
      }
      // неудачный вызов не сохраняется как результат: повтор запуска его переделает;
      // каждая неудача — свой файл, чтобы её стоимость вошла в итог
      if (file.status === "completed" && file.output) writeJson(join(dir, "judge-runs", `${k}.json`), file);
      else writeJson(join(dir, "judge-runs", `${k}.failed-${judgeFiles(dir, isFailedRun).length + 1}.json`), file);
      const err = (file.error as { message?: string } | undefined)?.message ?? "";
      log(`судья ${it.id} #${k}: ${file.status}${file.output ? ` overall ${file.output.overall}` : ` ${err}`} ($${file.cost_usd.toFixed(2)})`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(judgeParallel, tasks.length) }, worker));
}

// ---------- итоги ----------
interface Row {
  id: string;
  scene: string;
  held_out: boolean;
  split: Split | null;
  ref: number | null;
  judge: Aggregate | null;
  /** Судья: удачные и неудачные вызовы. */
  judge_cost_usd: number;
  judge_failed_calls: number;
  gen: GenInfo | null;
  /** Генерация с прежними неудачными попытками (и сцена без превью — по gen-failed.json). */
  gen_cost_total_usd: number;
  frames: FrameMetrics | null;
  top_defects: string[];
}

const attemptsCost = (g: GenInfo) => g.cost_usd + (g.prior_attempts ?? []).reduce((a, p) => a + p.cost_usd, 0);

async function collect(): Promise<{ rows: Row[]; judge: JudgeFingerprint | null }> {
  const rows: Row[] = [];
  const fps: { where: string; fp: Partial<JudgeFingerprint> | undefined }[] = [];
  for (const it of items) {
    const dir = dirOf(it);
    const gen = existsSync(join(dir, "gen.json")) ? readJson<GenInfo>(join(dir, "gen.json")) : null;
    const failedGen = !gen && existsSync(join(dir, "gen-failed.json")) ? readJson<GenInfo>(join(dir, "gen-failed.json")) : null;
    const runFiles = judgeFiles(dir, isRun);
    const outs = runFiles.map((f) => readJson<JudgeRunFile>(join(dir, "judge-runs", f)));
    runFiles.forEach((f, i) => fps.push({ where: `${it.id}/${f}`, fp: outs[i]!.judge }));
    const failed = judgeFiles(dir, isFailedRun).map((f) => readJson<JudgeRunFile>(join(dir, "judge-runs", f)));
    let frames: FrameMetrics | null = null;
    if (gen && existsSync(join(dir, "judge", "frames"))) {
      const fs = new Map<number, Awaited<ReturnType<typeof loadPng>>>();
      for (const f of judgeFrames(gen.duration_frames)) {
        const p = join(dir, "judge", "frames", `${f}.png`);
        if (existsSync(p)) fs.set(f, await loadPng(p));
      }
      frames = frameMetrics(fs, gen.duration_frames);
      writeJson(join(dir, "metrics.json"), frames);
    }
    const last = outs.at(-1)?.output;
    rows.push({
      id: it.id, scene: it.scene, held_out: HELD_OUT.has(it.scene), split: it.split ?? null, ref: it.ref ?? null,
      judge: outs.length > 0 ? aggregateRuns(outs.map((o) => scoresOf(o.output!))) : null,
      judge_cost_usd: [...outs, ...failed].reduce((a, o) => a + o.cost_usd, 0),
      judge_failed_calls: failed.length,
      gen, gen_cost_total_usd: gen ? attemptsCost(gen) : failedGen ? attemptsCost(failedGen) : 0,
      frames, top_defects: last ? last.top_defects.slice(0, 3).map((d) => `${d.frame}: ${d.text}`) : [],
    });
  }
  // оценки разных рубрик в одном отчёте не смешиваются: нужен --rejudge
  return { rows, judge: sameFingerprint(fps) };
}

const f1 = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? "—" : x.toFixed(d));
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => x ?? "нет данных"))];

function report(rows: Row[], judge: JudgeFingerprint | null): { md: string; summary: Record<string, unknown> } {
  const judged = rows.filter((r) => r.judge);
  const gens = rows.flatMap((r) => (r.gen ? [r.gen] : []));
  const promptSets = uniq(gens.map((g) => (g.prompts_sha256 ? JSON.stringify(g.prompts_sha256) : null)));
  const genCost = rows.reduce((a, r) => a + r.gen_cost_total_usd, 0);
  const spready = judged.filter((r) => r.judge!.spread > SPREAD_TARGET).map((r) => r.id);
  const summary: Record<string, unknown> = {
    run: runId, report_commit: commit, judge_model: judgeModel, judge_runs: runs, scenes: rows.length, judged: judged.length,
    judge,
    judge_commits: uniq(rows.flatMap((r) => judgeFiles(dirOf(r), isRun).map((f) => readJson<JudgeRunFile>(join(dirOf(r), "judge-runs", f)).commit))),
    gen_commits: uniq(gens.map((g) => g.commit)),
    motion_kit_versions: uniq(gens.map((g) => g.motion_kit_version)),
    prompts_sha256: promptSets.length === 1 && promptSets[0] !== "нет данных" ? JSON.parse(promptSets[0]!) : null,
    prompts_mixed: promptSets.length > 1,
    set: setName,
    mean: judged.length ? mean(judged.map((r) => r.judge!.overall)) : null,
    // у набора user нет деления на настроенные и отложенные: его среднее — отдельное и информативное
    ...(userSet
      ? { mean_user: judged.length ? mean(judged.map((r) => r.judge!.overall)) : null, informational: true }
      : {
          mean_tuned: judged.filter((r) => !r.held_out).length ? mean(judged.filter((r) => !r.held_out).map((r) => r.judge!.overall)) : null,
          mean_held_out: judged.filter((r) => r.held_out).length ? mean(judged.filter((r) => r.held_out).map((r) => r.judge!.overall)) : null,
        }),
    max_spread: judged.length ? Math.max(...judged.map((r) => r.judge!.spread)) : null,
    spread_over_target: spready,
    gen_cost_usd: genCost,
    gen_cost_failed_attempts_usd: genCost - gens.reduce((a, g) => a + g.cost_usd, 0),
    judge_cost_usd: rows.reduce((a, r) => a + r.judge_cost_usd, 0),
    judge_failed_calls: rows.reduce((a, r) => a + r.judge_failed_calls, 0),
  };
  const withRef = judged.filter((r) => r.ref !== null);
  const pairsOf = (rs: Row[]) =>
    [...new Set(rs.map((r) => r.scene))].flatMap((s) => {
      const a = rs.find((r) => r.scene === s && r.id.startsWith("r1-"));
      const b = rs.find((r) => r.scene === s && r.id.startsWith("r2-"));
      return a && b ? [{ id: s, a: a.judge!, b: b.judge!, ref: [a.ref!, b.ref!] as [number, number] }] : [];
    });
  const calLines: string[] = [];
  if (withRef.length >= 2) {
    const by = agreementBySplit(withRef.map((r) => ({ id: r.id, split: r.split ?? "train", judge: r.judge!.overall, ref: r.ref! })));
    summary.agreement = by.all;
    summary.agreement_by_split = by;
    const po = (x: ReturnType<typeof pairOrder>) => `${x.correct}/${x.total}${x.wrong.length ? ` (мимо: ${x.wrong.join(", ")})` : ""}`;
    const line = (title: string, a: Agreement | null, rs: Row[]) => {
      if (!a) return;
      const pairs = pairsOf(rs);
      const p = pairs.length ? pairOrder(pairs.map((q) => ({ id: q.id, judge: [q.a.overall, q.b.overall], ref: q.ref }))) : null;
      // медианы с шагом 0.5 часто равны — порядок и по средним прогонов
      const pm = pairs.length ? pairOrder(pairs.map((q) => ({ id: q.id, judge: [q.a.mean, q.b.mean], ref: q.ref }))) : null;
      calLines.push(`- ${title}: n ${a.n}, MAE **${a.mae.toFixed(2)}** (цель ≤ 0.7), Spearman **${a.spearman.toFixed(2)}** (цель ≥ 0.6), смещение ${a.bias >= 0 ? "+" : ""}${a.bias.toFixed(2)}, худшая ${a.worst.id} (${a.worst.err.toFixed(1)})${p && pm ? `; порядок R1→R2 по медианам ${po(p)}, по средним ${po(pm)}` : ""}.`);
    };
    line("train (in-sample, optimistic: по нему правится рубрика)", by.train, withRef.filter((r) => r.split === "train"));
    line(`holdout${HOLDOUT_SEEN_BY_RUBRIC ? " (рубрика v1–v4 видела эти оценки — тоже optimistic)" : ""}`, by.holdout, withRef.filter((r) => r.split === "holdout"));
    if (by.train && by.holdout) line("все (in-sample, optimistic)", by.all, withRef);
    const pairsAll = pairsOf(withRef);
    if (pairsAll.length > 0) {
      summary.pair_order = pairOrder(pairsAll.map((p) => ({ id: p.id, judge: [p.a.overall, p.b.overall], ref: p.ref })));
      summary.pair_order_mean = pairOrder(pairsAll.map((p) => ({ id: p.id, judge: [p.a.mean, p.b.mean], ref: p.ref })));
    }
  }
  const head = ["Сцена", ...(withRef.length ? ["Часть", "Дизайнер"] : []), "Судья (медиана)", "Прогоны", "Разброс", ...CRITERIA.map((c) => c.slice(0, 5)), "Ген. $", "Статус", "Кадр 0", "Hold Δ", "Пустые трети"];
  const prompts = summary.prompts_sha256 as Record<string, string> | null;
  const lines = [
    `# Bench ${runId}`,
    "",
    `Отчёт на \`${commit}\`, ${new Date().toISOString().slice(0, 10)}. Генерация: коммит ${(summary.gen_commits as string[]).map((c) => `\`${c}\``).join(", ")}, motion-kit ${(summary.motion_kit_versions as string[]).join(", ")}, промпты ${prompts ? `\`${Object.entries(prompts).map(([f, h]) => `${f}:${h.slice(0, 8)}`).join(" ")}\`` : summary.prompts_mixed ? "**разные у сцен**" : "нет данных"}.`,
    `Судья \`${judgeModel}\` × ${runs}, ${judge ? short(judge) : "нет оценок"}, коммит ${(summary.judge_commits as string[]).map((c) => `\`${c}\``).join(", ")}.`,
    "",
    ...(userSet
      ? ["Набор **user** (иллюстративная нарративная анимация, 60 с): оценка **информативная** — рубрика судьи написана под продуктовый explainer, не под этот жанр; в правило приёмки не входит.", ""]
      : []),
    `Среднее${userSet ? " набора user" : ""}: **${f1(summary.mean as number | null, 2)}**${userSet ? "" : ` (настроенные ${f1(summary.mean_tuned as number | null, 2)}, отложенные ${f1(summary.mean_held_out as number | null, 2)})`}; макс. разброс прогонов ${f1(summary.max_spread as number | null)}${spready.length ? ` (цель ≤ ${SPREAD_TARGET}; выше у ${spready.join(", ")})` : ""}; генерация $${genCost.toFixed(2)}${(summary.gen_cost_failed_attempts_usd as number) > 0 ? ` (из них неудачные попытки $${(summary.gen_cost_failed_attempts_usd as number).toFixed(2)})` : ""}, судья $${(summary.judge_cost_usd as number).toFixed(2)}${(summary.judge_failed_calls as number) > 0 ? ` (неудачных вызовов ${summary.judge_failed_calls as number})` : ""}.`,
    "",
  ];
  if (calLines.length) lines.push("Согласие с дизайнером:", "", ...calLines, "");
  lines.push(`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`);
  for (const r of rows) {
    const j = r.judge;
    lines.push(`| ${r.id}${r.held_out ? " (отл.)" : ""} | ${withRef.length ? `${r.split ?? "—"} | ${f1(r.ref)} | ` : ""}${f1(j?.overall)} | ${j ? j.runs.join(" / ") : "—"} | ${f1(j?.spread)} | ${CRITERIA.map((c) => f1(j?.criteria[c])).join(" | ")} | ${f1(r.gen_cost_total_usd, 2)} | ${r.gen?.job_status ?? r.gen?.status ?? "нет"} | ${f1(r.frames?.frame0Content, 3)} | ${f1(r.frames?.holdDelta, 4)} | ${f1(r.frames?.emptyThirdShare, 2)} |`);
  }
  // S5: время генерации по этапам (по часам) и стоимость — постоянная метрика прогона
  const genRows = rows.flatMap((r) => (r.gen ? [{ id: r.id, cost_usd: r.gen_cost_total_usd, stage_wall_ms: r.gen.stage_wall_ms ?? null, attempts: r.gen.attempts, gen: r.gen }] : []));
  const gs = genStats(genRows);
  summary.gen_stats = gs;
  if (genRows.length > 0) {
    const STAGES = ["concept", "director", "engineer", "check", "render", "qa", "publish"];
    const min = (ms: number | undefined) => (ms === undefined ? "—" : (ms / 60_000).toFixed(1));
    const sh = ["Сцена", "Итог, мин", ...STAGES, "Попыток", "Overall 1-я → опубл.", "Дубль 2", "$"];
    lines.push("", "## Время генерации (мин, по часам) и стоимость", "", `| ${sh.join(" | ")} |`, `|${sh.map(() => "---").join("|")}|`);
    for (const g of genRows) {
      const w = g.stage_wall_ms ?? {};
      const sc = (g.attempts ?? []).filter((a) => a.overall !== undefined).sort((a, b) => a.n - b.n);
      const pub = sc.find((a) => a.published);
      const t2 = (g.attempts as (AttemptLine & { take?: number })[] | undefined)?.some((a) => a.take === 2);
      lines.push(`| ${g.id} | ${min(w.total)} | ${STAGES.map((s) => min(w[s])).join(" | ")} | ${g.attempts?.length ?? "—"} | ${sc.length ? `${sc[0]!.overall} → ${pub?.overall ?? "—"}` : "—"} | ${t2 ? g.gen.second_take ?? "да" : "—"} | ${g.cost_usd.toFixed(2)} |`);
    }
    const st = (k: string) => (gs.stages[k] ? `${min(gs.stages[k]!.p50)} / ${min(gs.stages[k]!.mean)}` : "—");
    lines.push(
      "",
      `Медиана / среднее по сценам, мин: итог ${st("total")}; ${STAGES.map((s) => `${s} ${st(s)}`).join("; ")}.`,
      `Стоимость генерации на сцену: p50 $${f1(gs.cost_p50, 2)}, p90 $${f1(gs.cost_p90, 2)}. Опубликованная оценка Visual QA ≥ первой попытки: ${gs.published_ge_first.ok}/${gs.published_ge_first.of}${gs.published_ge_first.misses.length ? ` (ниже: ${gs.published_ge_first.misses.join(", ")})` : ""}.`,
    );
  }
  // дефекты holdout не печатаются: по ним нельзя править рубрику
  const shown = rows.filter((r) => r.split !== "holdout" && r.top_defects.length);
  if (shown.length) {
    lines.push("", "## Главные дефекты по судье (последний прогон)", "");
    for (const r of shown) lines.push(`- **${r.id}**: ${r.top_defects.join("; ")}`);
  }
  return { md: lines.join("\n") + "\n", summary };
}

// ---------- ход ----------
if (calibrate) items.forEach(fromGit);
else if (!judgeOnly) {
  // сцена, упавшая на обрыве сети, — не результат: её попытка уходит в gen-failed.json
  // (стоимость входит в итог), и сцена генерируется заново
  for (const it of items) {
    const genFile = join(dirOf(it), "gen.json");
    if (existsSync(genFile) && isTransientFailure(readJson<GenInfo>(genFile).failure)) {
      log(`${it.id}: сбой среды в прошлой попытке — генерирую заново`);
      renameSync(genFile, join(dirOf(it), "gen-failed.json"));
    }
  }
  await generateMissing(items.filter((it) => !existsSync(join(dirOf(it), "gen.json"))));
} else {
  // --judge-only сцену не перегенерирует: превью после сбоя среды судится как есть — сказать об этом
  for (const it of items) {
    const genFile = join(dirOf(it), "gen.json");
    if (existsSync(genFile) && isTransientFailure(readJson<GenInfo>(genFile).failure)) log(`${it.id}: превью — от попытки, оборванной сбоем среды (--judge-only не генерирует заново)`);
  }
}
if (!noJudge) await judgeAll(items);
const { rows, judge } = await collect();
const { md, summary } = report(rows, judge);
// в scores.json дефекты holdout тоже не попадают
writeJson(join(RUN_DIR, "scores.json"), { summary, rows: rows.map((r) => (r.split === "holdout" ? { ...r, top_defects: [] } : r)) });
writeFileSync(join(RUN_DIR, "scores.md"), md);
console.log(md);
if (flag("--write-evidence")) {
  // итоги, run.json и по сценам — gen.json и ответы судьи (для перепроверки агрегации)
  const ev = join(EVIDENCE, runId);
  mkdirSync(ev, { recursive: true });
  for (const f of ["scores.json", "scores.md", "run.json"]) copyFileSync(join(RUN_DIR, f), join(ev, f));
  for (const it of items) {
    const dir = dirOf(it);
    const files = [...judgeFiles(dir, isRun), ...judgeFiles(dir, isFailedRun)];
    if (existsSync(join(dir, "gen.json"))) {
      mkdirSync(join(ev, it.id), { recursive: true });
      copyFileSync(join(dir, "gen.json"), join(ev, it.id, "gen.json"));
    }
    if (files.length && it.split !== "holdout") {
      mkdirSync(join(ev, it.id, "judge-runs"), { recursive: true });
      for (const f of files) copyFileSync(join(dir, "judge-runs", f), join(ev, it.id, "judge-runs", f));
    }
  }
  log(`evidence: ${ev}`);
}
