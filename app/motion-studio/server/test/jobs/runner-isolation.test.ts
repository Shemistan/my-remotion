// Раннер и изоляция попыток (Task 13): реестр в контексте попытки, orphaned → blocked,
// принудительный таймаут обработчика, игнорирующего abort, fencing на уровне раннера.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type ProcessRegistry, type TrackedProcess, fileProcessRegistry, procInfo, spawnTracked } from "@ms/core";
import * as jobEvents from "../../src/db/repos/job-events.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as sceneLocks from "../../src/db/repos/scene-locks.js";
import * as versions from "../../src/db/repos/versions.js";
import { SqliteProcessRegistry, mergeRegistries } from "../../src/jobs/process-registry.js";
import { enqueue, requestCancel } from "../../src/jobs/queue.js";
import { JobRunner, type JobRunnerOptions } from "../../src/jobs/runner.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { makeDraft, meta } from "../scenes/helpers.js";
import { deferred, req, setupDb, teardownDb, until, type JobsEnv } from "./helpers.js";
import { ORPHAN_RENDER, killLeftovers, readPid, track, waitFor } from "./procs.js";

let env: JobsEnv;
let runner: JobRunner | undefined;
let registry: ProcessRegistry;
beforeEach(async () => {
  env = await setupDb("ms-jobs-iso-");
  registry = mergeRegistries(new SqliteProcessRegistry(env.db), fileProcessRegistry(env.s.root));
});
afterEach(async () => {
  killLeftovers();
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  await teardownDb(env);
});

function make(handlers: JobRunnerOptions["handlers"], over: Partial<JobRunnerOptions> = {}): JobRunner {
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers, pollMs: 5, heartbeatMs: 20, registry, ...over });
  return runner;
}
const kinds = (jobId: string): string[] => jobEvents.listSince(env.db, 0, { jobId }).map((e) => e.kind);
const self = async (ref: { runId: string; attempt: number }, cmd: string): Promise<TrackedProcess> => ({
  ...ref, pid: process.pid, pgid: process.pid, startedAt: (await procInfo(process.pid))!.startedAt, cmd,
});

it("ctx.run carries the runner registry; a real child is recorded and ended in job_processes", async () => {
  const r = make({
    "playground.generate": async (ctx) => {
      expect(ctx.run.registry).toBe(registry);
      const res = await spawnTracked(ctx.run.root, ctx.run, "/bin/sh", ["-c", "exit 0"], { cwd: env.s.tmp, env: process.env, signal: ctx.signal, registry: ctx.run.registry });
      return { status: "completed", outputRefs: { code: res.code } };
    },
  });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => jobs.get(env.db, j.id)!.status === "completed", "completed");
  expect(env.db.prepare("SELECT job_id, attempt, exit_code, ended_at IS NOT NULL AS ended FROM job_processes").all())
    .toEqual([{ job_id: j.id, attempt: 1, exit_code: 0, ended: 1 }]);
});

it("rulings п.13: failed(stale_process) from a handler becomes blocked with the live pids; locks kept", async () => {
  let child: TrackedProcess | undefined;
  const r = make({
    "playground.generate": async (ctx) => {
      // spawnTracked вернул orphaned: запись осталась в реестре
      child = await self({ runId: ctx.run.runId, attempt: ctx.attempt }, "chrome (orphaned)");
      await ctx.run.registry.add(child);
      return { status: "failed", error: { code: "stale_process", stage: "orphaned", message: "группа не исчезла" } };
    },
  });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => jobs.get(env.db, j.id)!.status === "blocked", "blocked");
  expect(jobs.get(env.db, j.id)!.error).toMatchObject({ code: "stale_process", stage: "orphaned", pids: [process.pid], cmds: ["chrome (orphaned)"] });
  expect(sceneLocks.holder(env.db, "scn_1")).toBe(j.id);
  await registry.end(child!, { code: null, signal: null });
});

it("Task 12 carry: cancel of a handler ignoring abort → after abortTimeoutMs its processes are reaped (real SIGTERM-ignoring child) and the job is cancelled", async () => {
  const pidFile = join(env.s.tmp, "gc.pid");
  let leader = 0;
  const r = make({
    "playground.generate": async (ctx) => {
      // процесс запущен в обход signal (обработчик abort не слушает) и записан в реестр
      const c = spawn(ORPHAN_RENDER, [pidFile], { detached: true, stdio: "ignore" });
      c.unref();
      leader = c.pid!;
      track(leader);
      await ctx.run.registry.add({ runId: ctx.run.runId, attempt: ctx.attempt, pid: leader, pgid: leader, startedAt: (await procInfo(leader))!.startedAt, cmd: "orphan-render.sh" });
      return new Promise(() => undefined); // никогда не возвращается
    },
  }, { abortTimeoutMs: 200, reapOptions: { graceMs: 200, waitMs: 3000 } });
  const j = enqueue(env.db, req()).job;
  r.start();
  const gc = await waitFor(() => readPid(pidFile), "внук");
  expect(await procInfo(gc)).toBeDefined();
  requestCancel(env.db, j.id);
  await until(() => jobs.get(env.db, j.id)!.status === "cancelled", "cancelled", 8000);
  expect(await procInfo(gc)).toBeUndefined();
  expect(await procInfo(leader)).toBeUndefined();
  expect(sceneLocks.holder(env.db, "scn_1")).toBeUndefined();
  expect(r.running()).toEqual([]);
  expect(kinds(j.id)).toContain("abort_timeout");
});

it("abort timeout with an unkillable process → blocked(stale_process); the late result is ignored", async () => {
  const late = deferred();
  const r = make({
    "playground.generate": async (ctx) => {
      await ctx.run.registry.add(await self({ runId: ctx.run.runId, attempt: ctx.attempt }, "stuck"));
      await late.promise;
      return { status: "completed", outputRefs: { late: true } };
    },
  }, { abortTimeoutMs: 100, reapOptions: { kill: () => undefined, graceMs: 20, waitMs: 20 } });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => jobs.get(env.db, j.id)!.status === "running", "running");
  requestCancel(env.db, j.id);
  await until(() => jobs.get(env.db, j.id)!.status === "blocked", "blocked", 5000);
  expect(jobs.get(env.db, j.id)!.error).toMatchObject({ code: "stale_process", pids: [process.pid], cmds: ["stuck"] });
  expect(sceneLocks.holder(env.db, "scn_1")).toBe(j.id);
  late.resolve();
  await new Promise((res) => setTimeout(res, 50));
  expect(jobs.get(env.db, j.id)!.status).toBe("blocked");
  expect(kinds(j.id)).toContain("late_result_ignored");
  for (const p of await registry.live()) await registry.end(p, { code: null, signal: null });
});

it("non-cancel abort of a handler ignoring it (stop) leaves the job running for recovery; stop() does not hang", async () => {
  const r = make({ "playground.generate": async () => new Promise(() => undefined) }, { abortTimeoutMs: 100 });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => jobs.get(env.db, j.id)!.status === "running", "running");
  const t0 = Date.now();
  await r.stop({ abortRunning: true });
  expect(Date.now() - t0).toBeLessThan(3000);
  expect(jobs.get(env.db, j.id)!.status).toBe("running");
  expect(kinds(j.id)).toEqual(expect.arrayContaining(["abort_timeout", "interrupted"]));
});

it("09 §5 п.9: attempt 1 still alive, job claimed by attempt 2 → attempt 1 publish is fenced_out, no version, draft quarantined", async () => {
  const repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  const first = deferred();
  let publishErr: unknown;
  const r = make({
    "playground.generate": async (ctx) => {
      if (ctx.attempt === 1) {
        await first.promise; // «живой процесс» попытки 1 продолжает работу
        const d = await makeDraft(env.s.root, { runId: ctx.run.runId, attempt: 1, sceneId: "scn_1" });
        try {
          await repo.publish(d, meta("scn_1"), { jobId: ctx.job.id, attempt: 1 });
        } catch (e) {
          publishErr = e;
        }
        return { status: "failed", error: { code: "fenced_out", message: "попытка 1 устарела" } };
      }
      return new Promise(() => undefined);
    },
  }, { abortTimeoutMs: 300 });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => jobs.get(env.db, j.id)!.attempt === 1 && jobs.get(env.db, j.id)!.status === "running", "попытка 1");
  // повторный захват без подтверждения смерти попытки 1 (то, что ADR запрещает, но fencing страхует)
  jobs.update(env.db, j.id, { status: "pending" });
  sceneLocks.release(env.db, "scn_1", j.id);
  await until(() => jobs.get(env.db, j.id)!.attempt === 2, "попытка 2");
  first.resolve();
  await until(() => publishErr !== undefined, "публикация попытки 1");
  expect(String(publishErr)).toMatch(/fenced_out/);
  expect(versions.listByScene(env.db, "scn_1")).toEqual([]);
  expect(existsSync(join(env.s.root, "workspace/drafts", `${j.id}-a1`, ".quarantined"))).toBe(true);
  expect(jobs.get(env.db, j.id)).toMatchObject({ status: "running", attempt: 2 });
  // обе попытки одной задачи учитываются раздельно (ключ — попытка)
  expect(r.running().map((a) => a.attempt)).toContain(2);
});

it("isPaused and useDb (StorageSupervisor hooks)", async () => {
  const r = make({ "playground.generate": async () => ({ status: "completed", outputRefs: {} }) });
  expect(r.isPaused()).toBe(false);
  r.pause();
  expect(r.isPaused()).toBe(true);
  r.useDb(env.db);
  r.resume();
  expect(r.isPaused()).toBe(false);
});
