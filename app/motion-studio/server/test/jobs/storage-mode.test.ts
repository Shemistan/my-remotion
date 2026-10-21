// StorageSupervisor (ADR 0006/0007, 09 §5 п. 5): хранилище пропало — раннер на паузе,
// попытки прерваны, БД закрыта, реестр живёт в памяти; вернулось — owner-lock на новом
// монтировании, quick_check, разбор задач (`storage_unavailable`), раннер снова работает.
// Пропажа — настоящий rename MS_DATA_DIR во временном хранилище.
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  type OwnerLock,
  type StorageStatus,
  acquireOwnerLock,
  checkStorage,
  fileProcessRegistry,
  reapAttempt,
  spawnTracked,
  verifyOwnerLock,
} from "@ms/core";
import { type Db, openDb } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as jobEvents from "../../src/db/repos/job-events.js";
import * as jobProcesses from "../../src/db/repos/job-processes.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { SqliteProcessRegistry, mergeRegistries } from "../../src/jobs/process-registry.js";
import { enqueue } from "../../src/jobs/queue.js";
import { recoverOnStart } from "../../src/jobs/recovery.js";
import { JobRunner } from "../../src/jobs/runner.js";
import { StorageSupervisor } from "../../src/jobs/storage-mode.js";
import type { JobContext } from "../../src/jobs/types.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { probe } from "../db/helpers.js";
import { deferred, req, setupDb, teardownDb, until, type JobsEnv } from "./helpers.js";
import { killLeftovers } from "./procs.js";

const CORE = fileURLToPath(new URL("../../../core/", import.meta.url));
const HOLDER = fileURLToPath(new URL("../../../core/test/fixtures/hold-owner-lock.ts", import.meta.url));

let env: JobsEnv;
let runner: JobRunner | undefined;
let sup: StorageSupervisor | undefined;
let lock: OwnerLock | undefined;
const children: ChildProcess[] = [];

beforeEach(async () => { env = await setupDb("ms-jobs-storage-"); });
afterEach(async () => {
  await sup?.stop();
  await runner?.stop({ abortRunning: true });
  for (const c of children.splice(0)) if (c.exitCode === null && c.signalCode === null) c.kill("SIGKILL");
  killLeftovers();
  await lock?.release();
  sup = runner = lock = undefined;
  // тест упал, пока хранилище «пропало»: вернуть его, иначе уборка падает второй ошибкой
  if (existsSync(`${env.s.root}.gone`) && !existsSync(env.s.root)) renameSync(`${env.s.root}.gone`, env.s.root);
  if (!env.db.open) env.db = openDb(env.s.root);
  await teardownDb(env);
});

function reopen(): Db {
  const db = openDb(env.s.root);
  migrate(db);
  return db;
}

/** Сервер в сборе: реестр, раннер с обработчиком, супервизор на настоящем checkStorage. */
function server(handler: (ctx: JobContext) => Promise<never | { status: "completed"; outputRefs: unknown }>, extra: Partial<ConstructorParameters<typeof StorageSupervisor>[0]> = {}) {
  const sql = new SqliteProcessRegistry(env.db);
  const registry = mergeRegistries(sql, fileProcessRegistry(env.s.root));
  const repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard, registry });
  runner = new JobRunner({ db: env.db, root: env.s.root, owner: "srv", handlers: { "playground.generate": handler }, registry, pollMs: 5, heartbeatMs: 20 });
  sup = new StorageSupervisor({
    check: () => checkStorage({ MS_DATA_DIR: env.s.root }, probe),
    runner,
    registry: sql,
    db: env.db,
    reopen,
    intervalMs: 40,
    recover: (db) => recoverOnStart({ db, repo, registry, reap: (r, f) => reapAttempt(r, f, { graceMs: 200, waitMs: 3000 }), reason: "storage_unavailable" }),
    onDb: (db) => repo.useDb(db),
    ...extra,
  });
  return { sql, registry, repo };
}

it("09 §5 п.5: MS_DATA_DIR renamed → storage_offline (paused, aborted, db closed, process killed); back → pending(storage_unavailable), runner resumes", async () => {
  const ctxs: JobContext[] = [];
  const second = deferred();
  const { sql } = server(async (ctx) => {
    ctxs.push(ctx);
    if (ctx.attempt === 1) {
      // настоящий дочерний процесс попытки; при сбое хранилища его убивает abort
      await spawnTracked(ctx.run.root, ctx.run, "/bin/sleep", ["600"], { cwd: env.s.tmp, env: process.env, signal: ctx.signal, registry: ctx.run.registry, killGraceMs: 200 });
      throw ctx.signal.reason;
    }
    await second.promise;
    return { status: "completed", outputRefs: {} };
  });
  const j = enqueue(env.db, req()).job;
  runner!.start();
  sup!.start();
  await until(() => jobProcesses.listLive(env.db).length === 1, "процесс попытки 1 в job_processes");
  const pid = jobProcesses.listLive(env.db)[0]!.pid;

  renameSync(env.s.root, `${env.s.root}.gone`);
  await until(() => sup!.mode() === "storage_offline", "storage_offline", 5000);
  expect(sup!.reason()).toMatch(/not_found/);
  expect(runner!.isPaused()).toBe(true);
  expect(ctxs[0]!.signal.aborted).toBe(true);
  await until(() => !env.db.open, "БД закрыта", 5000);
  // процесс убит, `end` записан в память — БД закрыта
  expect(await sql.live()).toEqual([]);
  expect(() => process.kill(pid, 0)).toThrow();

  renameSync(`${env.s.root}.gone`, env.s.root);
  await until(() => sup!.mode() === "online", "online", 5000);
  const db = sup!.db();
  expect(db.open).toBe(true);
  // ended_at досинхронизирован после возврата
  expect(jobProcesses.listLive(db)).toEqual([]);
  expect(sup!.lastRecovery()!.requeued).toEqual([j.id]);
  const ev = jobEvents.listSince(db, 0, { jobId: j.id }).find((e) => e.kind === "requeued");
  expect(ev?.data).toMatchObject({ code: "storage_unavailable" });
  // раннер снова захватывает: попытка 2 на новой БД
  await until(() => jobs.get(db, j.id)!.attempt === 2 && jobs.get(db, j.id)!.status === "running", "попытка 2", 5000);
  expect(jobs.get(db, j.id)!.interrupts).toBe(0);
  second.resolve();
  await until(() => jobs.get(db, j.id)!.status === "completed", "completed");
  env.db = db;
});

it("H2: slow/failing volume probe (diskutil under load) does not take a live store offline", async () => {
  let n = 0;
  // каждая третья проверка — неокончательный отказ пробы тома, остальные — настоящий checkStorage
  server(async () => ({ status: "completed", outputRefs: {} }), {
    check: async () => (n++ % 3 === 0 ? { ok: false, reason: "volume_probe_failed", detail: "том: Command failed: diskutil info -plist" } : checkStorage({ MS_DATA_DIR: env.s.root }, probe)),
  });
  runner!.start();
  sup!.start();
  await new Promise((r) => setTimeout(r, 40 * 30));
  expect(n).toBeGreaterThan(10);
  expect(sup!.mode()).toBe("online");
  expect(runner!.isPaused()).toBe(false);
});

it("check hangs (diskutil) → storage_offline with reason storage_watch_timeout", async () => {
  let hang = false;
  server(async () => ({ status: "completed", outputRefs: {} }), {
    check: () => (hang ? new Promise<StorageStatus>(() => undefined) : checkStorage({ MS_DATA_DIR: env.s.root }, probe)),
  });
  runner!.start();
  sup!.start();
  hang = true;
  await until(() => sup!.mode() === "storage_offline", "storage_offline", 5000);
  expect(sup!.reason()).toMatch(/storage_watch_timeout/);
});

it("return after remount: the owner.lock file is new and held by another process → stays storage_offline (owner_busy)", async () => {
  lock = await acquireOwnerLock(env.s.root, "server");
  server(async () => ({ status: "completed", outputRefs: {} }), {
    verifyOwner: async () => {
      lock = await verifyOwnerLock(env.s.root, "server", lock!);
    },
  });
  runner!.start();
  sup!.start();
  const gone = `${env.s.root}.gone`;
  renameSync(env.s.root, gone);
  await until(() => sup!.mode() === "storage_offline", "storage_offline", 5000);
  // «новое монтирование»: на месте замка — другой файл (новый vnode), его держит другой процесс
  renameSync(`${gone}/run/owner.lock`, `${gone}/run/owner.lock.old-mount`);
  const holder = spawn(process.execPath, ["--import", "tsx", HOLDER, gone], { cwd: CORE, stdio: ["ignore", "pipe", "pipe"] });
  children.push(holder);
  await new Promise<void>((resolve, reject) => {
    holder.stdout!.on("data", (d: Buffer) => d.toString().includes("locked") && resolve());
    holder.once("exit", (c) => reject(new Error(`holder exited ${c}`)));
  });
  renameSync(gone, env.s.root);
  await until(() => /owner_busy/.test(sup!.reason() ?? ""), "owner_busy", 5000);
  await new Promise((r) => setTimeout(r, 300));
  expect(sup!.mode()).toBe("storage_offline");
  expect(runner!.isPaused()).toBe(true);
  expect(env.db.open).toBe(false);
  // второй владелец ушёл — замок наш на новом файле, работа продолжается
  holder.kill("SIGKILL");
  await until(() => sup!.mode() === "online", "online", 5000);
  await expect(acquireOwnerLock(env.s.root, "cli")).rejects.toThrow(/owner_busy/);
  env.db = sup!.db();
});

it("quick_check fails after return → stays storage_offline", async () => {
  server(async () => ({ status: "completed", outputRefs: {} }), {
    reopen: () => {
      const db = reopen();
      // подмена: база «повреждена»
      db.pragma = (() => "*** in database main ***\nPage 2: never used") as unknown as Db["pragma"];
      return db;
    },
  });
  runner!.start();
  sup!.start();
  renameSync(env.s.root, `${env.s.root}.gone`);
  await until(() => sup!.mode() === "storage_offline", "storage_offline", 5000);
  renameSync(`${env.s.root}.gone`, env.s.root);
  await until(() => /quick_check/.test(sup!.reason() ?? ""), "quick_check", 5000);
  expect(sup!.mode()).toBe("storage_offline");
});

it("fix 4: return fails mid-switch (recover throws) → new db closed, registry detached, stays storage_offline; next poll succeeds", async () => {
  const opened: Db[] = [];
  let fail = true;
  const { sql } = server(async () => ({ status: "completed", outputRefs: {} }), {
    reopen: () => {
      const db = reopen();
      opened.push(db);
      return db;
    },
  });
  const realRecover = (sup as unknown as { deps: { recover: (db: Db) => Promise<unknown> } }).deps.recover;
  (sup as unknown as { deps: { recover: (db: Db) => Promise<unknown> } }).deps.recover = async (db) => {
    if (fail) {
      fail = false;
      throw new Error("разбор упал");
    }
    return realRecover(db);
  };
  runner!.start();
  sup!.start();
  renameSync(env.s.root, `${env.s.root}.gone`);
  await until(() => sup!.mode() === "storage_offline", "storage_offline", 5000);
  renameSync(`${env.s.root}.gone`, env.s.root);
  await until(() => /разбор упал/.test(sup!.reason() ?? ""), "сбой возврата", 5000);
  expect(sup!.mode()).toBe("storage_offline");
  expect(opened[0]!.open).toBe(false);
  expect(runner!.isPaused()).toBe(true);
  // реестр отцеплен: запись идёт в память, а не в закрытую базу
  await sql.add({ runId: "job_x", attempt: 1, pid: 4242, pgid: 4242, startedAt: "x", cmd: "x" });
  await until(() => sup!.mode() === "online", "online", 5000);
  expect(opened.length).toBeGreaterThanOrEqual(2);
  expect(sup!.db()).toBe(opened.at(-1));
  expect(runner!.isPaused()).toBe(false);
  // накопленное в памяти досинхронизировано
  expect(jobProcesses.listLive(sup!.db()).map((p) => p.pid)).toEqual([4242]);
  env.db = sup!.db();
});
