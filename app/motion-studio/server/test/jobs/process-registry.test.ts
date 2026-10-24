// SqliteProcessRegistry (ADR 0007 п. 3): `job_processes` + копия в памяти на время
// `storage_offline`; слияние с боковым файловым реестром Chrome.
import { afterEach, beforeEach, expect, it } from "vitest";
import { type TrackedProcess, fileProcessRegistry, spawnTracked } from "@ms/core";
import { openDb } from "../../src/db/open.js";
import * as jobProcesses from "../../src/db/repos/job-processes.js";
import { SqliteProcessRegistry, mergeRegistries } from "../../src/jobs/process-registry.js";
import { setupDb, teardownDb, type JobsEnv } from "./helpers.js";

let env: JobsEnv;
beforeEach(async () => { env = await setupDb("ms-jobs-preg-"); });
afterEach(async () => {
  if (env.db.open) await teardownDb(env);
  else {
    env.db = openDb(env.s.root);
    await teardownDb(env);
  }
});

const rec = (over: Partial<TrackedProcess> = {}): TrackedProcess => ({ runId: "job_1", attempt: 1, pid: 4242, pgid: 4242, startedAt: "Mon Oct 20 10:00:00 2026", cmd: "claude -p", ...over });

it("add/end/live go to job_processes and the in-memory copy", async () => {
  const reg = new SqliteProcessRegistry(env.db);
  await reg.add(rec());
  await reg.add(rec({ pid: 4343, attempt: 2 }));
  expect(jobProcesses.listLive(env.db).map((p) => p.pid)).toEqual([4242, 4343]);
  expect((await reg.live({ runId: "job_1", attempt: 2 })).map((p) => p.pid)).toEqual([4343]);
  await reg.end(rec(), { code: 0, signal: null });
  expect(jobProcesses.listLive(env.db).map((p) => p.pid)).toEqual([4343]);
  expect(env.db.prepare("SELECT exit_code FROM job_processes WHERE pid = 4242").pluck().get()).toBe(0);
  expect(await reg.live()).toEqual([rec({ pid: 4343, attempt: 2 })]);
  // новый экземпляр (рестарт) поднимает копию из БД
  expect(await new SqliteProcessRegistry(env.db).live()).toEqual([rec({ pid: 4343, attempt: 2 })]);
});

it("storage_offline: works from memory with the db closed, syncs inserts and ended_at after reopen", async () => {
  const reg = new SqliteProcessRegistry(env.db);
  await reg.add(rec());
  reg.detach();
  env.db.close();
  await reg.add(rec({ pid: 5000, attempt: 2 }));
  await reg.end(rec(), { code: null, signal: "SIGKILL" });
  expect((await reg.live()).map((p) => p.pid)).toEqual([5000]);
  env.db = openDb(env.s.root);
  reg.attach(env.db);
  expect(jobProcesses.listLive(env.db).map((p) => p.pid)).toEqual([5000]);
  expect(env.db.prepare("SELECT ended_at IS NOT NULL FROM job_processes WHERE pid = 4242").pluck().get()).toBe(1);
  expect((await reg.live()).map((p) => p.pid)).toEqual([5000]);
});

it("a db error that is not about storage still fails add (the process must not start unrecorded)", async () => {
  const reg = new SqliteProcessRegistry(env.db);
  env.db.exec("CREATE TRIGGER no_ins BEFORE INSERT ON job_processes BEGIN SELECT RAISE(ABORT, 'нельзя'); END");
  await expect(reg.add(rec())).rejects.toThrow(/нельзя/);
  expect(await reg.live()).toEqual([]);
});

it("real spawnTracked through the sqlite registry: recorded while running, ended after exit", async () => {
  const reg = new SqliteProcessRegistry(env.db);
  const run = { root: env.s.root, runId: "job_1", attempt: 1, registry: reg };
  const p = spawnTracked(env.s.root, run, "/bin/sh", ["-c", "sleep 0.3"], {
    cwd: env.s.tmp,
    env: process.env,
    signal: new AbortController().signal,
    registry: reg,
  });
  await new Promise((r) => setTimeout(r, 150));
  expect(jobProcesses.listLive(env.db)).toHaveLength(1);
  expect((await p).code).toBe(0);
  expect(jobProcesses.listLive(env.db)).toEqual([]);
  expect(env.db.prepare("SELECT exit_code FROM job_processes").pluck().get()).toBe(0);
});

it("mergeRegistries: live = SQLite ∪ side file registry; add goes to SQLite; end closes both", async () => {
  const sql = new SqliteProcessRegistry(env.db);
  const side = fileProcessRegistry(env.s.root);
  const merged = mergeRegistries(sql, side);
  const chrome = rec({ pid: 7000, pgid: 7000, cmd: "chrome-headless-shell (render) /x" });
  await side.add(chrome);
  await merged.add(rec());
  expect(await side.live()).toEqual([chrome]);
  expect((await merged.live({ runId: "job_1", attempt: 1 })).map((p) => p.pid).sort()).toEqual([4242, 7000]);
  await merged.end(chrome, { code: null, signal: "SIGKILL" });
  await merged.end(rec(), { code: 0, signal: null });
  expect(await merged.live()).toEqual([]);
  expect(await side.live()).toEqual([]);
});
