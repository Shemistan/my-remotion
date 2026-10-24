// S10: `playground.generate` двойника 9:16 (`script.reference_version_id`): Concept не
// вызывается — concept и структура из эталонной 16:9-версии (чекпоинт Concept её задачи),
// KB-кандидаты по ним же; spec эталона (сокращённая, без раскладки) — блоком «Эталон» в задаче
// Director. Эталона нет или он не готов — задача failed без вызова агентов. Фейковые агенты и рендер.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_READING, type MotionSpec, type ProjectStyleBase, type ScriptPlanRevisionDoc, type ScriptSceneContext, type ScriptSceneItem, type Settings, defaultSettings } from "@ms/contracts";
import { artifactPaths } from "../../src/artifacts/paths.js";
import * as jobEvents from "../../src/db/repos/job-events.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { scriptPlans } from "../../src/db/repos/script.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import { checkpointPath } from "../../src/pipeline/checkpoints.js";
import type { GenerateDeps } from "../../src/pipeline/generate.js";
import { playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { SCRIPT_PLAN_FILE } from "../../src/script/read.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";
import { conceptOutput, directorOutput, fakeAgents, fakeKb, fakeRender, makeDeps, makeSkills } from "./helpers.js";

let env: JobsEnv;
let repo: SceneRepo;
let skills: string;
let runner: JobRunner | undefined;
const P = "p_reframe_gen";
const SHA = "a".repeat(64);

const style: ProjectStyleBase = { preset: "dark-premium", intensity: "balanced", depth: 2 };
const item: ScriptSceneItem = {
  id: "ss_001", status: "accepted", origin: "agent", start_word_id: "w_000001", end_word_id: "w_000006", quote: "в Go 1.24 карта стала быстрее", block_id: "b1",
  words: 6, at_s: 0, frames: { lead: 15, speech: 135, tail: 30, total: 180 }, technique: "hero-number", pattern: "quantities",
  purpose: "зритель запоминает версию", idea: "число версии растёт счётчиком", key_terms: [], data: [], importance: 2, anchor_ids: [],
};
const plan: ScriptPlanRevisionDoc = {
  schema_version: 1, plan_id: "pln_v", revision: 1,
  inputs: { script: { id: "scr_1", revision: 1, hash: SHA }, style: { id: "sty_1", revision: 1, hash: SHA } },
  fps: { num: 30, den: 1 }, aspect: "16:9", reading: DEFAULT_READING,
  analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
  items: [item], skipped: [], issues: [], diversity: { techniques: { "hero-number": 1 }, adjacent_repeats: 0, kinetic_share: 0 },
};
const ctx16: ScriptSceneContext = { project_id: P, plan_id: "pln_v", plan_revision: 1, item_id: "ss_001", aspect: "16:9", style, lead_frames: 15, tail_frames: 30 };
const vertical: Settings = { ...defaultSettings(), aspect_ratio: "9:16", width: 1080, height: 1920, safe_area: { x: 0.06, y: 0.15 }, duration_frames: 180, style_lock: { depth: 2 } };
const REF_CONCEPT = conceptOutput({ concept: "ЭТАЛОН: счётчик версии растёт до 1.24", kb_queries: { ru: ["эталонный запрос"], en: [] } });

/** Эталон: spec с раскладкой элемента (её в блоке «Эталон» быть не должно). */
function refSpec(): MotionSpec {
  const s = directorOutput().spec;
  return { ...s, composition: { archetype: "split", idea: "число слева, график справа", focus: "итог", transitions: "голова линии ведёт счётчик", structure: "count-up" }, elements: s.elements.map((e, k) => (k === 0 ? { ...e, layout: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } } : e)) };
}

beforeEach(async () => {
  env = await setupDb("ms-pg-reframe-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  skills = await makeSkills(env.s.tmp);
  projects.create(env.db, { id: P, kind: "script", title: "Go map" });
  scriptPlans.create(env.db, { id: "pln_v", project_id: P });
  const rel = `${artifactPaths(env.s.root, P).planRev("pln_v", 1)}/${SCRIPT_PLAN_FILE}`;
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

/** Готовая 16:9-версия (эталон) и, если `concept`, чекпоинт Concept её задачи. */
async function seedReference(concept: unknown | undefined): Promise<string> {
  const scene = repo.createScene(P, { prompt: "эталон", settings: { ...defaultSettings(), duration_frames: 180 } });
  const jobId = `job_ref_${scene.id}`;
  jobs.insert(env.db, { id: jobId, type: "playground.generate", project_id: P, scene_id: scene.id, input: { script: ctx16 }, status: "completed", attempt: 1 });
  if (concept !== undefined) {
    const path = checkpointPath(env.s.root, jobId, "concept");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ input_hash: "h", output: concept }));
  }
  const draft = await makeDraft(env.s.root, { runId: jobId, attempt: 1, sceneId: scene.id, projectId: P }, { spec: refSpec() });
  return (await repo.publish(draft, meta(scene.id), { jobId, attempt: 1 })).versionId;
}

async function run(over: Partial<GenerateDeps>, referenceVersionId: string) {
  const d = await makeDeps(env.s.root, skills, { render: fakeRender({ png: true }).render, ...over });
  const scene = repo.createScene(P, { prompt: "Сцена 1 из 1 (9:16)", settings: vertical });
  const handler = playgroundGenerate({ deps: () => d, repo });
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "playground.generate": handler }, pollMs: 5 });
  const script: ScriptSceneContext = { ...ctx16, aspect: "9:16", reference_version_id: referenceVersionId };
  const j = enqueue(env.db, { type: "playground.generate", projectId: P, sceneId: scene.id, input: { sceneId: scene.id, prompt: "Сцена 1 из 1 сценария «Go map»", settings: vertical, script, answers: "skip" }, idempotencyKey: `k-${scene.id}` }).job;
  runner.start();
  await until(() => ["completed", "failed", "cancelled", "blocked", "awaiting_input"].includes(jobs.get(env.db, j.id)!.status), "итог задачи", 20_000);
  return jobs.get(env.db, j.id)!;
}

const logs = (jobId: string) => jobEvents.listSince(env.db, 0, { jobId }).map((e) => e.message);

describe("playground.generate двойника 9:16", () => {
  it("Concept не вызывается: concept и структура — эталона, KB по ним; блок «Эталон» с elements/beats/structure без раскладки и указанием safe area", async () => {
    const ref = await seedReference(REF_CONCEPT);
    const agents = fakeAgents({});
    const kb = fakeKb();
    const job = await run({ agents, kb }, ref);
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.tasks.map((t) => t.role)).not.toContain("concept");
    const dir = String(agents.tasks.find((t) => t.role === "motion_director")!.input);
    expect(dir).toContain("Эталон");
    expect(dir).toContain("ЭТАЛОН: счётчик версии растёт до 1.24"); // concept эталона
    expect(dir).toContain('composition.structure = "count-up"');
    expect(dir).toContain("chart-growth"); // биты эталона
    expect(dir).toContain("1080×1920");
    expect(dir).toMatch(/снизу 15–20 %/);
    expect(dir).toContain("y + h ≤ 0.92"); // низ контента — 80 % кадра в долях safe area 0,15
    const block = dir.slice(dir.indexOf("# Эталон"));
    expect(block).not.toContain('"layout"');
    expect(kb.searches.map((s) => (s as { query: string }).query)).toContain("эталонный запрос");
    expect(logs(job.id).some((m) => /Concept пропущен/.test(m))).toBe(true);
  });

  it("у эталона нет чекпоинта Concept — двойник всё равно строится: структура из spec эталона, Concept не вызывается", async () => {
    const ref = await seedReference(undefined);
    const agents = fakeAgents({});
    const job = await run({ agents }, ref);
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.tasks.map((t) => t.role)).not.toContain("concept");
    const dir = String(agents.tasks.find((t) => t.role === "motion_director")!.input);
    expect(dir).toContain("Эталон");
    expect(dir).toContain('"structure": "count-up"');
  });

  it("эталонной версии нет — failed без вызова агентов", async () => {
    const agents = fakeAgents({});
    const job = await run({ agents }, "ver_missing");
    expect(job.status).toBe("failed");
    expect(job.error?.message).toMatch(/эталон/);
    expect(agents.tasks).toHaveLength(0);
  });
});
