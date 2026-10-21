// Eval-набор качества сцен (quality-strategy §3, шаг 1). Гонит фиксированный набор запросов
// через настоящий пайплайн (bootCore + очередь + обработчики сервера, реальные агенты и
// рендер) и оценивает превью калиброванным судьёй (`prompts/rubric-judge.md`, медиана
// нескольких прогонов). Итог — `tmp/eval/<run>/scores.{json,md}`; в docs/evidence — только
// с флагом `--write-evidence`. Как пользоваться — `scripts/EVAL.md`.
//
// Запуск из app/motion-studio:
//   export MS_DATA_DIR="/Volumes/External SSD/MotionStudio"
//   ./scripts/with-node.sh npx tsx scripts/eval-set.mts                    # новый прогон: 12 сцен + судья
//   ./scripts/with-node.sh npx tsx scripts/eval-set.mts --run <id>         # продолжить прерванный прогон
//   ./scripts/with-node.sh npx tsx scripts/eval-set.mts --run <id> --judge-only [--rejudge]
//   ./scripts/with-node.sh npx tsx scripts/eval-set.mts --only test1,eval-oauth
//   ./scripts/with-node.sh npx tsx scripts/eval-set.mts --calibrate        # судья на 12 сценах R1/R2
// Флаги: --runs N (прогонов судьи, 3), --parallel N (задач генерации, 3), --judge-parallel N (6),
//   --judge-model M (opus), --no-judge, --write-evidence.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Job, type Settings, defaultSettings } from "@ms/contracts";
import { MARKER_FILE, initStore, macosProbe } from "@ms/core";
import { ensureRenderBrowser } from "@ms/render";
import { bootCore } from "../server/src/boot.ts";
import { loadConfig, readConfigFile } from "../server/src/config.ts";
import * as jobs from "../server/src/db/repos/jobs.ts";
import * as versions from "../server/src/db/repos/versions.ts";
import { tx } from "../server/src/db/tx.ts";
import { type JudgeOutput, judgeFrames, judgeRuntime, loadJudgePrompt, prepareJudgeInput, runJudge, scoresOf } from "../server/src/eval/judge.ts";
import { type Aggregate, CRITERIA, type FrameMetrics, agreement, aggregateRuns, frameMetrics, mean, pairOrder } from "../server/src/eval/metrics.ts";
import { REFERENCE, anchorsFor } from "../server/src/eval/reference.ts";
import { registerHandlers } from "../server/src/jobs/handlers.ts";
import { enqueue, provideInput } from "../server/src/jobs/queue.ts";
import type { GenerateResult } from "../server/src/pipeline/generate.ts";
import { loadPng } from "../server/src/qa/image.ts";
import { newId } from "../server/src/scenes/ids.ts";
import { DEFAULT_PROJECT } from "../server/src/scenes/store.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Набор: 7 запросов, на которых шла настройка (Test 1/2, обобщение, первые отложенные), и 5
 * новых отложенных (`eval-*`) — заморожены, промпты по ним не настраиваются.
 */
const SET: Record<string, string> = {
  test1: "Создай премиальную анимацию роста пользователей с 10 000 до 1 000 000 за три года. Тёмный фон, крупная типографика, плавное движение графика, акцент на конечном значении",
  test2: "Покажи архитектуру AI-агента: пользователь отправляет запрос, оркестратор вызывает три инструмента, данные возвращаются обратно. Световые импульсы движутся по связям",
  "gen-compare": "Сравни монолит и микросервисы по скорости релизов",
  "gen-timeline": "Таймлайн развития компании 2015–2025 с пятью вехами",
  "gen-cache": "Объясни, как работает кэширование: запрос, промах, запись, попадание",
  "held-mobile": "Покажи, как растёт доля мобильного трафика: 2019 — 35%, 2024 — 68%",
  "held-queue": "Объясни, как работает очередь сообщений между сервисом заказов и складом",
  "eval-funnel": "Покажи воронку интернет-магазина: из 100 посетителей до покупки доходят только 3",
  "eval-oauth": "Объясни вход через OAuth: пользователь, приложение, сервер авторизации и токен доступа",
  "eval-cdn": "Сравни задержку загрузки для пользователя из Москвы: сервер во Франкфурте — 180 мс, CDN-узел в Москве — 15 мс",
  "eval-budget": "Как распределяется месячный бюджет семьи: жильё 35%, еда 25%, транспорт 15%, развлечения 10%, накопления 15%",
  "eval-abtest": "Итог A/B-теста новой кнопки оформления заказа: конверсия выросла с 5,0% до 5,6% — плюс 12%",
};
const HELD_OUT = new Set(Object.keys(SET).filter((s) => s.startsWith("eval-")));

// ---------- аргументы ----------
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
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
const judgeOnly = flag("--judge-only");
const noJudge = flag("--no-judge");
const rejudge = flag("--rejudge");
const runs = int("--runs", 3);
const parallel = int("--parallel", 3);
const judgeParallel = int("--judge-parallel", 6);
const judgeModel = opt("--judge-model") ?? "opus";
const only = opt("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
const runId = opt("--run") ?? `${calibrate ? "calib" : "eval"}-${stamp}-${sha}`;
if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(runId)) throw new Error(`--run: только латиница, цифры, _ . -: ${runId}`);

const dataDir = process.env.MS_DATA_DIR?.trim();
if (!dataDir) throw new Error("MS_DATA_DIR не задан");
const RUN_DIR = join(REPO, "tmp", "eval", runId);
mkdirSync(RUN_DIR, { recursive: true });
const log = (s: string) => console.log(`[eval ${runId}] ${s}`);

/** Сцены прогона: id → запрос (и для калибровки — оценка дизайнера). */
interface Item {
  id: string;
  /** Имя запроса (для leave-one-scene-out). */
  scene: string;
  prompt: string;
  ref?: number;
}
const items: Item[] = (calibrate
  ? REFERENCE.map((r) => ({ id: r.id, scene: r.scene, prompt: SET[r.scene]!, ref: r.grade }))
  : Object.entries(SET).map(([scene, prompt]) => ({ id: scene, scene, prompt }))
).filter((it) => !only || only.includes(it.id) || only.includes(it.scene));
if (items.length === 0) throw new Error(`--only: нет таких сцен: ${only?.join(", ")}`);
const dirOf = (it: Item) => join(RUN_DIR, it.id);

const readJson = <T,>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const writeJson = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");

writeJson(join(RUN_DIR, "run.json"), {
  run: runId, mode: calibrate ? "calibrate" : "eval", commit: sha, judge_model: judgeModel, judge_runs: runs,
  items: items.map((i) => ({ id: i.id, scene: i.scene, prompt: i.prompt, ref: i.ref ?? null, held_out: HELD_OUT.has(i.scene) })),
  updated_at: new Date().toISOString(),
});

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
}

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
  } satisfies GenInfo);
}

/** Генерация недостающих сцен настоящим пайплайном; уже готовые (gen.json) пропускаются. */
async function generateMissing(todo: Item[]): Promise<void> {
  if (todo.length === 0) return;
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
  try {
    if (core.reaped.alive.length > 0 || core.reaped.strays.length > 0) throw new Error("stale_process: остались процессы прежних прогонов; заверши их и повтори");
    const one = async (it: Item) => {
      const settings = defaultSettings();
      const t0 = Date.now();
      const job = tx(core.db, () => {
        const scene = core.repo.createScene(DEFAULT_PROJECT, { prompt: it.prompt, settings });
        return enqueue(core.db, { type: "playground.generate", projectId: DEFAULT_PROJECT, sceneId: scene.id, input: { sceneId: scene.id, prompt: it.prompt, settings }, idempotencyKey: `eval-${runId}-${it.id}-${newId("run")}` }).job;
      });
      mine.add(job.id);
      let j: Job | undefined;
      for (;;) {
        try {
          j = jobs.get(core.db, job.id);
        } catch {
          // storage_offline: база закрыта до возврата хранилища
        }
        if (j?.status === "awaiting_input") provideInput(core.db, j.id, "skip");
        else if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      const r = results.get(job.id);
      const [v] = versions.listByJob(core.db, job.id);
      const vdir = v ? join(core.root, v.path) : r?.versionDir;
      const out = dirOf(it);
      rmSync(out, { recursive: true, force: true });
      mkdirSync(out, { recursive: true });
      const runsCost = (core.db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM agent_runs WHERE job_id = ?").get(job.id) as { c: number }).c;
      if (vdir) {
        for (const f of ["preview.mp4", "spec.json", "qa.json", "manifest.json", "pipeline-log.json", "warnings.json"]) {
          if (existsSync(join(vdir, f))) copyFileSync(join(vdir, f), join(out, f));
        }
        if (existsSync(join(vdir, "src", "Scene.tsx"))) copyFileSync(join(vdir, "src", "Scene.tsx"), join(out, "Scene.tsx"));
      }
      const info: GenInfo = {
        status: existsSync(join(out, "preview.mp4")) ? (r?.status ?? j!.status) : "no_preview",
        job_status: j!.status, failure: r?.failure ?? j!.error ?? undefined, version_status: v?.status,
        cost_usd: runsCost, wall_ms: Date.now() - t0, engineer_calls: r?.engineerCalls,
        duration_frames: settings.duration_frames, fps: settings.fps.num / settings.fps.den, source: vdir ?? "",
      };
      // без превью gen.json не пишется: повторный запуск с --run сгенерирует сцену заново
      if (info.status !== "no_preview") writeJson(join(out, "gen.json"), info);
      else writeJson(join(out, "gen-failed.json"), info);
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
}

async function judgeStore(): Promise<string> {
  // отдельное хранилище судьи внутри MS_DATA_DIR: свои журналы и реестр процессов, без
  // owner lock основного (судью можно гонять, пока идёт генерация)
  const root = join(dataDir!, "eval");
  if (!existsSync(join(root, MARKER_FILE))) await initStore(root, macosProbe, {});
  return root;
}

async function judgeAll(todo: Item[]): Promise<void> {
  const config = loadConfig(process.env, await readConfigFile(dataDir!));
  const store = await judgeStore();
  const agents = judgeRuntime({ bin: config.claudeBin, logRoot: join(store, "logs"), systemPrompt: await loadJudgePrompt() });
  const tasks: { it: Item; k: number }[] = [];
  for (const it of todo) {
    const dir = dirOf(it);
    if (!existsSync(join(dir, "gen.json"))) {
      log(`${it.id}: нет превью — судья пропущен`);
      continue;
    }
    const gen = readJson<GenInfo>(join(dir, "gen.json"));
    if (rejudge) rmSync(join(dir, "judge-runs"), { recursive: true, force: true });
    if (!existsSync(join(dir, "judge", "sheets", "sheet-d.png"))) {
      await prepareJudgeInput(join(dir, "preview.mp4"), join(dir, "judge"), { prompt: it.prompt, duration_frames: gen.duration_frames, fps: gen.fps });
    }
    mkdirSync(join(dir, "judge-runs"), { recursive: true });
    for (let k = 1; k <= runs; k++) if (!existsSync(join(dir, "judge-runs", `${k}.json`))) tasks.push({ it, k });
  }
  log(`судья: ${tasks.length} вызовов (${judgeModel}, параллельно ${judgeParallel})`);
  const ac = new AbortController();
  process.once("SIGINT", () => ac.abort());
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const { it, k } = tasks[next++]!;
      const dir = dirOf(it);
      const gen = readJson<GenInfo>(join(dir, "gen.json"));
      const t0 = Date.now();
      const r = await runJudge({
        agents, dir: join(dir, "judge"), anchors: anchorsFor(it.scene), durationFrames: gen.duration_frames, model: judgeModel,
        runRef: { root: store, runId: `${runId}.${it.id}.${k}`, attempt: 1 }, signal: ac.signal,
      });
      const file: JudgeRunFile = { status: r.status, output: r.output, error: r.error, cost_usd: r.usage.costUsd, model: r.usage.model, wall_ms: Date.now() - t0 };
      // неудачный вызов не сохраняется как результат: повтор запуска его переделает
      if (r.status === "completed" && r.output) writeJson(join(dir, "judge-runs", `${k}.json`), file);
      else writeJson(join(dir, "judge-runs", `${k}.failed.json`), file);
      log(`судья ${it.id} #${k}: ${r.status}${r.output ? ` overall ${r.output.overall}` : ` ${r.error?.message ?? ""}`} ($${r.usage.costUsd.toFixed(2)})`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(judgeParallel, tasks.length) }, worker));
}

// ---------- итоги ----------
interface Row {
  id: string;
  scene: string;
  held_out: boolean;
  ref: number | null;
  judge: Aggregate | null;
  judge_cost_usd: number;
  gen: GenInfo | null;
  frames: FrameMetrics | null;
  top_defects: string[];
}

async function collect(): Promise<Row[]> {
  const rows: Row[] = [];
  for (const it of items) {
    const dir = dirOf(it);
    const gen = existsSync(join(dir, "gen.json")) ? readJson<GenInfo>(join(dir, "gen.json")) : null;
    const runFiles = existsSync(join(dir, "judge-runs")) ? readdirSync(join(dir, "judge-runs")).filter((f) => /^\d+\.json$/.test(f)).sort() : [];
    const outs = runFiles.map((f) => readJson<JudgeRunFile>(join(dir, "judge-runs", f)));
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
      id: it.id, scene: it.scene, held_out: HELD_OUT.has(it.scene), ref: it.ref ?? null,
      judge: outs.length > 0 ? aggregateRuns(outs.map((o) => scoresOf(o.output!))) : null,
      judge_cost_usd: outs.reduce((a, o) => a + o.cost_usd, 0),
      gen, frames, top_defects: last ? last.top_defects.slice(0, 3).map((d) => `${d.frame}: ${d.text}`) : [],
    });
  }
  return rows;
}

const f1 = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? "—" : x.toFixed(d));

function report(rows: Row[]): { md: string; summary: Record<string, unknown> } {
  const judged = rows.filter((r) => r.judge);
  const summary: Record<string, unknown> = {
    run: runId, commit: sha, judge_model: judgeModel, judge_runs: runs, scenes: rows.length, judged: judged.length,
    mean: judged.length ? mean(judged.map((r) => r.judge!.overall)) : null,
    mean_tuned: judged.filter((r) => !r.held_out).length ? mean(judged.filter((r) => !r.held_out).map((r) => r.judge!.overall)) : null,
    mean_held_out: judged.filter((r) => r.held_out).length ? mean(judged.filter((r) => r.held_out).map((r) => r.judge!.overall)) : null,
    max_spread: judged.length ? Math.max(...judged.map((r) => r.judge!.spread)) : null,
    gen_cost_usd: rows.reduce((a, r) => a + (r.gen?.cost_usd ?? 0), 0),
    judge_cost_usd: rows.reduce((a, r) => a + r.judge_cost_usd, 0),
  };
  const withRef = judged.filter((r) => r.ref !== null);
  if (withRef.length >= 2) {
    summary.agreement = agreement(withRef.map((r) => ({ id: r.id, judge: r.judge!.overall, ref: r.ref! })));
    const pairs = [...new Set(withRef.map((r) => r.scene))].flatMap((s) => {
      const a = withRef.find((r) => r.scene === s && r.id.startsWith("r1-"));
      const b = withRef.find((r) => r.scene === s && r.id.startsWith("r2-"));
      return a && b ? [{ id: s, a: a.judge!, b: b.judge!, ref: [a.ref!, b.ref!] as [number, number] }] : [];
    });
    if (pairs.length > 0) {
      summary.pair_order = pairOrder(pairs.map((p) => ({ id: p.id, judge: [p.a.overall, p.b.overall], ref: p.ref })));
      // медианы с шагом 0.5 часто равны — порядок по средним прогонов
      summary.pair_order_mean = pairOrder(pairs.map((p) => ({ id: p.id, judge: [p.a.mean, p.b.mean], ref: p.ref })));
    }
  }
  const head = ["Сцена", ...(withRef.length ? ["Дизайнер"] : []), "Судья (медиана)", "Прогоны", "Разброс", ...CRITERIA.map((c) => c.slice(0, 5)), "Ген. $", "Статус", "Кадр 0", "Hold Δ", "Пустые трети"];
  const lines = [
    `# Eval ${runId}`,
    "",
    `Коммит \`${sha}\`, судья \`${judgeModel}\` × ${runs}, ${new Date().toISOString().slice(0, 10)}.`,
    "",
    `Среднее: **${f1(summary.mean as number | null, 2)}** (настроенные ${f1(summary.mean_tuned as number | null, 2)}, отложенные ${f1(summary.mean_held_out as number | null, 2)}); макс. разброс прогонов ${f1(summary.max_spread as number | null)}; генерация $${(summary.gen_cost_usd as number).toFixed(2)}, судья $${(summary.judge_cost_usd as number).toFixed(2)}.`,
    "",
  ];
  if (summary.agreement) {
    const a = summary.agreement as ReturnType<typeof agreement>;
    const p = summary.pair_order as ReturnType<typeof pairOrder> | undefined;
    const pm = summary.pair_order_mean as ReturnType<typeof pairOrder> | undefined;
    const po = (x: ReturnType<typeof pairOrder>) => `${x.correct}/${x.total}${x.wrong.length ? ` (мимо: ${x.wrong.join(", ")})` : ""}`;
    lines.push(`Согласие с дизайнером: MAE **${a.mae.toFixed(2)}** (цель ≤ 0.7), Spearman **${a.spearman.toFixed(2)}** (цель ≥ 0.6), смещение ${a.bias >= 0 ? "+" : ""}${a.bias.toFixed(2)}, худшая ${a.worst.id} (${a.worst.err.toFixed(1)})${p && pm ? `; порядок R1→R2 по медианам ${po(p)}, по средним ${po(pm)}` : ""}.`, "");
  }
  lines.push(`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`);
  for (const r of rows) {
    const j = r.judge;
    lines.push(`| ${r.id}${r.held_out ? " (отл.)" : ""} | ${withRef.length ? `${f1(r.ref)} | ` : ""}${f1(j?.overall)} | ${j ? j.runs.join(" / ") : "—"} | ${f1(j?.spread)} | ${CRITERIA.map((c) => f1(j?.criteria[c])).join(" | ")} | ${f1(r.gen?.cost_usd, 2)} | ${r.gen?.job_status ?? r.gen?.status ?? "нет"} | ${f1(r.frames?.frame0Content, 3)} | ${f1(r.frames?.holdDelta, 4)} | ${f1(r.frames?.emptyThirdShare, 2)} |`);
  }
  lines.push("", "## Главные дефекты по судье (последний прогон)", "");
  for (const r of rows) if (r.top_defects.length) lines.push(`- **${r.id}**: ${r.top_defects.join("; ")}`);
  return { md: lines.join("\n") + "\n", summary };
}

// ---------- ход ----------
if (calibrate) items.forEach(fromGit);
else if (!judgeOnly) await generateMissing(items.filter((it) => !existsSync(join(dirOf(it), "gen.json"))));
if (!noJudge) await judgeAll(items);
const rows = await collect();
const { md, summary } = report(rows);
writeJson(join(RUN_DIR, "scores.json"), { summary, rows });
writeFileSync(join(RUN_DIR, "scores.md"), md);
console.log(md);
if (flag("--write-evidence")) {
  const ev = join(REPO, "docs", "evidence", "phase-1", "eval", runId);
  mkdirSync(ev, { recursive: true });
  copyFileSync(join(RUN_DIR, "scores.json"), join(ev, "scores.json"));
  copyFileSync(join(RUN_DIR, "scores.md"), join(ev, "scores.md"));
  log(`evidence: ${ev}`);
}
