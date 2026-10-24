// Приёмка правок (Task 18, `09` §4 — Test 3) по-настоящему: bootCore на реальном хранилище
// (внешний SSD), задачи через очередь и раннер, реальный claude и реальный рендер. Сцена Test 2
// (v1) → правка «сделай всё в фиолетовых тонах» (v2) → промпт Test 3 дословно (v3); затем
// восстановление v1 (v4) без LLM.
// Запуск: `MS_E2E=1 vitest run server/test/pipeline/edit.e2e.test.ts` (или `make e2e`).
// Evidence — tmp/pipeline-evidence/test3/; в docs/evidence/phase-1/pipeline/test3/ — только с
// MS_WRITE_EVIDENCE=1. MS_E2E_T18_SCENE=<scn_…> — продолжить на готовой сцене: версии с теми
// же промптами берутся из истории, недостающие делаются заново.
import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Job, type MotionSpec, type ScenePropsBase, type StyleBible, type VersionManifest, defaultSettings, scaleContentFrames } from "@ms/contracts";
import { ensureRenderBrowser, ffprobe, renderVersion } from "@ms/render";
import { type Core, bootCore } from "../../src/boot.js";
import * as chat from "../../src/db/repos/chat.js";
import * as jobEvents from "../../src/db/repos/job-events.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as versions from "../../src/db/repos/versions.js";
import { tx } from "../../src/db/tx.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import { enqueue, provideInput } from "../../src/jobs/queue.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { checkPreserve, compareHoldLayout } from "../../src/pipeline/preserve.js";
import { type LayoutFrame, parseLayout } from "../../src/qa/layout.js";
import { newId } from "../../src/scenes/ids.js";
import { DEFAULT_PROJECT, readVersion } from "../../src/scenes/store.js";

const T = 120 * 60_000;
const DATA_DIR = process.env.MS_DATA_DIR ?? "/Volumes/External SSD/MotionStudio";
const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const EVIDENCE = join(REPO, process.env.MS_WRITE_EVIDENCE === "1" ? "docs/evidence/phase-1/pipeline/test3" : "tmp/pipeline-evidence/test3");

const TEST2 =
  "Покажи архитектуру AI-агента: пользователь отправляет запрос, оркестратор вызывает три инструмента, данные возвращаются обратно. Световые импульсы движутся по связям";
const PURPLE = "сделай всё в фиолетовых тонах";
const TEST3 = "Уменьши скорость анимации на 25 %, сделай карточки более объёмными, сохрани композицию и верни цветовую палитру из первой версии";

interface V {
  name: string;
  job?: Job;
  row: versions.VersionRow;
  dir: string;
  manifest: VersionManifest;
  spec: MotionSpec;
  props: ScenePropsBase;
  style: StyleBible & { depth: number };
  wallMs: number;
}

let core: Core;
const mine = new Set<string>();
let sceneId = process.env.MS_E2E_T18_SCENE ?? "";
const got: Record<string, V> = {};
const readJson = <T>(p: string) => JSON.parse(readFileSync(p, "utf8")) as T;

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

async function wait(id: string): Promise<Job> {
  mine.add(id);
  for (;;) {
    let j: Job | undefined;
    try {
      j = jobs.get(core.db, id)!;
    } catch {
      // storage_offline: база закрыта до возврата хранилища
    }
    if (j?.status === "awaiting_input") provideInput(core.db, j.id, "skip");
    else if (j && ["completed", "failed", "cancelled", "blocked"].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

function load(name: string, row: versions.VersionRow, job: Job | undefined, wallMs: number): V {
  const dir = join(DATA_DIR, row.path);
  return {
    name, job, row, dir, wallMs,
    manifest: readJson<VersionManifest>(join(dir, "manifest.json")),
    spec: readJson<MotionSpec>(join(dir, "spec.json")),
    props: readJson<ScenePropsBase>(join(dir, "props.json")),
    style: readJson<StyleBible & { depth: number }>(join(dir, "style.json")),
  };
}

/** Версия сцены с этим промптом (продолжение прогона) или новая задача. */
async function step(name: string, prompt: string, make: () => string): Promise<V> {
  const existing = sceneId ? versions.listByScene(core.db, sceneId).filter((v) => v.prompt === prompt && v.status === "ready").at(-1) : undefined;
  if (existing) {
    console.log(`${name}: из истории — ${existing.id} (v${existing.number})`);
    return load(name, existing, undefined, 0);
  }
  const t0 = Date.now();
  const job = await wait(make());
  const wallMs = Date.now() - t0;
  console.log(`${name}: ${job.status} за ${(wallMs / 60000).toFixed(1)} мин; ${JSON.stringify(job.error ?? job.output_refs)}`);
  expect(job.status, `${name}: ${JSON.stringify(job.error)}`).toBe("completed");
  const [row] = versions.listByJob(core.db, job.id);
  return load(name, row!, job, wallMs);
}

function edit(text: string): string {
  return tx(core.db, () => {
    const m = chat.add(core.db, { scene_id: sceneId, role: "user", text });
    return enqueue(core.db, { type: "playground.edit", projectId: DEFAULT_PROJECT, sceneId, input: { sceneId, messageId: m.id }, idempotencyKey: `e2e-t18-${newId("run")}` }).job.id;
  });
}

/**
 * Реестр раскладки кадра hold (N−1) версии — тот же рендер-проба, что у пайплайна правки
 * (`preserveHold`): только этот кадр, без превью, в каталог tmp/ (версия только читается).
 */
async function holdLayout(v: V): Promise<LayoutFrame> {
  const s = v.manifest.settings;
  const last = s.duration_frames - 1;
  mkdirSync(join(REPO, "tmp"), { recursive: true });
  const out = mkdtempSync(join(REPO, "tmp", `t18-hold-${v.name}-`));
  try {
    const r = await renderVersion({
      versionDir: v.dir, outDir: out, settings: s, cacheDir: join(DATA_DIR, "cache"), stills: [last], preview: null, timeoutMs: 5 * 60_000,
      run: { root: DATA_DIR, runId: `e2e-t18-hold-${newId("run")}`, attempt: 1 },
    });
    expect(r.ok, JSON.stringify(r.error)).toBe(true);
    const f = parseLayout(r.browserLogs).find((x) => x.frame === last);
    expect(f, `нет реестра кадра ${last} у ${v.name}`).toBeDefined();
    return f!;
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

/** Значение по пути вида `content.flows[0].travel` (пути `scaleContentFrames`). */
function at(content: unknown, path: string): unknown {
  let v: unknown = { content };
  for (const m of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) v = (v as Record<string, unknown> | undefined)?.[m[1] ?? m[2]!];
  return v;
}

/** Глубина версии: props.style.depth (у kit «объём» — тени и перспектива от depth). */
const depthOf = (v: V) => v.props.style.depth;

async function saveEvidence(v: V): Promise<void> {
  const out = join(EVIDENCE, v.name);
  await rm(out, { recursive: true, force: true });
  mkdirSync(join(out, "frames"), { recursive: true });
  if (v.job) {
    const runs = core.db.prepare("SELECT role, model, status, input_tokens, output_tokens, cost_usd, started_at, finished_at FROM agent_runs WHERE job_id = ? ORDER BY started_at").all(v.job.id) as { cost_usd: number }[];
    writeFileSync(join(out, "job.json"), JSON.stringify({
      job: v.job, wall_ms: v.wallMs, cost_usd: runs.reduce((a, r) => a + (r.cost_usd ?? 0), 0), agent_runs: runs,
      render_jobs: core.db.prepare("SELECT kind, codec, width, height, frames, duration_ms FROM render_jobs WHERE job_id = ?").all(v.job.id),
      chat: chat.list(core.db, sceneId).filter((m) => m.job_id === v.job!.id || m.role === "user"),
      events: jobEvents.listSince(core.db, 0, { jobId: v.job.id, limit: 1000 }).filter((e) => e.kind !== "progress").map((e) => ({ ts: e.ts, level: e.level, kind: e.kind, message: e.message })),
    }, null, 2) + "\n");
  }
  for (const f of ["manifest.json", "spec.json", "selection.json", "knowledge-refs.json", "qa.json", "style.json", "props.json", "pipeline-log.json", "warnings.json"]) {
    if (existsSync(join(v.dir, f))) copyFileSync(join(v.dir, f), join(out, f));
  }
  for (const f of v.manifest.qa_frames ?? []) {
    await promisify(execFile)("/usr/bin/sips", ["-Z", "960", join(v.dir, "frames", `${f}.png`), "--out", join(out, "frames", `${f}.png`)]);
  }
  const preview = join(v.dir, "preview.mp4");
  if (existsSync(preview)) {
    if (statSync(preview).size <= 10 * 1024 * 1024) copyFileSync(preview, join(out, "preview.mp4"));
    writeFileSync(join(out, "preview.ffprobe.json"), JSON.stringify(await ffprobe(preview), null, 2) + "\n");
  }
}

describe("playground.edit: Test 3 (09 §4), реальные модели и рендер", () => {
  it("Test 2 → «фиолетовые тона» → Test 3: parent, скорость −25 %, палитра v1, объём, композиция, gate", async () => {
    // v1 — сцена Test 2
    const v1 = await step("v1", TEST2, () => tx(core.db, () => {
      const scene = core.repo.createScene(DEFAULT_PROJECT, { prompt: TEST2, settings: defaultSettings() });
      sceneId = scene.id;
      return enqueue(core.db, { type: "playground.generate", projectId: DEFAULT_PROJECT, sceneId, input: { sceneId, prompt: TEST2, settings: defaultSettings() }, idempotencyKey: `e2e-t18-${newId("run")}` }).job.id;
    }));
    console.log(`сцена ${sceneId}`);
    got.v1 = v1;
    expect(v1.manifest.status).toBe("ready");

    // v2 — палитра отдельной правкой
    const v2 = await step("v2", PURPLE, () => edit(PURPLE));
    got.v2 = v2;
    expect(v2.manifest.parent_version_id).toBe(v1.manifest.version_id);
    expect(v2.style.palette).not.toEqual(v1.style.palette);
    console.log(`v2: путь ${(v2.manifest.edit_plan as { path?: string }).path}; палитра ${JSON.stringify(v2.style.palette)}`);

    // v3 — промпт Test 3 дословно
    const v3 = await step("v3", TEST3, () => edit(TEST3));
    got.v3 = v3;
    console.log(`v3: план ${JSON.stringify(v3.manifest.edit_plan)}`);
    expect(v3.manifest.parent_version_id).toBe(v2.manifest.version_id);
    expect(Math.abs(v3.spec.duration_frames - Math.round(v2.spec.duration_frames / 0.75))).toBeLessThanOrEqual(1);
    expect(v3.manifest.settings.duration_frames).toBe(v3.spec.duration_frames); // H4: probeGate идёт по settings
    expect(v3.spec.beats).toHaveLength(v2.spec.beats.length);
    v3.spec.beats.forEach((b, i) => expect(Math.abs(b.end_frame - Math.round(v2.spec.beats[i]!.end_frame / 0.75))).toBeLessThanOrEqual(1));
    expect(v3.style.palette).toEqual(v1.style.palette);
    expect(depthOf(v3)).toBeGreaterThan(depthOf(v2));
    // композиция — по тому, что сцена рисует (I1): раскладка props.content и spec ± 2 %, затем
    // реестр раскладки кадра hold v2 и v3 (позиции текстов, не пиксели — палитра другая)
    const size = { width: v3.manifest.settings.width, height: v3.manifest.settings.height };
    expect(checkPreserve(v2.spec, v3.spec, v2.props, v3.props, ["composition"], 0.02, { size })).toEqual([]);
    const [h2, h3] = [await holdLayout(v2), await holdLayout(v3)];
    console.log(`кадр hold v2/${h2.frame}: ${h2.items.length} текстов; v3/${h3.frame}: ${h3.items.length}`);
    expect(h2.items.length).toBeGreaterThan(0);
    expect(compareHoldLayout(h2, h3, size)).toEqual([]);
    // пайплайн правки сам сверил кадр hold с базой (а не только этот тест)
    expect(readFileSync(join(v3.dir, "pipeline-log.json"), "utf8")).toMatch(/сверка кадра hold базы \d+ ↔ \d+: \d+ → \d+ текстов, расхождений 0/);
    // скорость −25 % — и кадровые величины content (I2): travel, stagger… × 4/3
    if ((v3.manifest.edit_plan as { path?: string }).path === "param") {
      const factor = (v3.manifest.edit_plan as { timing_scale?: number }).timing_scale ?? v3.spec.duration_frames / v2.spec.duration_frames;
      const want = scaleContentFrames(v2.props.content, factor);
      console.log(`кадровые величины content × ${factor.toFixed(3)}: ${want.scaled.length} (${want.scaled.slice(0, 6).join(", ")}…)`);
      expect(want.scaled.length).toBeGreaterThan(0);
      for (const path of want.scaled) expect(at(v3.props.content, path), path).toBe(at(want.content, path));
    }
    expect(v3.manifest.qa?.technical).toBe("pass");
    const probe = await ffprobe(join(v3.dir, "preview.mp4"));
    expect(Math.abs(probe.durationMs - (v3.spec.duration_frames * 1000) / 30)).toBeLessThanOrEqual(1000 / 30 + 1);
    for (const v of [v1, v2]) expect((await readVersion(v.dir)).files.length).toBeGreaterThan(0);
  }, T);

  it("восстановление v1 → новая версия-копия от v1, current, история цела", async () => {
    const v1 = got.v1!;
    const before = versions.listByScene(core.db, sceneId);
    const id = tx(core.db, () => enqueue(core.db, { type: "scene.restore", projectId: DEFAULT_PROJECT, sceneId, input: { sceneId, versionId: v1.row.id }, idempotencyKey: `e2e-t18-${newId("run")}` }).job.id);
    const t0 = Date.now();
    const job = await wait(id);
    console.log(`restore: ${job.status} за ${((Date.now() - t0) / 1000).toFixed(1)} с; ${JSON.stringify(job.error ?? job.output_refs)}`);
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const after = versions.listByScene(core.db, sceneId);
    expect(after).toHaveLength(before.length + 1);
    const v4 = after.at(-1)!;
    expect(v4).toMatchObject({ parent_version_id: v1.row.id, status: "ready", edit_plan: { kind: "restore", base_version_id: v1.row.id } });
    expect(scenes.get(core.db, sceneId)!.current_version_id).toBe(v4.id);
    for (const v of after) expect((await readVersion(join(DATA_DIR, v.path))).files.length).toBeGreaterThan(0);
    got.v4 = load("v4-restore", v4, job, Date.now() - t0);
  }, T);

  afterAll(async () => {
    for (const v of Object.values(got)) await saveEvidence(v);
    if (got.v1) writeFileSync(join(EVIDENCE, "scene.json"), JSON.stringify({ scene_id: sceneId, versions: Object.fromEntries(Object.entries(got).map(([k, v]) => [k, { id: v.row.id, number: v.row.number, prompt: v.row.prompt }])) }, null, 2) + "\n");
  }, T);
});
