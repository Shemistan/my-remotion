// Task 37′: `playground.generate` со входом `video` (ADR 0009, Р-V1): бриф по плану, стиль
// проекта, окно речи и моменты слов, графика в `props.layout.rect`, проверки по альфе и
// кадры-композиты для Visual QA, отпечаток после публикации. Вход `script` — как до задачи.
// Фейковые агенты и рендер (альфа — PNG с прозрачностью вне прямоугольника графики).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_READING, type NormRect, QAReportSchema, type ScenePlanItem, type ScriptPlanRevisionDoc, type Settings, type VideoSceneContext, ZONE_RECTS, defaultSettings } from "@ms/contracts";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { scriptPlans } from "../../src/db/repos/script.js";
import { videoScenes } from "../../src/db/repos/video.js";
import * as versions from "../../src/db/repos/versions.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { GenerateDeps } from "../../src/pipeline/generate.js";
import { playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { SCRIPT_PLAN_FILE } from "../../src/script/read.js";
import { currentProjectStyle } from "../../src/analysis/project-style.js";
import { buildVideoSceneBrief, videoSceneSettings } from "../../src/video-scenes/brief.js";
import { planFps, videoNarration, videoSceneContext } from "../../src/video-scenes/context.js";
import { videoItemFingerprint } from "../../src/video-scenes/fingerprint.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { seedPlanProject } from "../analysis/plan-db-helpers.js";
import { sc } from "../analysis/plan-helpers.js";
import { fakeAgents, fakeRender, makeDeps, makeSkills } from "./helpers.js";

let env: JobsEnv;
let repo: SceneRepo;
let skills: string;
let runner: JobRunner | undefined;

// сцена 6 с (180 кадров, как spec фейкового Director) с 3 с ролика; фраза 3,5–8 с
const overlay: ScenePlanItem = sc(3_000_000, 9_000_000, {
  id: "sp_001", status: "accepted", frames: { start: 90, end: 270 }, purpose: "показать рост выручки", visual_type: "growth-decline", metaphor: "столбик растёт",
  composition_mode: "overlay", zone: "lower_third", rect: ZONE_RECTS.lower_third,
  key_terms: [{ text: "40%", word_id: "w_000008", edited_at_us: 4_000_000 }],
  evidence: [{ quote: "выручка выросла на 40%", start_word_id: "w_000005", end_word_id: "w_000008", edited: { start_us: 3_500_000, end_us: 8_000_000 } }],
});
const full: ScenePlanItem = { ...overlay, id: "sp_002", composition_mode: "fullscreen", zone: "full", rect: ZONE_RECTS.full };
const short: ScenePlanItem = { ...overlay, id: "sp_003", frames: { start: 90, end: 240 } };

let doc: Awaited<ReturnType<typeof seedPlanProject>>;
beforeEach(async () => {
  env = await setupDb("ms-v37-gen-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  skills = await makeSkills(env.s.tmp);
  doc = await seedPlanProject(env.db, new ArtifactStore({ root: env.s.root, db: env.db, guard: env.s.guard }), env.s.root, [overlay, full, short]);
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

/** Кадр исходника под сценой: синий PNG 64×36 (как ключевой кадр прокси). */
function contextFrame(): string {
  const rel = "workspace/projects/p1/test-ctx/frame.png";
  const p = new PNG({ width: 64, height: 36 });
  for (let i = 0; i < p.data.length; i += 4) p.data.set([20, 40, 200, 255], i);
  mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
  writeFileSync(join(env.s.root, rel), PNG.sync.write(p));
  return rel;
}

/** Рендер-фейк: кадры с transparent = true — альфа только в `ink` (по умолчанию — в зоне плана). */
function alphaRender(ink: NormRect = { x: 0.1, y: 0.75, w: 0.5, h: 0.15 }) {
  return fakeRender({
    png: true,
    onCall: async (req) => {
      if ((req.inputProps as { style?: { transparent?: boolean } } | undefined)?.style?.transparent !== true) return undefined;
      const out = req.outDir!;
      mkdirSync(join(out, "frames"), { recursive: true });
      const stills = req.stills.map((f) => {
        const w = 192;
        const h = 108;
        const p = new PNG({ width: w, height: h });
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const on = x >= ink.x * w && x < (ink.x + ink.w) * w && y >= ink.y * h && y < (ink.y + ink.h) * h;
          p.data.set([230, 230, 235, on ? 255 : 0], (y * w + x) * 4);
        }
        const path = join(out, "frames", `${f}.png`);
        writeFileSync(path, PNG.sync.write(p));
        return path;
      });
      return { ok: true, stills, browserLogs: [] };
    },
  });
}

const TERMINAL = ["completed", "failed", "cancelled", "blocked", "awaiting_input"];

interface Prepared {
  input: Record<string, unknown>;
  settings: Settings;
  ctx: VideoSceneContext;
  brief: string;
  fp: string;
}

function prepare(item: ScenePlanItem, over: Partial<VideoSceneContext> = {}): Prepared {
  const fps = planFps(env.db, doc);
  const ctx = { ...videoSceneContext(env.db, env.s.root, { projectId: "p1", doc, item }), ...over };
  const style = currentProjectStyle(env.db, env.s.root, "p1")!;
  const settings = videoSceneSettings(defaultSettings(), { width: 1920, height: 1080 }, fps, item, style.base);
  const brief = buildVideoSceneBrief({
    item, index: 1, total: 2, projectTitle: "Видео", fps, narration: videoNarration(env.db, env.s.root, doc, item), moments: ctx.key_moments ?? [], placement: ctx.placement,
  });
  const fp = videoItemFingerprint(item, { id: style.style_id, revision: style.revision });
  return { input: { prompt: brief, settings, video: ctx, video_fingerprint: fp, answers: "skip" }, settings, ctx, brief, fp };
}

async function run(over: Partial<GenerateDeps>, p: Prepared, item: ScenePlanItem, extra: Record<string, unknown> = {}) {
  const d = await makeDeps(env.s.root, skills, { render: alphaRender().render, ...over });
  const scene = repo.createScene("p1", { prompt: p.brief, settings: p.settings });
  videoScenes.insert(env.db, { project_id: "p1", plan_id: doc.plan_id, item_id: item.id, scene_id: scene.id, batch_id: null, job_id: null, item_fingerprint: "old" });
  const handler = playgroundGenerate({ deps: () => d, repo });
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "playground.generate": handler }, pollMs: 5 });
  const j = enqueue(env.db, { type: "playground.generate", projectId: "p1", sceneId: scene.id, input: { sceneId: scene.id, ...p.input, ...extra }, idempotencyKey: `k-${scene.id}` }).job;
  runner.start();
  await until(() => TERMINAL.includes(jobs.get(env.db, j.id)!.status), "итог задачи", 25_000);
  return { job: jobs.get(env.db, j.id)!, scene };
}

const versionOf = (sceneId: string) => {
  const v = versions.listByScene(env.db, sceneId).at(-1)!;
  const dir = join(env.s.root, v.path);
  return { v, dir, props: JSON.parse(readFileSync(join(dir, "props.json"), "utf8")) as { layout?: { rect: NormRect } }, qa: QAReportSchema.parse(JSON.parse(readFileSync(join(dir, "qa.json"), "utf8"))) };
};

describe("playground.generate с video", () => {
  it("overlay: бриф по плану и правила видеосцены в Concept/Director, layout.rect зоны, проверки по альфе, кадры-композиты в Visual QA, отпечаток после публикации", async () => {
    const p = prepare(overlay, { context_frame_rel: contextFrame() });
    const agents = fakeAgents({});
    const r0 = alphaRender();
    const { job, scene } = await run({ agents, render: r0.render }, p, overlay);
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.tasks.map((t) => t.role)).toEqual(["concept", "motion_director", "fragment_fit", "engineer", "visual_qa"]);
    for (const role of ["concept", "motion_director"] as const) {
      const input = String(agents.tasks.find((t) => t.role === role)!.input);
      expect(input).toContain(p.brief);
      expect(input).toContain("Правила видеосцены");
    }
    // Engineer знает прямоугольник графики; props.layout.rect — зона плана
    expect(agents.engineerCalls[0]!.input).toContain("LayoutRect");
    const { dir, props, qa } = versionOf(scene.id);
    expect(props.layout).toEqual({ rect: ZONE_RECTS.lower_third });
    // кадры QA с transparent = true — один рендер стоп-кадров для проверок по альфе (+ кадр hold наложения)
    const clear = r0.calls.filter((c) => (c.inputProps as { style?: { transparent?: boolean } } | undefined)?.style?.transparent === true);
    expect(clear.length).toBe(2);
    expect(qa.issues.filter((x) => ["face_ink", "outside_zone", "duration_changed", "layout_rect"].includes(x.code))).toEqual([]);
    // кадры-композиты опубликованы с версией и показаны Visual QA
    const ctxFiles = readdirSync(join(dir, "qa")).filter((f) => /^ctx-\d+\.png$/.test(f));
    expect(ctxFiles.length).toBeGreaterThan(0);
    const vqa = agents.tasks.find((t) => t.role === "visual_qa")!;
    expect(String(vqa.input)).toContain("context/ctx-");
    expect(existsSync(join(vqa.workdir, "context", ctxFiles[0]!))).toBe(true);
    expect(videoScenes.bySceneId(env.db, scene.id)!.item_fingerprint).toBe(p.fp);
  });

  it("графика вне зоны → outside_zone blocking, исправление Engineer тем же циклом", async () => {
    const p = prepare(overlay);
    const agents = fakeAgents({});
    let n = 0;
    const off = alphaRender({ x: 0.6, y: 0.05, w: 0.3, h: 0.2 });
    const good = alphaRender();
    const render = (async (req: Parameters<typeof off.render>[0], sig?: AbortSignal) => {
      const transparent = (req.inputProps as { style?: { transparent?: boolean } } | undefined)?.style?.transparent === true;
      if (transparent && req.stills.length > 1) n++;
      return (transparent && n === 1 ? off : good).render(req, sig);
    }) as unknown as GenerateDeps["render"];
    const { job } = await run({ agents, render }, p, overlay);
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls.length).toBe(2);
    expect(agents.engineerCalls[1]!.input).toContain("outside_zone");
  });

  it("fullscreen: непрозрачная сцена — без проверок по альфе и композитов; layout не задаётся", async () => {
    const p = prepare(full);
    const agents = fakeAgents({});
    const r0 = alphaRender();
    const { job, scene } = await run({ agents, render: r0.render }, p, full);
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const { dir, props } = versionOf(scene.id);
    expect(props.layout).toBeUndefined();
    expect(existsSync(join(dir, "qa"))).toBe(false);
    const clear = r0.calls.filter((c) => (c.inputProps as { style?: { transparent?: boolean } } | undefined)?.style?.transparent === true);
    expect(clear).toEqual([]);
  });

  it("длительность не по плану → duration_changed: задача ставится только на плановую длину", async () => {
    // сцена плана sp_003 — 150 кадров, а настройки задачи — на 180 (как у sp_001)
    const p = prepare(overlay);
    const ctx = videoSceneContext(env.db, env.s.root, { projectId: "p1", doc, item: short });
    const agents = fakeAgents({});
    const { job, scene } = await run({ agents }, { ...p, input: { ...p.input, video: ctx } }, short);
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls.length).toBeGreaterThan(1);
    expect(agents.engineerCalls[1]!.input).toContain("duration_changed");
    expect(versionOf(scene.id).qa.issues.find((x) => x.code === "duration_changed")).toBeDefined();
  });

  it("video и script вместе — failed(pipeline) без агентов", async () => {
    const p = prepare(overlay);
    const agents = fakeAgents({});
    const { job } = await run({ agents }, p, overlay, { script: { any: 1 } });
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ code: "pipeline" });
    expect(agents.tasks).toEqual([]);
  });

  it("вход video не по схеме — failed(pipeline)", async () => {
    const p = prepare(overlay);
    const { job } = await run({ agents: fakeAgents({}) }, { ...p, input: { ...p.input, video: { plan_id: "x" } } }, overlay);
    expect(job.status).toBe("failed");
    expect(job.error).toMatchObject({ code: "pipeline" });
  });
});

describe("вход script — как до Task 37′", () => {
  it("шаги, рендеры и задача Visual QA без кадров-композитов", async () => {
    const SHA = "a".repeat(64);
    const item = {
      id: "ss_001", status: "accepted" as const, origin: "agent" as const, start_word_id: "w_000005", end_word_id: "w_000010", quote: "в Go 1.24 карта стала быстрее", block_id: "b1",
      words: 6, at_s: 1.6, frames: { lead: 15, speech: 135, tail: 30, total: 180 }, technique: "hero-number" as const, pattern: "quantities" as const,
      purpose: "зритель запоминает версию", idea: "число версии растёт счётчиком", key_terms: [], data: [], importance: 2, anchor_ids: [],
    };
    const plan: ScriptPlanRevisionDoc = {
      schema_version: 1, plan_id: "pln_s", revision: 1,
      inputs: { script: { id: "scr_1", revision: 1, hash: SHA }, style: { id: "sty_1", revision: 1, hash: SHA } },
      fps: { num: 30, den: 1 }, aspect: "16:9", reading: DEFAULT_READING,
      analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
      items: [item], skipped: [], issues: [], diversity: { techniques: { "hero-number": 1 }, adjacent_repeats: 0, kinetic_share: 0 },
    };
    scriptPlans.create(env.db, { id: "pln_s", project_id: "p1" });
    const rel = `${artifactPaths(env.s.root, "p1").planRev("pln_s", 1)}/${SCRIPT_PLAN_FILE}`;
    mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
    writeFileSync(join(env.s.root, rel), JSON.stringify(plan));
    scriptPlans.insertRevision(env.db, { doc: plan, rel_path: rel, sha256: SHA });
    const settings: Settings = { ...defaultSettings(), duration_frames: 180, style_lock: { depth: 1 } };
    const script = { project_id: "p1", plan_id: "pln_s", plan_revision: 1, item_id: "ss_001", aspect: "16:9", style: { preset: "dark-premium", intensity: "balanced", depth: 1 }, lead_frames: 15, tail_frames: 30 };
    const HERO = `import { AnimatedNumber } from "@ms/motion-kit";\nimport { AbsoluteFill } from "remotion";\nexport const Scene = () => <AbsoluteFill><AnimatedNumber value={3} /></AbsoluteFill>;\n`;
    const agents = fakeAgents({ engineer: async () => ({ files: { "src/Scene.tsx": HERO } }) });
    const r0 = fakeRender({ png: true });
    const { job, scene } = await run({ agents, render: r0.render }, { input: { prompt: "Сцена 1", settings, script, answers: "skip" }, settings, ctx: undefined as never, brief: "Сцена 1", fp: "" }, overlay);
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.tasks.map((t) => t.role)).toEqual(["concept", "motion_director", "fragment_fit", "engineer", "visual_qa"]);
    expect(String(agents.tasks.find((t) => t.role === "concept")!.input)).toContain("Правила сцены сценария");
    expect(String(agents.tasks.find((t) => t.role === "concept")!.input)).not.toContain("Правила видеосцены");
    // кадр hold с transparent = true — один (S6), без рендера кадров по альфе видеосцены
    const clear = r0.calls.filter((c) => (c.inputProps as { style?: { transparent?: boolean } } | undefined)?.style?.transparent === true);
    expect(clear.map((c) => c.stills.length)).toEqual([1]);
    const vqa = agents.tasks.find((t) => t.role === "visual_qa")!;
    expect(String(vqa.input)).not.toContain("context/");
    expect(agents.engineerCalls[0]!.input).not.toContain("LayoutRect");
    const { props } = versionOf(scene.id);
    expect(props.layout).toBeUndefined();
  });
});
