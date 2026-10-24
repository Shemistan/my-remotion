// S5: `playground.generate` с входом `script` (§6.2): Concept без уточнений, стиль — стиль
// проекта (style_hint не применяется), поиск KB по сцене плана, «предыдущие» — соседи плана,
// окно речи — в проверку spec и в раскладку битов. Фейковые агенты и рендер.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_READING, type DirectorOutput, type MotionSpec, type ProjectStyleBase, type ScriptPlanRevisionDoc, type ScriptSceneContext, type ScriptSceneItem, type Settings, defaultSettings } from "@ms/contracts";
import { loadPrompt } from "../../src/agents/prompts.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import * as jobEvents from "../../src/db/repos/job-events.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import * as versions from "../../src/db/repos/versions.js";
import { scriptPlans, scriptScenes } from "../../src/db/repos/script.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { GenerateDeps } from "../../src/pipeline/generate.js";
import { playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { itemFingerprint } from "../../src/script/fingerprint.js";
import { SCRIPT_PLAN_FILE } from "../../src/script/read.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";
import { conceptOutput, directorOutput, fakeAgents, fakeKb, fakeRender, makeDeps, makeSkills } from "./helpers.js";

let env: JobsEnv;
let repo: SceneRepo;
let skills: string;
let runner: JobRunner | undefined;
const P = "p_script";
const SHA = "a".repeat(64);

const style: ProjectStyleBase = { preset: "dark-premium", intensity: "balanced", depth: 2, palette_overrides: { bg: "#101418" } };
const item = (over: Partial<ScriptSceneItem> = {}): ScriptSceneItem => ({
  id: "ss_002", status: "accepted", origin: "agent", start_word_id: "w_000005", end_word_id: "w_000010", quote: "в Go 1.24 карта стала быстрее", block_id: "b1",
  words: 6, at_s: 1.6, frames: { lead: 15, speech: 135, tail: 30, total: 180 }, technique: "hero-number", pattern: "quantities",
  purpose: "зритель запоминает версию", idea: "число версии растёт счётчиком", key_terms: [], data: [], importance: 2, anchor_ids: [], ...over,
});
const items = [item({ id: "ss_001", start_word_id: "w_000001", end_word_id: "w_000004", technique: "split-versus", pattern: "comparison" }), item(), item({ id: "ss_003", start_word_id: "w_000011", end_word_id: "w_000015", technique: "timeline", pattern: "timeline" })];
const plan: ScriptPlanRevisionDoc = {
  schema_version: 1, plan_id: "pln_s", revision: 1,
  inputs: { script: { id: "scr_1", revision: 1, hash: SHA }, style: { id: "sty_1", revision: 1, hash: SHA } },
  fps: { num: 30, den: 1 }, aspect: "16:9", reading: DEFAULT_READING,
  analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
  items, skipped: [], issues: [], diversity: { techniques: { "split-versus": 1, "hero-number": 1, timeline: 1 }, adjacent_repeats: 0, kinetic_share: 0 },
};
const script: ScriptSceneContext = { project_id: P, plan_id: "pln_s", plan_revision: 1, item_id: "ss_002", aspect: "16:9", style, lead_frames: 15, tail_frames: 30 };
const settings: Settings = { ...defaultSettings(), duration_frames: 180, style_lock: { palette_overrides: { bg: "#101418" }, depth: 2 } };

beforeEach(async () => {
  env = await setupDb("ms-pg-script-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  skills = await makeSkills(env.s.tmp);
  projects.create(env.db, { id: P, kind: "script", title: "Go map" });
  scriptPlans.create(env.db, { id: "pln_s", project_id: P });
  const rel = `${artifactPaths(env.s.root, P).planRev("pln_s", 1)}/${SCRIPT_PLAN_FILE}`;
  mkdirSync(dirname(join(env.s.root, rel)), { recursive: true });
  writeFileSync(join(env.s.root, rel), JSON.stringify(plan));
  scriptPlans.insertRevision(env.db, { doc: plan, rel_path: rel, sha256: SHA });
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

const TERMINAL = ["completed", "failed", "cancelled", "blocked", "awaiting_input"];

async function run(over: Partial<GenerateDeps>, input: Record<string, unknown>, onScene?: (sceneId: string) => void) {
  const d = await makeDeps(env.s.root, skills, { render: fakeRender({ png: true }).render, ...over });
  const scene = repo.createScene(P, { prompt: "Сцена 2 из 3", settings });
  onScene?.(scene.id);
  const handler = playgroundGenerate({ deps: () => d, repo });
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "playground.generate": handler }, pollMs: 5 });
  const j = enqueue(env.db, { type: "playground.generate", projectId: P, sceneId: scene.id, input: { sceneId: scene.id, prompt: "Сцена 2 из 3 сценария «Go map»", settings, ...input }, idempotencyKey: `k-${scene.id}` }).job;
  runner.start();
  await until(() => TERMINAL.includes(jobs.get(env.db, j.id)!.status), "итог задачи", 20_000);
  return { job: jobs.get(env.db, j.id)!, scene };
}

const logs = (jobId: string) => jobEvents.listSince(env.db, 0, { jobId }).map((e) => e.message);
const published = (sceneId: string) => {
  const v = versions.listByScene(env.db, sceneId).find((x) => x.status === "ready")!;
  return { props: JSON.parse(readFileSync(join(env.s.root, v.path, "props.json"), "utf8")), spec: JSON.parse(readFileSync(join(env.s.root, v.path, "spec.json"), "utf8")) as MotionSpec };
};

/** Готовая версия сцены-соседа плана (spec — валидная MotionSpec). */
async function seedNeighbor(itemId: string, spec: MotionSpec) {
  const scene = repo.createScene(P, { prompt: "сосед", settings });
  scriptScenes.insert(env.db, { project_id: P, plan_id: "pln_s", item_id: itemId, aspect: "16:9", scene_id: scene.id, batch_id: null, job_id: null, item_fingerprint: itemFingerprint(items[0]!, null) });
  const jobId = `job_seed_${scene.id}`;
  jobs.insert(env.db, { id: jobId, type: "playground.generate", project_id: P, scene_id: scene.id, input: {}, status: "completed", attempt: 1 });
  const draft = await makeDraft(env.s.root, { runId: jobId, attempt: 1, sceneId: scene.id, projectId: P }, { spec });
  await repo.publish(draft, meta(scene.id), { jobId, attempt: 1 });
}

describe("playground.generate со script", () => {
  it("Concept без уточнений (answers skip): вопросы Concept не останавливают задачу; роли как у Playground", async () => {
    const agents = fakeAgents({ concept: async () => ({ output: conceptOutput({ needs_clarification: [{ question: "какой цвет?", default_if_skipped: "синий" }] }) }) });
    const { job } = await run({ agents }, { script });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const concept = agents.tasks.find((t) => t.role === "concept")!;
    expect(String(concept.input)).toContain("Пользователь пропустил уточнения");
    expect(agents.tasks.map((t) => t.role)).toEqual(["concept", "motion_director", "engineer", "visual_qa"]);
  });

  it("стиль — стиль проекта: style_hint Concept не применяется (событие лога), палитра и глубина из style_lock", async () => {
    const agents = fakeAgents({ concept: async () => ({ output: conceptOutput({ style_hint: { preset: "tech-neon", palette_overrides: { bg: "#ff0000" } } }) }) });
    const { job, scene } = await run({ agents }, { script });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(published(scene.id).props.style).toMatchObject({ preset: style.preset, palette_overrides: { bg: "#101418" }, depth: 2 });
    expect(logs(job.id).some((m) => /style_hint/.test(m))).toBe(true);
  });

  it("запрос KB — по назначению, идее и цитате сцены плана, а не по брифу", async () => {
    const kb = fakeKb();
    const { job } = await run({ agents: fakeAgents({}), kb }, { script });
    expect(job.status).toBe("completed");
    const queries = kb.searches.map((s) => (s as { query: string }).query);
    const it2 = item();
    expect(queries[0]).toBe(`${it2.purpose} ${it2.idea} ${it2.quote}`);
    expect(queries).not.toContain("Сцена 2 из 3 сценария «Go map»");
  });

  it("подпись кадра сверяется с готовыми соседями плана того же формата", async () => {
    await seedNeighbor("ss_001", directorOutput().spec);
    const { job } = await run({ agents: fakeAgents({}) }, { script });
    expect(job.status).toBe("completed");
    expect(logs(job.id).some((m) => /соседями плана: ss_001/.test(m))).toBe(true);
  });

  it("окно речи — в проверку spec: удержание короче tail уходит Director в раунд исправления", async () => {
    let n = 0;
    const agents = fakeAgents({
      director: async () => {
        const o = directorOutput();
        if (++n === 1) {
          o.spec.beats[2] = { ...o.spec.beats[2]!, end_frame: 170 };
          o.spec.beats[3] = { ...o.spec.beats[3]!, start_frame: 170 };
        }
        return { output: o };
      },
    });
    const { job } = await run({ agents }, { script });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    const dir = agents.tasks.filter((t) => t.role === "motion_director");
    expect(dir).toHaveLength(2);
    expect(String(dir[1]!.input)).toContain("speech_window");
    expect(String(dir[1]!.input)).toContain("[15; 150)");
  });

  it("spec с фазами (count-up): планировщик кладёт фазы в [lead; total) — действие не раньше lead, удержание до конца", async () => {
    const agents = fakeAgents({ director: async () => ({ output: phasedDirector() }) });
    const { job, scene } = await run({ agents }, { script });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.tasks.filter((t) => t.role === "motion_director")).toHaveLength(1);
    const spec = published(scene.id).spec;
    expect(spec.duration_frames).toBe(180);
    const role = new Map(spec.phases!.map((p) => [p.id, p.role]));
    for (const b of spec.beats) if (b.phase && role.get(b.phase) !== "setup") expect(b.start_frame, b.id).toBeGreaterThanOrEqual(15);
    expect(Math.min(...spec.beats.map((b) => b.start_frame))).toBeGreaterThanOrEqual(15);
    expect(Math.max(...spec.beats.map((b) => b.end_frame))).toBe(180);
  });

  // I1: удержание планировщика ограничено (≤ 4 с, ~15 % длины) — при длинном tail раскладка
  // сжимает фазы до total − tail и растягивает hold на хвост, Director не уходит в раунд 2
  for (const [total, tail] of [[180, 60], [300, 60], [240, 150], [300, 150]] as const) {
    it(`окно речи total=${total} tail=${tail}: hold ≥ tail, Director один раз, без speech_window`, async () => {
      const agents = fakeAgents({ director: async () => ({ output: phasedDirector(total) }) });
      const { job, scene } = await run({ agents }, { script: { ...script, tail_frames: tail }, settings: { ...settings, duration_frames: total } });
      expect(job.status, JSON.stringify(job.error)).toBe("completed");
      const dir = agents.tasks.filter((t) => t.role === "motion_director");
      expect(dir).toHaveLength(1);
      expect(logs(job.id).some((m) => /speech_window/.test(m))).toBe(false);
      const spec = published(scene.id).spec;
      const hold = spec.beats.filter((b) => b.phase === "fin");
      const start = Math.min(...hold.map((b) => b.start_frame));
      expect(start).toBeLessThanOrEqual(total - tail);
      expect(Math.max(...hold.map((b) => b.end_frame)) - start).toBeGreaterThanOrEqual(tail);
      for (const b of spec.beats) if (b.phase !== "fin") expect(b.start_frame, b.id).toBeGreaterThanOrEqual(15);
    });
  }

  it("I2: после публикации отпечаток сцены плана из входа (script_fingerprint) пишется в script_scenes", async () => {
    const { job, scene } = await run({ agents: fakeAgents({}) }, { script, script_fingerprint: "fp-new" }, (sceneId) => {
      scriptScenes.insert(env.db, { project_id: P, plan_id: "pln_s", item_id: "ss_002", aspect: "16:9", scene_id: sceneId, batch_id: null, job_id: null, item_fingerprint: "fp-old" });
    });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(scriptScenes.get(env.db, "pln_s", "ss_002", "16:9")!.scene_id).toBe(scene.id);
    expect(scriptScenes.get(env.db, "pln_s", "ss_002", "16:9")!.item_fingerprint).toBe("fp-new");
  });

  it("I2: задача упала до публикации — отпечаток прежний", async () => {
    const agents = fakeAgents({ director: async () => { throw new Error("фейк: director упал"); } });
    const { job } = await run({ agents }, { script, script_fingerprint: "fp-new" }, (sceneId) => {
      scriptScenes.insert(env.db, { project_id: P, plan_id: "pln_s", item_id: "ss_002", aspect: "16:9", scene_id: sceneId, batch_id: null, job_id: null, item_fingerprint: "fp-old" });
    });
    expect(job.status).not.toBe("completed");
    expect(scriptScenes.get(env.db, "pln_s", "ss_002", "16:9")!.item_fingerprint).toBe("fp-old");
  });

  it("M1: правила сцены сценария — в задаче Concept и Director только у сцены сценария; в системных промптах ролей их нет", async () => {
    const a = fakeAgents({});
    await run({ agents: a }, { script });
    for (const role of ["concept", "motion_director"]) expect(String(a.tasks.find((t) => t.role === role)!.input), role).toContain("# Правила сцены сценария");
    expect(String(a.tasks.find((t) => t.role === "concept")!.input)).toContain("ФРАГМЕНТ");
    await runner!.stop({ abortRunning: true });
    const b = fakeAgents({});
    await run({ agents: b }, {});
    for (const role of ["concept", "motion_director"]) expect(String(b.tasks.find((t) => t.role === role)!.input), role).not.toContain("Правила сцены сценария");
    for (const role of ["concept", "motion_director"] as const) expect(loadPrompt(role)).not.toContain("<<<ФРАГМЕНТ");
  });

  it("без script — счёт с кадра 0 (раскладка как раньше)", async () => {
    const agents = fakeAgents({ director: async () => ({ output: phasedDirector() }) });
    const { job, scene } = await run({ agents }, {});
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(Math.min(...published(scene.id).spec.beats.map((b) => b.start_frame))).toBe(0);
  });
});

/** Ответ Director с фазами: count-up — счёт ведёт с первого кадра окна. */
function phasedDirector(total = 180): DirectorOutput {
  return {
    spec: {
      title: "Версия 1.24", purpose: "версия", duration_frames: total, fps: { num: 30, den: 1 }, style_preset: "dark-premium",
      elements: [
        { id: "num", kind: "number", role: "emphasis", entrance: "count", content: { value: 1.24 }, layout: { x: 0.3, y: 0.3, w: 0.4, h: 0.3 } },
        { id: "label", kind: "text", role: "подпись", entrance: "rise", content: { text: "Go" }, layout: { x: 0.3, y: 0.1, w: 0.4, h: 0.1 } },
      ],
      phases: [
        { id: "count", role: "action", weight: 50, element_ids: ["num"] },
        { id: "intro", role: "setup", weight: 15, element_ids: ["label"] },
        { id: "fin", role: "hold", weight: 35, element_ids: ["num", "label"], hold_mode: "data-shimmer" },
      ],
      beats: [
        { id: "b_count", phase: "count", action: "count-up", kind: "count", description: "", element_ids: ["num"] },
        { id: "b_label", phase: "intro", action: "label-enter", kind: "enter", description: "", element_ids: ["label"] },
        { id: "b_hold", phase: "fin", action: "hold", kind: "hold", description: "", element_ids: ["num", "label"] },
      ],
    },
    composition: { archetype: "centered-hero", idea: "число в центре", focus: "число", transitions: "счёт ведёт", structure: "count-up" },
    selection: { items: [{ kb_id: "fake/line-chart", strategy: "adapt", why: "x", files_to_copy: [] }] },
    rationale: "тест",
  } as unknown as DirectorOutput;
}
