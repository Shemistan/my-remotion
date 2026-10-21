import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import * as jobs from "../../src/db/repos/jobs.js";
import * as sceneLocks from "../../src/db/repos/scene-locks.js";
import { claimNext, enqueue, finish, requestCancel } from "../../src/jobs/queue.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { JobHandler } from "../../src/jobs/types.js";
import { QUARANTINE, createDraft, quarantineDraft } from "../../src/scenes/store.js";
import { deferred, idle, req, setupDb, teardownDb, until, type JobsEnv } from "./helpers.js";

let env: JobsEnv;
let runner: JobRunner | undefined;
beforeEach(async () => { env = await setupDb("ms-jobs-cancel-"); });
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  await teardownDb(env);
});

const versionCount = (): number => (env.db.prepare("SELECT count(*) AS n FROM scene_versions").get() as { n: number }).n;

it("pending → сразу cancelled с кодом cancelled; повтор и терминальные — без изменений", () => {
  const { db } = env;
  const j = enqueue(db, req()).job;
  const c = requestCancel(db, j.id);
  expect(c).toMatchObject({ status: "cancelled", error: { code: "cancelled", stage: "cancelled" } });
  expect(c.finished_at).not.toBeNull();
  expect(requestCancel(db, j.id)).toEqual(c);
  expect(claimNext(db, "srv", 0, idle)).toBeUndefined();
  expect(() => requestCancel(db, "job_nope")).toThrow(/job_not_found/);
});

it("awaiting_input → сразу cancelled", () => {
  const { db } = env;
  const j = enqueue(db, req()).job;
  claimNext(db, "srv", 0, idle);
  finish(db, j.id, 1, { status: "awaiting_input", questions: [] });
  expect(requestCancel(db, j.id)).toMatchObject({ status: "cancelled" });
});

it("running → cancel_requested; finish(awaiting_input) при запрошенной отмене даёт cancelled", () => {
  const { db } = env;
  const j = enqueue(db, req()).job;
  claimNext(db, "srv", 0, idle);
  expect(requestCancel(db, j.id)).toMatchObject({ status: "running", cancel_requested: true });
  expect(finish(db, j.id, 1, { status: "awaiting_input", questions: [] })).toBe(true);
  expect(jobs.get(db, j.id)).toMatchObject({ status: "cancelled", error: { code: "cancelled" } });
});

it("отмена running: обработчик получает aborted signal, draft в карантине `cancelled`, версии нет, статус cancelled", async () => {
  const { db, s } = env;
  const started = deferred();
  let draftDir = "";
  const handler: JobHandler = async (ctx) => {
    const draft = await createDraft(ctx.run.root, { runId: ctx.run.runId, attempt: ctx.run.attempt, sceneId: ctx.job.scene_id! });
    draftDir = draft.dir;
    started.resolve();
    await new Promise<void>((resolve) => ctx.signal.addEventListener("abort", () => resolve(), { once: true }));
    await quarantineDraft(draft, "cancelled");
    return { status: "cancelled", error: { code: "cancelled", stage: "cancelled", message: "отменено" } };
  };
  runner = new JobRunner({ db, root: s.root, owner: "srv", handlers: { "playground.generate": handler }, pollMs: 5, heartbeatMs: 20 });
  const j = enqueue(db, req()).job;
  runner.start();
  await started.promise;
  requestCancel(db, j.id);
  await until(() => jobs.get(db, j.id)!.status === "cancelled", "задача cancelled");
  expect(jobs.get(db, j.id)!.error).toMatchObject({ code: "cancelled" });
  expect(draftDir).toBe(join(s.root, "workspace/drafts", `${j.id}-a1`));
  expect(existsSync(join(draftDir, QUARANTINE))).toBe(true);
  expect(JSON.parse(readFileSync(join(draftDir, QUARANTINE), "utf8"))).toMatchObject({ reason: "cancelled" });
  expect(versionCount()).toBe(0);
  expect(sceneLocks.holder(db, "scn_1")).toBeUndefined();
  expect(runner.running()).toEqual([]);
});

it("обработчик бросает AbortError после отмены → cancelled, не failed", async () => {
  const { db, s } = env;
  const handler: JobHandler = (ctx) => new Promise((_, reject) => {
    ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason as Error), { once: true });
  });
  runner = new JobRunner({ db, root: s.root, owner: "srv", handlers: { "playground.generate": handler }, pollMs: 5, heartbeatMs: 1_000 });
  const j = enqueue(db, req()).job;
  runner.start();
  await until(() => runner!.running().length === 1, "задача запущена");
  requestCancel(db, j.id);
  await until(() => jobs.get(db, j.id)!.status === "cancelled", "задача cancelled");
  expect(jobs.get(db, j.id)!.error).toMatchObject({ code: "cancelled", stage: "cancelled" });
});
