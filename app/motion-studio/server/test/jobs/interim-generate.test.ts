// interimGenerate (M6): временный обработчик `playground.generate` поверх generateScene
// среза с контекстом попытки; итог пайплайна → итог задачи (orphaned → blocked).
import { afterEach, beforeEach, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import * as jobs from "../../src/db/repos/jobs.js";
import { type InterimDeps, interimGenerate } from "../../src/jobs/interim-generate.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { GenerateDeps, GenerateResult } from "../../src/pipeline/generate.js";
import { setupDb, teardownDb, until, type JobsEnv } from "./helpers.js";

let env: JobsEnv;
let runner: JobRunner | undefined;
beforeEach(async () => { env = await setupDb("ms-jobs-interim-"); });
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  await teardownDb(env);
});

const base = { runId: "x", costUsd: 0.5, engineerCalls: 1, warnings: [], timings: {} };

function run(result: Partial<GenerateResult>) {
  const seen: { deps?: GenerateDeps; prompt?: string; signal?: AbortSignal }[] = [];
  const results: GenerateResult[] = [];
  const deps: InterimDeps = {
    deps: () => ({}) as GenerateDeps,
    generate: async (prompt, _settings, deps, signal) => {
      seen.push({ deps, prompt, signal });
      return { ...base, status: "ready", ...result } as GenerateResult;
    },
    onResult: (_job, r) => results.push(r),
  };
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "cli", handlers: { "playground.generate": interimGenerate(deps) }, pollMs: 5 });
  const j = enqueue(env.db, { type: "playground.generate", projectId: "playground", sceneId: "scn_1", input: { sceneId: "scn_1", prompt: "Рост", settings: defaultSettings() }, idempotencyKey: "k" }).job;
  runner.start();
  return { j, seen, results };
}

it("ready → completed with refs; generateScene gets the job run context and the scene", async () => {
  const { j, seen, results } = run({ status: "ready", sceneId: "scn_1", versionDir: "/v", previewPath: "/v/preview.mp4" });
  await until(() => jobs.get(env.db, j.id)!.status === "completed", "completed");
  expect(jobs.get(env.db, j.id)!.output_refs).toMatchObject({ scene_id: "scn_1", version_dir: "/v", preview_path: "/v/preview.mp4", cost_usd: 0.5 });
  expect(seen[0]!.prompt).toBe("Рост");
  expect(seen[0]!.deps!.sceneId).toBe("scn_1");
  expect(seen[0]!.deps!.run).toMatchObject({ runId: j.id, attempt: 1 });
  expect(typeof seen[0]!.deps!.run!.registry!.live).toBe("function");
  expect(seen[0]!.signal).toBeInstanceOf(AbortSignal);
  expect(results).toHaveLength(1);
});

it("failed at a pipeline stage → failed with code from failureToJobErrorCode", async () => {
  const { j } = run({ status: "failed", failure: { stage: "typecheck", message: "TS2322" } });
  await until(() => jobs.get(env.db, j.id)!.status === "failed", "failed");
  expect(jobs.get(env.db, j.id)!.error).toEqual({ code: "pipeline", stage: "typecheck", message: "TS2322" });
});

it("orphaned → blocked(stale_process) (rulings п.13)", async () => {
  const { j } = run({ status: "failed", failure: { stage: "orphaned", message: "группа не исчезла" } });
  await until(() => jobs.get(env.db, j.id)!.status === "blocked", "blocked");
  expect(jobs.get(env.db, j.id)!.error).toMatchObject({ code: "stale_process", stage: "orphaned" });
});

it("cancelled → cancelled; bad input → failed(pipeline)", async () => {
  const { j } = run({ status: "failed", failure: { stage: "cancelled", message: "отменено" } });
  await until(() => jobs.get(env.db, j.id)!.status === "cancelled", "cancelled");
  const bad = enqueue(env.db, { type: "playground.generate", projectId: "playground", sceneId: "scn_2", input: { prompt: 1 }, idempotencyKey: "bad" }).job;
  await until(() => jobs.get(env.db, bad.id)!.status === "failed", "failed");
  expect(jobs.get(env.db, bad.id)!.error!.message).toMatch(/вход/);
});
