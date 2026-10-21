import { afterEach, beforeEach, expect, it } from "vitest";
import type { JobEventDto } from "@ms/contracts";
import * as jobEvents from "../../src/db/repos/job-events.js";
import { tx } from "../../src/db/tx.js";
import { enqueue } from "../../src/jobs/queue.js";
import { EventBus } from "../../src/jobs/events.js";
import { req, setupDb, teardownDb, type JobsEnv } from "./helpers.js";

let env: JobsEnv;
let jobId: string;
beforeEach(async () => {
  env = await setupDb("ms-jobs-events-");
  jobId = enqueue(env.db, req()).job.id;
});
afterEach(async () => { await teardownDb(env); });

it("emit пишет job_events и рассылает подписчикам", () => {
  const bus = new EventBus(env.db);
  const got: JobEventDto[] = [];
  const off = bus.subscribe(0, (e) => got.push(e));
  const ev = bus.emit(env.db, { job_id: jobId, level: "info", kind: "stage", message: "concept", data: { p: 0.1 } });
  expect(ev).toMatchObject({ job_id: jobId, kind: "stage", message: "concept", data: { p: 0.1 } });
  expect(got).toEqual([ev]);
  expect(jobEvents.listSince(env.db, 0)).toEqual([ev]);
  off();
  bus.emit(env.db, { job_id: jobId, level: "info", kind: "stage", message: "after" });
  expect(got).toHaveLength(1);
});

it("subscribe(5) догоняет события 6.. из БД, затем получает живые, без дублей", () => {
  for (let i = 1; i <= 8; i++) jobEvents.insert(env.db, { job_id: jobId, level: "info", kind: "k", message: `m${i}` });
  const bus = new EventBus(() => env.db);
  const got: number[] = [];
  bus.subscribe(5, (e) => got.push(e.id));
  expect(got).toEqual([6, 7, 8]);
  bus.emit(env.db, { job_id: jobId, level: "warn", kind: "k", message: "m9" });
  expect(got).toEqual([6, 7, 8, 9]);
});

it("догон больше страницы; ошибка одного подписчика не мешает другим", () => {
  tx(env.db, () => {
    for (let i = 1; i <= 1205; i++) jobEvents.insert(env.db, { job_id: jobId, level: "debug", kind: "k", message: `m${i}` });
  });
  const bus = new EventBus(env.db);
  let n = 0;
  bus.subscribe(0, () => { n++; });
  expect(n).toBe(1205);
  const ok: number[] = [];
  bus.subscribe(1205, () => { throw new Error("сломан"); });
  bus.subscribe(1205, (e) => ok.push(e.id));
  bus.emit(env.db, { job_id: jobId, level: "info", kind: "k", message: "live" });
  expect(ok).toEqual([1206]);
});

it("рассылка только после коммита: внутри tx подписчик события не видит", () => {
  const bus = new EventBus(env.db);
  const got: number[] = [];
  bus.subscribe(0, (e) => got.push(e.id));
  tx(env.db, () => {
    bus.emit(env.db, { job_id: jobId, level: "info", kind: "k", message: "в транзакции" });
    expect(got).toEqual([]);
  });
  expect(got).toEqual([1]);
});

it("откат: ни фантома, ни потерянного id (AUTOINCREMENT выдаёт тот же id снова)", () => {
  const bus = new EventBus(env.db);
  const got: JobEventDto[] = [];
  bus.subscribe(0, (e) => got.push(e));
  expect(() => tx(env.db, () => {
    bus.emit(env.db, { job_id: jobId, level: "info", kind: "k", message: "фантом" });
    throw new Error("откат");
  })).toThrow("откат");
  expect(got).toEqual([]);
  const ev = bus.emit(env.db, { job_id: jobId, level: "info", kind: "k", message: "настоящее" });
  expect(ev.id).toBe(1);
  expect(got.map((e) => [e.id, e.message])).toEqual([[1, "настоящее"]]);
});

it("откат вложенного savepoint отбрасывает только его события", () => {
  const bus = new EventBus(env.db);
  const got: string[] = [];
  bus.subscribe(0, (e) => got.push(e.message));
  tx(env.db, () => {
    bus.emit(env.db, { job_id: jobId, level: "info", kind: "k", message: "внешнее" });
    try {
      tx(env.db, () => {
        bus.emit(env.db, { job_id: jobId, level: "info", kind: "k", message: "вложенное" });
        throw new Error("x");
      });
    } catch { /* откат savepoint */ }
  });
  expect(got).toEqual(["внешнее"]);
});

it("emit в транзакции, открытой в обход tx(), — ошибка", () => {
  const bus = new EventBus(env.db);
  expect(() => env.db.transaction(() => bus.emit(env.db, { job_id: jobId, level: "info", kind: "k", message: "m" }))()).toThrow(/afterCommit/);
  expect(jobEvents.listSince(env.db, 0)).toEqual([]);
});

it("догон ограничен maxCatchup: старые события пропускаются с onGap", () => {
  tx(env.db, () => {
    for (let i = 1; i <= 10; i++) jobEvents.insert(env.db, { job_id: jobId, level: "info", kind: "k", message: `m${i}` });
  });
  const bus = new EventBus(env.db);
  const got: number[] = [];
  const gaps: unknown[] = [];
  bus.subscribe(2, (e) => got.push(e.id), { maxCatchup: 3, onGap: (g) => gaps.push(g) });
  expect(gaps).toEqual([{ afterId: 2, skippedTo: 7, skipped: 5 }]);
  expect(got).toEqual([8, 9, 10]);
  const noGap: unknown[] = [];
  bus.subscribe(7, () => undefined, { maxCatchup: 3, onGap: (g) => noGap.push(g) });
  expect(noGap).toEqual([]);
});
