// Приёмка пайплайна playground.generate по-настоящему: bootCore на реальном хранилище
// (внешний SSD), задача через очередь и раннер, реальный claude (Concept, Visual QA —
// sonnet; Director, Engineer — opus по config), реальный рендер Remotion и ffprobe.
// Промпты — Test 1 и Test 2 из docs/architecture/09-acceptance-tests.md дословно; обе задачи
// идут параллельно в одном раннере (одно ядро держит owner lock хранилища).
// Запуск: `make e2e`. Evidence — tmp/pipeline-evidence/{test1,test2}/; в
// docs/evidence/phase-1/pipeline/ — только с MS_WRITE_EVIDENCE=1.
// MS_E2E_GENERALIZE=1 — ещё три разноплановых запроса (gen-compare, gen-timeline, gen-cache):
// проверка, что промпты не настроены под Test 1/2; идут параллельно с ними.
// MS_E2E_HOLDOUT=1 — отложенные запросы, на которых промпты не настраивались (Fix F).
// MS_E2E_ONLY=a,b — только эти сцены (повтор части прогона).
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Job, type MotionSpec, type QAReport, type Settings, type VersionManifest, defaultSettings } from "@ms/contracts";
import { ensureRenderBrowser, ffprobe } from "@ms/render";
import { type Core, bootCore } from "../../src/boot.js";
import * as chat from "../../src/db/repos/chat.js";
import * as jobEvents from "../../src/db/repos/job-events.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as versions from "../../src/db/repos/versions.js";
import { tx } from "../../src/db/tx.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue, provideInput } from "../../src/jobs/queue.js";
import { countStarts, inBeat } from "../../src/pipeline/qa-frames.js";
import { loadPng, lumaStats } from "../../src/qa/image.js";
import { specChecks } from "../../src/qa/spec-checks.js";
import { newId } from "../../src/scenes/ids.js";
import { DEFAULT_PROJECT } from "../../src/scenes/store.js";

const T = 90 * 60_000;
const DATA_DIR = process.env.MS_DATA_DIR ?? "/Volumes/External SSD/MotionStudio";
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
// закоммиченное evidence переписывается только явно: иначе каждый `make e2e` менял бы docs/
const EVIDENCE = process.env.MS_WRITE_EVIDENCE === "1" ? join(REPO, "docs/evidence/phase-1/pipeline") : join(REPO, "tmp/pipeline-evidence");

const TEST1 =
  "Создай премиальную анимацию роста пользователей с 10 000 до 1 000 000 за три года. Тёмный фон, крупная типографика, плавное движение графика, акцент на конечном значении";
const TEST2 =
  "Покажи архитектуру AI-агента: пользователь отправляет запрос, оркестратор вызывает три инструмента, данные возвращаются обратно. Световые импульсы движутся по связям";

/** Запросы проверки обобщения (не из 09): сравнение, таймлайн, процесс с ветвлением. */
const GENERALIZE: Record<string, string> = {
  "gen-compare": "Сравни монолит и микросервисы по скорости релизов",
  "gen-timeline": "Таймлайн развития компании 2015–2025 с пятью вехами",
  "gen-cache": "Объясни, как работает кэширование: запрос, промах, запись, попадание",
};
/** Отложенная проверка обобщения: на этих запросах промпты не настраивались. */
const HOLDOUT: Record<string, string> = {
  "held-mobile": "Покажи, как растёт доля мобильного трафика: 2019 — 35%, 2024 — 68%",
  "held-queue": "Объясни, как работает очередь сообщений между сервисом заказов и складом",
};
const generalize = process.env.MS_E2E_GENERALIZE === "1";
const only = process.env.MS_E2E_ONLY?.split(",").map((x) => x.trim()).filter(Boolean);
const want = (name: string) => only === undefined || only.includes(name);
const EXTRA: Record<string, string> = Object.fromEntries(
  Object.entries({ ...(generalize ? GENERALIZE : {}), ...(process.env.MS_E2E_HOLDOUT === "1" ? HOLDOUT : {}) }).filter(([n]) => want(n)),
);
const BASE = Object.entries({ test1: TEST1, test2: TEST2 }).filter(([n]) => want(n));

interface Outcome {
  job: Job;
  dir: string;
  manifest: VersionManifest;
  spec: MotionSpec;
  qa: QAReport;
  settings: Settings;
  wallMs: number;
  /** Версий, опубликованных задачей (попытки не дублируют публикацию). */
  versions: number;
}

let core: Core;
const mine = new Set<string>();
const outcomes = new Map<string, Outcome>();
const started = new Map<string, Promise<Outcome>>();
/** Задача запускается один раз; все пять идут параллельно в одном раннере. */
const run = (name: string, prompt: string) => {
  if (!started.has(name)) started.set(name, generate(name, prompt));
  return started.get(name)!;
};

const readJson = <T>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;
const ocrTexts = (qa: QAReport, frame: number) => qa.ocr.find((o) => o.frame === frame)?.texts ?? [];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

beforeAll(async () => {
  expect(existsSync("/Volumes/External SSD"), "внешний SSD не подключён").toBe(true);
  await ensureRenderBrowser();
  core = await bootCore({
    env: { ...process.env, MS_DATA_DIR: DATA_DIR },
    kind: "cli",
    runner: { onlyIds: mine },
    handlers: (svc) => registerHandlers(svc, { log: (l) => console.log(`  ${l}`) }),
    storageLog: (l) => console.log(`  [storage] ${l}`),
  });
}, T);

afterAll(async () => {
  await core?.close();
});

/** Сцена и задача, как у API/CLI; уточнения Concept пропускаются (ответы по умолчанию). */
async function generate(name: string, prompt: string): Promise<Outcome> {
  const settings = defaultSettings();
  const t0 = Date.now();
  const job = tx(core.db, () => {
    const scene = core.repo.createScene(DEFAULT_PROJECT, { prompt, settings });
    return enqueue(core.db, { type: "playground.generate", projectId: DEFAULT_PROJECT, sceneId: scene.id, input: { sceneId: scene.id, prompt, settings }, idempotencyKey: `e2e-${name}-${newId("run")}` }).job;
  });
  mine.add(job.id);
  for (;;) {
    let j: Job | undefined;
    try {
      j = jobs.get(core.db, job.id)!;
    } catch {
      // storage_offline: база закрыта до возврата хранилища — задачу разберёт восстановление
    }
    if (j?.status === "awaiting_input") provideInput(core.db, j.id, "skip");
    else if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  const j = jobs.get(core.db, job.id)!;
  const byJob = versions.listByJob(core.db, j.id);
  const [v] = byJob;
  const dir = v ? join(DATA_DIR, v.path) : "";
  const outcome = {
    job: j, dir, settings, wallMs: Date.now() - t0, versions: byJob.length,
    manifest: v ? readJson<VersionManifest>(join(dir, "manifest.json")) : ({} as VersionManifest),
    spec: v ? readJson<MotionSpec>(join(dir, "spec.json")) : ({} as MotionSpec),
    qa: v && existsSync(join(dir, "qa.json")) ? readJson<QAReport>(join(dir, "qa.json")) : ({ ocr: [], issues: [] } as unknown as QAReport),
  };
  await saveEvidence(name, outcome);
  return outcome;
}

/** Evidence: кадры (960 px), manifest, spec, QA, props, код, журнал задачи и стоимость, превью ≤ 10 МБ. */
async function saveEvidence(name: string, o: Outcome): Promise<void> {
  const out = join(EVIDENCE, name);
  await rm(out, { recursive: true, force: true });
  mkdirSync(join(out, "frames"), { recursive: true });
  const runs = core.db.prepare("SELECT role, model, status, input_tokens, output_tokens, cost_usd, started_at, finished_at FROM agent_runs WHERE job_id = ? ORDER BY started_at").all(o.job.id) as { cost_usd: number }[];
  const job = {
    job: o.job,
    wall_ms: o.wallMs,
    cost_usd: runs.reduce((a, r) => a + (r.cost_usd ?? 0), 0),
    agent_runs: runs,
    render_jobs: core.db.prepare("SELECT kind, codec, width, height, frames, duration_ms FROM render_jobs WHERE job_id = ?").all(o.job.id),
    qa_reports: core.db.prepare("SELECT q.* FROM qa_reports q JOIN scene_versions v ON v.id = q.version_id WHERE v.created_by_job_id = ?").all(o.job.id),
    component_tests: core.db.prepare("SELECT * FROM component_tests").all(),
    chat: o.job.scene_id ? chat.list(core.db, o.job.scene_id) : [],
    events: jobEvents.listSince(core.db, 0, { jobId: o.job.id, limit: 1000 }).filter((e) => e.kind !== "progress").map((e) => ({ ts: e.ts, level: e.level, kind: e.kind, message: e.message })),
  };
  writeFileSync(join(out, "job.json"), JSON.stringify(job, null, 2) + "\n");
  if (!o.dir) return;
  for (const f of ["manifest.json", "spec.json", "selection.json", "knowledge-refs.json", "qa.json", "style.json", "props.json", "pipeline-log.json", "warnings.json"]) {
    if (existsSync(join(o.dir, f))) copyFileSync(join(o.dir, f), join(out, f));
  }
  if (existsSync(join(o.dir, "src", "Scene.tsx"))) copyFileSync(join(o.dir, "src", "Scene.tsx"), join(out, "Scene.tsx"));
  for (const f of o.manifest.qa_frames ?? []) {
    await promisify(execFile)("/usr/bin/sips", ["-Z", "960", join(o.dir, "frames", `${f}.png`), "--out", join(out, "frames", `${f}.png`)]);
  }
  const preview = join(o.dir, "preview.mp4");
  if (existsSync(preview)) {
    if (statSync(preview).size <= 10 * 1024 * 1024) copyFileSync(preview, join(out, "preview.mp4"));
    writeFileSync(join(out, "preview.ffprobe.json"), JSON.stringify(await ffprobe(preview), null, 2) + "\n");
  }
}

describe.runIf(BASE.length > 0)("playground.generate: Test 1 и Test 2 (09 §2–3), реальные модели и рендер", () => {
  it("задачи проходят очередь и завершаются ready", async () => {
    for (const [name, prompt] of Object.entries(EXTRA)) void run(name, prompt).catch(() => undefined);
    const done = await Promise.all(BASE.map(([name, prompt]) => run(name, prompt)));
    BASE.forEach(([name], i) => outcomes.set(name, done[i]!));
    for (const [name, o] of outcomes) {
      console.log(`${name}: ${o.job.status} за ${(o.wallMs / 60000).toFixed(1)} мин; ${JSON.stringify(o.job.error ?? o.job.output_refs)}`);
      expect(o.job.status, `${name}: ${JSON.stringify(o.job.error)}`).toBe("completed");
      expect(o.manifest.status).toBe("ready");
      expect(o.versions, `${name}: версий задачи`).toBe(1);
      expect(o.manifest.knowledge_refs.length).toBeGreaterThan(0);
      expect(o.manifest.qa?.technical).toBe("pass");
    }
  }, T);

  it.runIf(want("test1"))("Test 1: график в битах, тёмный фон, OCR «10 000» в начале счёта и «1 000 000» в конце", async () => {
    const o = outcomes.get("test1")!;
    expect(o.spec.beats.some((b) => /chart|graph|график/i.test(b.action))).toBe(true);
    const frames = o.manifest.qa_frames;
    const lumas = await Promise.all(frames.map((f) => loadPng(join(o.dir, "frames", `${f}.png`)).then(lumaStats)));
    expect(mean(lumas.map((s) => s.mean))).toBeLessThan(0.25);
    // кадр начала счёта (selectQaFrames берёт его в QA-кадры: на экране значение «от»)
    const count = countStarts(o.spec)[0]!;
    const firstNumberFrame = frames.find((f) => f >= count.start_frame && inBeat(count, f, o.spec.duration_frames))!;
    const lastFrame = Math.max(...frames);
    console.log(`Test 1 OCR: кадр ${firstNumberFrame} ${JSON.stringify(ocrTexts(o.qa, firstNumberFrame))}; кадр ${lastFrame} ${JSON.stringify(ocrTexts(o.qa, lastFrame))}`);
    expect(ocrTexts(o.qa, firstNumberFrame)).toContainEqual(expect.stringMatching(/10\s?000/));
    expect(ocrTexts(o.qa, lastFrame)).toContainEqual(expect.stringMatching(/1\s?000\s?000/));
  }, T);

  it.runIf(want("test2"))("Test 2: ≥ 5 узлов, без перекрытий раскладки, в knowledge-refs — запись паттерна system-structure", async () => {
    const o = outcomes.get("test2")!;
    expect(o.spec.elements.filter((e) => e.kind === "card" || e.role.startsWith("node")).length).toBeGreaterThanOrEqual(5);
    expect(specChecks(o.spec, o.settings).filter((i) => i.code === "overlap")).toEqual([]);
    const refs = readJson<{ kb_id: string }[]>(join(o.dir, "knowledge-refs.json"));
    expect(refs.some((r) => core.kb.getCapability(r.kb_id)!.patterns.includes("system-structure"))).toBe(true);
  }, T);
});

describe.runIf(Object.keys(EXTRA).length > 0)("playground.generate: обобщение на новые запросы", () => {
  it.each(Object.keys(EXTRA))("%s: ready, technical pass, spec без blocking", async (name) => {
    const o = await run(name, EXTRA[name]!);
    console.log(`${name}: ${o.job.status} за ${(o.wallMs / 60000).toFixed(1)} мин; ${JSON.stringify(o.job.error ?? o.job.output_refs)}`);
    expect(o.job.status, `${name}: ${JSON.stringify(o.job.error)}`).toBe("completed");
    expect(o.manifest.status).toBe("ready");
    expect(o.versions).toBe(1);
    expect(o.manifest.qa?.technical).toBe("pass");
    expect(specChecks(o.spec, o.settings).filter((i) => i.severity === "blocking")).toEqual([]);
  }, T);
});
