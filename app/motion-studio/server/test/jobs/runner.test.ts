import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as jobs from "../../src/db/repos/jobs.js";
import * as jobEvents from "../../src/db/repos/job-events.js";
import { enqueue } from "../../src/jobs/queue.js";
import { JobRunner, isStorageError, type JobRunnerOptions } from "../../src/jobs/runner.js";
import { EventBus } from "../../src/jobs/events.js";
import { AGENT_CALLS, LEASE_MS, RENDERS } from "../../src/jobs/limits.js";
import { registerHandlers } from "../../src/jobs/handlers.js";
import type { JobContext, JobHandler } from "../../src/jobs/types.js";
import { deferred, edit, job, req, setupDb, teardownDb, until, type JobsEnv } from "./helpers.js";

let env: JobsEnv;
let runner: JobRunner | undefined;
beforeEach(async () => { env = await setupDb("ms-jobs-runner-"); });
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  await teardownDb(env);
});

function make(handlers: JobRunnerOptions["handlers"], over: Partial<JobRunnerOptions> = {}): JobRunner {
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers, pollMs: 5, heartbeatMs: 20, ...over });
  return runner;
}

const kinds = (jobId: string): string[] => jobEvents.listSince(env.db, 0, { jobId }).map((e) => e.kind);

/** Обработчик, который ждёт, пока тест его отпустит. */
function gate(): { handler: JobHandler; ctxs: JobContext[]; release: () => void } {
  const d = deferred();
  const ctxs: JobContext[] = [];
  return {
    ctxs,
    release: () => d.resolve(),
    handler: async (ctx) => {
      ctxs.push(ctx);
      await d.promise;
      return { status: "completed", outputRefs: { by: ctx.job.idempotency_key } };
    },
  };
}

it("задача выполняется: контекст попытки, completed через finish, события", async () => {
  let seen: JobContext | undefined;
  const r = make({ "playground.generate": async (ctx) => { seen = ctx; ctx.emit("stage", "concept", { n: 1 }); return { status: "completed", outputRefs: { ok: 1 } }; } });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => jobs.get(env.db, j.id)!.status === "completed", "completed");
  expect(jobs.get(env.db, j.id)!.output_refs).toEqual({ ok: 1 });
  expect(seen!.run).toMatchObject({ root: env.s.root, runId: j.id, attempt: 1 });
  // реестр процессов попытки (Task 13): по умолчанию — файловый
  expect(typeof seen!.run.registry.live).toBe("function");
  expect(seen!.attempt).toBe(1);
  expect(seen!.job.status).toBe("running");
  expect(seen!.fenceOk()).toBe(false); // задача уже завершена
  expect(kinds(j.id)).toEqual(["started", "stage", "completed"]);
  expect(r.running()).toEqual([]);
});

it("исключение обработчика → failed, code pipeline", async () => {
  const r = make({ "playground.generate": async () => { throw new Error("сломалось"); } });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => jobs.get(env.db, j.id)!.status === "failed", "failed");
  expect(jobs.get(env.db, j.id)!.error).toEqual({ code: "pipeline", message: "сломалось" });
  expect(kinds(j.id)).toEqual(["started", "failed"]);
});

it("лимит maxRunning 2: третья задача не стартует, пока идут две", async () => {
  const g = gate();
  const r = make({ "playground.edit": g.handler });
  enqueue(env.db, edit("scn_1", "a"));
  enqueue(env.db, edit("scn_2", "b"));
  enqueue(env.db, job("scene.restore", "scn_1", "c")); // другой слот, но замок scn_1 тоже держит a
  enqueue(env.db, job("playground.edit", "scn_2", "d"));
  r.start();
  await until(() => r.running().length === 2, "две задачи");
  await new Promise((res) => setTimeout(res, 30));
  expect(r.running()).toHaveLength(2);
  expect(jobs.list(env.db, { status: "pending" })).toHaveLength(2);
  g.release();
  await until(() => jobs.list(env.db, { status: "completed" }).length === 3, "три завершены");
  // c — restore без обработчика: не захватывается
  expect(jobs.list(env.db, { status: "pending" }).map((x) => x.idempotency_key)).toEqual(["c"]);
});

it("семафоры общие для задач: heavy = 1 — вторая ждёт, agents = AGENT_CALLS, renders = RENDERS", async () => {
  const held = deferred();
  const order: string[] = [];
  const handler: JobHandler = async (ctx) => {
    const release = await ctx.heavy.acquire(ctx.signal);
    order.push(`in:${ctx.job.idempotency_key}`);
    if (ctx.job.idempotency_key === "a") await held.promise;
    order.push(`out:${ctx.job.idempotency_key}`);
    release();
    return { status: "completed", outputRefs: {} };
  };
  let ctxA: JobContext | undefined;
  let ctxB: JobContext | undefined;
  const r = make({ "playground.edit": async (ctx) => { if (ctx.job.idempotency_key === "a") ctxA = ctx; else ctxB = ctx; return handler(ctx); } });
  enqueue(env.db, edit("scn_1", "a"));
  enqueue(env.db, edit("scn_2", "b"));
  r.start();
  await until(() => r.running().length === 2 && order.length === 1, "обе стартовали, одна внутри heavy");
  await new Promise((res) => setTimeout(res, 20));
  expect(order).toEqual(["in:a"]);
  expect(ctxB!.heavy.available()).toBe(0); // место у a — семафор общий
  expect(ctxA!.agents.available()).toBe(AGENT_CALLS);
  expect(ctxA!.renders.available()).toBe(RENDERS);
  held.resolve();
  await until(() => jobs.list(env.db, { status: "completed" }).length === 2, "обе завершены");
  expect(order).toEqual(["in:a", "out:a", "in:b", "out:b"]);
});

it("heartbeat продлевает lease по часам раннера; progress пишет этап", async () => {
  let t = 1_000_000;
  const g = gate();
  const r = make({ "playground.generate": async (ctx) => { ctx.progress(0.4, "render"); return g.handler(ctx); } }, { clock: { now: () => t } });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => r.running().length === 1, "запущена");
  expect(jobs.get(env.db, j.id)).toMatchObject({ lease_until: new Date(1_000_000 + LEASE_MS).toISOString(), progress: 0.4, stage: "render" });
  t = 2_000_000;
  await until(() => jobs.get(env.db, j.id)!.lease_until === new Date(2_000_000 + LEASE_MS).toISOString(), "lease продлён");
  expect(kinds(j.id)).toContain("progress");
  g.release();
  await until(() => jobs.get(env.db, j.id)!.status === "completed", "completed");
});

it("fencing в раннере: попытку перехватили → heartbeat false, signal aborted, результат не пишется", async () => {
  let aborted = false;
  const g = gate();
  const r = make({
    "playground.generate": async (ctx) => {
      ctx.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
      const out = await g.handler(ctx);
      ctx.progress(0.9, "late");
      return out;
    },
  });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => r.running().length === 1, "запущена");
  env.db.prepare("UPDATE jobs SET attempt = 2 WHERE id = ?").run(j.id);
  await until(() => aborted, "abort по fencing");
  g.release();
  await until(() => r.running().length === 0, "попытка вышла");
  expect(jobs.get(env.db, j.id)).toMatchObject({ status: "running", attempt: 2, progress: 0, output_refs: null });
  expect(kinds(j.id)).toContain("fenced_out");
});

it("stop({ abortRunning }) прерывает попытку без записи результата: задача остаётся running для восстановления", async () => {
  const r = make({
    "playground.generate": (ctx) => new Promise((resolve) => {
      ctx.signal.addEventListener("abort", () => resolve({ status: "cancelled", error: { code: "cancelled", message: "abort" } }), { once: true });
    }),
  });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => r.running().length === 1, "запущена");
  const ctl = r.running()[0]!;
  expect(ctl).toMatchObject({ jobId: j.id, attempt: 1 });
  await r.stop({ abortRunning: true });
  expect(ctl.controller.signal.aborted).toBe(true);
  expect(jobs.get(env.db, j.id)).toMatchObject({ status: "running", attempt: 1 });
  expect(kinds(j.id)).toContain("interrupted");
  // после stop новые задачи не захватываются
  enqueue(env.db, edit("scn_2", "late"));
  await new Promise((res) => setTimeout(res, 20));
  expect(jobs.findByIdempotencyKey(env.db, "late")!.status).toBe("pending");
});

it("stop({ abortRunning: false }) дожидается завершения", async () => {
  const g = gate();
  const r = make({ "playground.generate": g.handler });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => r.running().length === 1, "запущена");
  const stopped = r.stop({ abortRunning: false });
  g.release();
  await stopped;
  expect(jobs.get(env.db, j.id)!.status).toBe("completed");
});

it("pause/resume: на паузе задачи не захватываются", async () => {
  const r = make({ "playground.generate": async () => ({ status: "completed", outputRefs: {} }) });
  r.start();
  r.pause();
  const j = enqueue(env.db, req()).job;
  await new Promise((res) => setTimeout(res, 30));
  expect(jobs.get(env.db, j.id)!.status).toBe("pending");
  r.resume();
  await until(() => jobs.get(env.db, j.id)!.status === "completed", "completed после resume");
});

it("awaiting_input от обработчика; общий EventBus получает события раннера", async () => {
  const bus = new EventBus(env.db);
  const live: string[] = [];
  bus.subscribe(0, (e) => live.push(e.kind));
  const r = make({ "playground.generate": async () => ({ status: "awaiting_input", questions: [{ question: "Цвет?", default_if_skipped: "синий" }] }) }, { events: bus });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => jobs.get(env.db, j.id)!.status === "awaiting_input", "awaiting_input");
  expect(live).toEqual(["started", "awaiting_input"]);
});

it("registerHandlers: playground.generate — обработчик пайплайна; extra дописывает свои типы", () => {
  const h: JobHandler = async () => ({ status: "completed", outputRefs: {} });
  const hs = registerHandlers({} as never, {}, { "scene.export": h });
  expect(hs["scene.export"]).toBe(h);
  expect(typeof hs["playground.generate"]).toBe("function");
});

it("места семафоров возвращаются, если обработчик бросил исключение, держа heavy", async () => {
  const r = make({
    "playground.edit": async (ctx) => {
      await ctx.heavy.acquire(ctx.signal);
      if (ctx.job.idempotency_key === "a") throw new Error("упал с heavy");
      return { status: "completed", outputRefs: {} };
    },
  });
  const a = enqueue(env.db, edit("scn_1", "a")).job;
  r.start();
  await until(() => jobs.get(env.db, a.id)!.status === "failed", "a failed");
  expect(kinds(a.id)).toContain("permits_released");
  const b = enqueue(env.db, edit("scn_2", "b")).job;
  await until(() => jobs.get(env.db, b.id)!.status === "completed", "b получил heavy");
});

it("сбой такта не из-за хранилища — onError и stderr один раз, раннер продолжает", async () => {
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    env.db.exec("CREATE TRIGGER boom BEFORE UPDATE ON jobs BEGIN SELECT RAISE(ABORT, 'boom'); END");
    const errors: unknown[] = [];
    const r = make({ "playground.generate": async () => ({ status: "completed", outputRefs: {} }) }, { onError: (e) => errors.push(e) });
    const j = enqueue(env.db, req()).job;
    r.start();
    await until(() => errors.length === 1, "onError");
    await new Promise((res) => setTimeout(res, 30)); // ещё несколько тактов с той же ошибкой
    expect(errors).toHaveLength(1);
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(String(errSpy.mock.calls[0]![0])).toMatch(/runner_error: boom/);
    env.db.exec("DROP TRIGGER boom");
    await until(() => jobs.get(env.db, j.id)!.status === "completed", "раннер продолжил");
  } finally {
    errSpy.mockRestore();
  }
});

it("isStorageError: закрытая база и ошибки ввода-вывода — да, прочее — нет", () => {
  expect(isStorageError(new TypeError("The database connection is not open"))).toBe(true);
  expect(isStorageError(Object.assign(new Error("disk I/O error"), { code: "SQLITE_IOERR_WRITE" }))).toBe(true);
  expect(isStorageError(Object.assign(new Error("boom"), { code: "SQLITE_CONSTRAINT_TRIGGER" }))).toBe(false);
  expect(isStorageError(new Error("bug"))).toBe(false);
});

it("resume() до start() задачи не захватывает", async () => {
  const r = make({ "playground.generate": async () => ({ status: "completed", outputRefs: {} }) });
  const j = enqueue(env.db, req()).job;
  r.pause();
  r.resume();
  await new Promise((res) => setTimeout(res, 30));
  expect(jobs.get(env.db, j.id)!.status).toBe("pending");
  r.start();
  await until(() => jobs.get(env.db, j.id)!.status === "completed", "после start");
});
