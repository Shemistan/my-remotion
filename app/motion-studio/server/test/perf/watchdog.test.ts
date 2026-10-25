// Сторож прогресса (Task 49a): молчащая попытка → failed(stalled); прогресс, события и ожидание
// места в семафоре — не молчание; пороги по типам не убивают законно долгие задачи.
import { afterEach, beforeEach, expect, it } from "vitest";
import * as jobs from "../../src/db/repos/jobs.js";
import * as jobEvents from "../../src/db/repos/job-events.js";
import { enqueue, requestCancel } from "../../src/jobs/queue.js";
import { JobRunner, type JobRunnerOptions } from "../../src/jobs/runner.js";
import { loadConfig } from "../../src/config.js";
import { EXPORT_TIMEOUT_MS } from "@ms/render";
import { WATCHDOG_MARGIN_MS, WATCHDOG_MIN_MS, noProgressLimits } from "../../src/perf/watchdog.js";
import { deferred, edit, req, setupDb, teardownDb, until, type JobsEnv } from "../jobs/helpers.js";

let env: JobsEnv;
let runner: JobRunner | undefined;
beforeEach(async () => { env = await setupDb("ms-perf-watchdog-"); });
afterEach(async () => {
  await runner?.stop({ abortRunning: true });
  runner = undefined;
  await teardownDb(env);
});

function make(handlers: JobRunnerOptions["handlers"], noProgressMs: Record<string, number>, over: Partial<JobRunnerOptions> = {}): JobRunner {
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers, pollMs: 5, heartbeatMs: 20, watchdog: { noProgressMs }, ...over });
  return runner;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
const kinds = (jobId: string) => jobEvents.listSince(env.db, 0, { jobId }).map((e) => e.kind);

it("молчащая задача (1 с без прогресса при пороге 200 мс) → failed(stalled) с этапом", async () => {
  const r = make({
    "playground.generate": async (ctx) => {
      ctx.progress(0.1, "director");
      await sleep(1000, ctx.signal);
      return ctx.signal.aborted ? { status: "cancelled", error: { code: "cancelled", stage: "cancelled", message: "прервано" } } : { status: "completed", outputRefs: {} };
    },
  }, { "playground.generate": 200 });
  const j = enqueue(env.db, req()).job;
  const t0 = Date.now();
  r.start();
  await until(() => jobs.get(env.db, j.id)!.status === "failed", "failed", 3000);
  expect(Date.now() - t0).toBeLessThan(900);
  const got = jobs.get(env.db, j.id)!;
  expect(got).toMatchObject({ status: "failed", error: { code: "stalled" } });
  expect(got.error!.message).toContain("director");
  expect(kinds(j.id)).toContain("stalled");
});

it("обработчик не возвращается после abort: попытка отцеплена, процессов нет → failed(stalled)", async () => {
  const never = deferred();
  const r = make({ "playground.generate": async () => { await never.promise; return { status: "completed", outputRefs: {} }; } },
    { "playground.generate": 100 }, { abortTimeoutMs: 100 });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => jobs.get(env.db, j.id)!.status === "failed", "failed", 3000);
  expect(jobs.get(env.db, j.id)!.error).toMatchObject({ code: "stalled" });
  never.resolve();
});

it("прогресс и события чаще порога — задача идёт дольше порога и завершается", async () => {
  const r = make({
    "playground.generate": async (ctx) => {
      for (let i = 0; i < 8; i++) {
        await sleep(60);
        if (i % 2) ctx.progress(i / 8, "render");
        else ctx.emit("log", "шаг");
      }
      return { status: "completed", outputRefs: {} };
    },
  }, { "playground.generate": 200 });
  const j = enqueue(env.db, req()).job;
  r.start();
  await until(() => jobs.get(env.db, j.id)!.status === "completed", "completed", 3000);
  expect(kinds(j.id)).not.toContain("stalled");
});

it("ожидание места в семафоре — не молчание: вторая задача ждёт рендер дольше порога", async () => {
  const hold = deferred();
  const r = make({
    "playground.edit": async (ctx) => {
      const release = await ctx.renders.acquire(ctx.signal);
      if (ctx.job.idempotency_key === "a") {
        // держит единственное место, сама сообщает о прогрессе
        for (let i = 0; i < 10; i++) { ctx.progress(i / 10, "render"); await sleep(50); }
        await hold.promise;
      }
      release();
      return { status: "completed", outputRefs: {} };
    },
  }, { "playground.edit": 150 }, { renders: 1 });
  const a = enqueue(env.db, edit("scn_1", "a")).job;
  const b = enqueue(env.db, edit("scn_2", "b")).job;
  r.start();
  await sleep(600);
  hold.resolve();
  await until(() => jobs.get(env.db, b.id)!.status === "completed" && jobs.get(env.db, a.id)!.status === "completed", "обе", 3000);
});

it("тип без порога не сторожится; отмена человеком остаётся cancelled", async () => {
  const r = make({
    "playground.generate": async (ctx) => { await sleep(400, ctx.signal); return { status: "completed", outputRefs: {} }; },
    "scene.restore": async (ctx) => { await sleep(5000, ctx.signal); return { status: "cancelled", error: { code: "cancelled", stage: "cancelled", message: "x" } }; },
  }, { "scene.restore": 10_000 });
  const g = enqueue(env.db, req()).job;
  const s = enqueue(env.db, { type: "scene.restore", projectId: "playground", sceneId: "scn_2", input: {}, idempotencyKey: "s" }).job;
  r.start();
  await until(() => jobs.get(env.db, g.id)!.status === "completed", "completed", 3000);
  requestCancel(env.db, s.id);
  await until(() => jobs.get(env.db, s.id)!.status === "cancelled", "cancelled", 3000);
});

it("пороги по умолчанию: долгие этапы не меньше своих таймаутов; config заменяет тип", () => {
  const cfg = loadConfig({ MS_DATA_DIR: "/tmp/x", HOME: "/tmp" }, {});
  const l = noProgressLimits(cfg);
  const agentMax = Math.max(...Object.values(cfg.agents).map((a) => a.timeoutMs));
  const base = Math.max(WATCHDOG_MIN_MS, agentMax + WATCHDOG_MARGIN_MS, EXPORT_TIMEOUT_MS + WATCHDOG_MARGIN_MS);
  expect(l["playground.generate"]).toBe(base);
  expect(l["playground.generate"]!).toBeGreaterThan(agentMax);
  expect(l["scene.export"]!).toBeGreaterThan(EXPORT_TIMEOUT_MS);
  expect(l["asr.transcribe"]!).toBeGreaterThan(cfg.asr.noOutputTimeoutMs);
  expect(l["final.render"]!).toBeGreaterThan(cfg.final.timeoutMs);
  expect(l["final.reproduce"]!).toBeGreaterThan(cfg.final.timeoutMs);
  const over = noProgressLimits({ ...cfg, watchdog: { noProgressMs: { "cache.gc": 60_000 } } });
  expect(over["cache.gc"]).toBe(60_000);
  // долгий вызов агента в config.json поднимает порог агентных задач
  const slow = noProgressLimits({ ...cfg, agents: { ...cfg.agents, engineer: { ...cfg.agents.engineer, timeoutMs: 3 * 3600_000 } } });
  expect(slow["playground.edit"]).toBe(3 * 3600_000 + WATCHDOG_MARGIN_MS);
});
