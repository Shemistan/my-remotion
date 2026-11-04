// Ручной режим доработки (scene.qaAutoFix = false, умолчание с 2026-11-04): после проверки
// качества сцена не уходит Engineer на второй круг — версия публикуется с пометкой «низкое
// качество» (qa.low_quality), доработку запускает человек кнопкой «Улучшить». Технический gate
// (static, typecheck, рендер) по-прежнему исправляется автоматически.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MotionSpec, defaultSettings } from "@ms/contracts";
import * as jobs from "../../src/db/repos/jobs.js";
import * as versions from "../../src/db/repos/versions.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { GenerateDeps } from "../../src/pipeline/generate.js";
import { playgroundGenerate } from "../../src/pipeline/playground-generate.js";
import { acceptedAsWarn } from "../../src/qa/report.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { removeStore } from "../db/helpers.js";
import { setupDb, until, type JobsEnv } from "../jobs/helpers.js";
import { GOOD_SCENE, fakeAgents, fakeRender, makeDeps, makeSkills, scores, visualOutput } from "./helpers.js";

let env: JobsEnv;
let repo: SceneRepo;
let skills: string;
let runner: JobRunner | undefined;
beforeEach(async () => {
  env = await setupDb("ms-qa-manual-");
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  skills = await makeSkills(env.s.tmp);
});
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  env.db.close();
  await removeStore(env.s);
});

const settings = defaultSettings();
const TERMINAL = ["completed", "failed", "cancelled", "blocked", "awaiting_input"];
const scene = (tag: string) => `${GOOD_SCENE}// ${tag}\n`;

async function runJob(over: Partial<GenerateDeps> = {}) {
  const d = await makeDeps(env.s.root, skills, { render: fakeRender({ png: true }).render, ...over });
  // умолчание конфига — ручной режим (хелпер включает автодоработку для старых тестов)
  d.config = { ...d.config, scene: { ...d.config.scene, qaAutoFix: false, secondTake: { ...d.config.scene.secondTake, mode: "off" } } };
  const sc = repo.createScene("playground", { prompt: "Рост пользователей", settings });
  const handler = playgroundGenerate({ deps: () => d, repo });
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "playground.generate": handler }, pollMs: 5, agentCalls: 4, renders: 2 });
  const j = enqueue(env.db, { type: "playground.generate", projectId: "playground", sceneId: sc.id, input: { sceneId: sc.id, prompt: "Рост пользователей", settings }, idempotencyKey: `k-${sc.id}` }).job;
  runner.start();
  await until(() => TERMINAL.includes(jobs.get(env.db, j.id)!.status), "итог задачи", 25_000);
  const [v] = versions.listByScene(env.db, sc.id);
  return { job: jobs.get(env.db, j.id)!, v, dir: v ? join(env.s.root, v.path) : undefined };
}

const blocking = (code: string) => ({ code, severity: "blocking" as const, frame: 30, area: "заголовок", description: "заголовок обрезан", fix_hint: "сдвинь заголовок" });
const qaWith = (p: { block?: boolean; semantic?: boolean }) => async (frames: number[], spec: MotionSpec | undefined) => ({
  output: visualOutput(frames, spec, {
    gate: { visual: p.block ? "fail" : "pass", semantic: p.semantic ? "fail" : "pass", style: "pass" },
    issues: [...(p.block ? [blocking("clipping")] : []), ...(p.semantic ? [blocking("wrong_number")] : [])],
    scores: scores(5),
  }),
});
const qaOf = (dir: string) => JSON.parse(readFileSync(join(dir, "qa.json"), "utf8"));

describe("ручная доработка по QA (scene.qaAutoFix = false)", () => {
  it("visual blocking → один вызов Engineer, версия ready с пометкой low_quality", async () => {
    const agents = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaWith({ block: true }),
    });
    const { job, v, dir } = await runJob({ agents });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(1);
    expect(v).toMatchObject({ status: "ready" });
    const qa = qaOf(dir!);
    expect(qa.gate.visual).toBe("warn");
    expect(qa.low_quality).toMatch(/Улучшить/);
    expect(qa.issues).toContainEqual(expect.objectContaining({ code: "clipping", severity: "warning" }));
  });

  it("semantic fail → видео всё равно публикуется (ready), semantic warn, low_quality", async () => {
    const agents = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaWith({ semantic: true }),
    });
    const { job, v, dir } = await runJob({ agents });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(1);
    expect(v).toMatchObject({ status: "ready" });
    const qa = qaOf(dir!);
    expect(qa.gate).toMatchObject({ semantic: "warn", visual: "pass" });
    expect(qa.low_quality).toBeDefined();
  });

  it("технический gate исправляется автоматически: typecheck fail → второй вызов Engineer; QA blocking — без третьего", async () => {
    let checks = 0;
    const agents = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaWith({ block: true }),
    });
    const { job, dir } = await runJob({ agents, typecheck: async () => (++checks === 1 ? [{ file: "src/Scene.tsx", line: 1, message: "TS2322" }] : []) });
    expect(job.status, JSON.stringify(job.error)).toBe("completed");
    expect(agents.engineerCalls).toHaveLength(2);
    expect(qaOf(dir!).low_quality).toBeDefined();
  });

  it("проверка качества пройдена — пометки нет", async () => {
    const agents = fakeAgents({
      engineer: async (_t, n) => ({ files: { "src/Scene.tsx": scene(`call ${n}`) } }),
      visualQa: qaWith({}),
    });
    const { job, dir } = await runJob({ agents });
    expect(job.status).toBe("completed");
    expect(qaOf(dir!).low_quality).toBeUndefined();
  });
});

describe("acceptedAsWarn", () => {
  const report = {
    gate: { technical: "pass", visual: "fail", semantic: "fail", style: "pass" },
    issues: [blocking("clipping")],
    checked_frames: [0],
    ocr: { available: false, frames: [] },
    automated: true,
  } as unknown as Parameters<typeof acceptedAsWarn>[0];

  it("авторежим: смягчает только visual, причина — в low_quality", () => {
    const r = acceptedAsWarn(report, "— бюджет сцены исчерпан");
    expect(r.gate).toMatchObject({ visual: "warn", semantic: "fail" });
    expect(r.low_quality).toBe("бюджет сцены исчерпан");
  });

  it("ручной режим: смягчает и semantic/style", () => {
    expect(acceptedAsWarn(report, "x", true).gate).toMatchObject({ visual: "warn", semantic: "warn", style: "pass" });
  });
});
