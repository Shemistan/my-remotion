// bootCore (ADR 0007 п. 5, H6, H9, M6): owner_lock → storage → db → registry → reap →
// sweep_drafts → relock_versions → reconcile_versions → reconcile_exports → recovery → runner.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { OwnerBusyError, type VolumeProbe, acquireOwnerLock, fileProcessRegistry, initStore, procInfo, reapAttempt } from "@ms/core";
import { openDb } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import type { KnowledgeAdapter } from "../../src/knowledge/adapter.js";
import type { AgentRuntimeAdapter } from "../../src/agents/runtime.js";
import { type BootOptions, type Core, bootCore } from "../../src/boot.js";
import { SqliteProcessRegistry } from "../../src/jobs/process-registry.js";
import { enqueue, requestCancel } from "../../src/jobs/queue.js";
import * as sceneLocks from "../../src/db/repos/scene-locks.js";
import { publishVersion } from "../../src/scenes/store.js";
import { makeStore, probe, removeStore, type TestStore } from "../db/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";
import { req, until } from "./helpers.js";
import { killLeftovers, spawnOrphan } from "./procs.js";

let s: TestStore;
let core: Core | undefined;
beforeEach(async () => { s = await makeStore("ms-jobs-boot-"); });
afterEach(async () => {
  await core?.close();
  core = undefined;
  killLeftovers();
  await removeStore(s);
});

const kb = {} as KnowledgeAdapter;
const agents = {} as AgentRuntimeAdapter;
const fastReap: typeof reapAttempt = (r, f) => reapAttempt(r, f, { graceMs: 300, waitMs: 5000 });
const opts = (over: Partial<BootOptions> = {}): BootOptions => ({ env: { MS_DATA_DIR: s.root }, kind: "server", probe, kb, agents, reap: fastReap, ...over });

it("step order (ADR 0007 п.5)", async () => {
  const steps: string[] = [];
  core = await bootCore(opts({ log: (x) => steps.push(x) }));
  expect(steps).toEqual(["owner_lock", "storage", "db", "registry", "reap", "sweep_drafts", "relock_versions", "reconcile_versions", "reconcile_exports", "recovery", "runner"]);
  expect(core.storage.mode()).toBe("online");
  expect(core.registry).toBeInstanceOf(SqliteProcessRegistry);
  // хранилище занято, пока ядро живо
  await expect(acquireOwnerLock(s.root, "cli")).rejects.toBeInstanceOf(OwnerBusyError);
  await core.close();
  core = undefined;
  await (await acquireOwnerLock(s.root, "cli")).release();
});

it("no MS_DATA_DIR → fails at owner_lock already (the lock lives in the store root, L4)", async () => {
  const s1: string[] = [];
  await expect(bootCore(opts({ env: {}, log: (x) => s1.push(x) }))).rejects.toThrow(/MS_DATA_DIR|env_missing/);
  expect(s1).toEqual([]);
});

it("lock taken, storage check fails (marker of another store/volume) → no studio.db, runner not started, lock released", async () => {
  const other = join(s.tmp, "foreign");
  const foreignProbe: VolumeProbe = { ...probe, volumeUuid: async () => "VOL-OTHER" };
  await initStore(other, foreignProbe, {});
  const s2: string[] = [];
  await expect(bootCore(opts({ env: { MS_DATA_DIR: other }, log: (x) => s2.push(x) }))).rejects.toThrow(/storage/);
  expect(s2).toEqual(["owner_lock"]);
  expect(existsSync(join(other, "studio.db"))).toBe(false);
  await (await acquireOwnerLock(other, "cli")).release();
});

it("reap: every unique (runId, attempt) of SQLite and side registries, then reapStrayRenderers", async () => {
  const db = openDb(s.root);
  await migrate(db);
  const sql = new SqliteProcessRegistry(db);
  await sql.add({ runId: "job_1", attempt: 1, pid: 999_991, pgid: 999_991, startedAt: "x", cmd: "claude" });
  await sql.add({ runId: "job_1", attempt: 1, pid: 999_992, pgid: 999_992, startedAt: "x", cmd: "worker" });
  await fileProcessRegistry(s.root).add({ runId: "job_2", attempt: 3, pid: 999_993, pgid: 999_993, startedAt: "x", cmd: "chrome-headless-shell (render)" });
  db.close();
  const calls: string[] = [];
  core = await bootCore(opts({
    reap: async (r, f) => {
      calls.push(`reap:${f.runId}#${f.attempt}`);
      return reapAttempt(r, f);
    },
    reapStrays: async () => (calls.push("strays"), []),
  }));
  expect(calls).toEqual(["reap:job_1#1", "reap:job_2#3", "strays"]);
  // мёртвые записи закрыты в обоих реестрах
  expect(await core.registry.live()).toEqual([]);
  expect(await fileProcessRegistry(s.root).live()).toEqual([]);
});

it("kill -9 leftovers: a live grandchild ignoring SIGTERM is killed before recovery; job requeued; runner then claims", async () => {
  const db = openDb(s.root);
  await migrate(db);
  scenes.create(db, { id: "scn_1", project_id: "playground", title: "x" });
  const j = enqueue(db, req()).job;
  jobs.update(db, j.id, { status: "running", attempt: 1, lease_owner: "dead", lease_until: new Date().toISOString() });
  const o = await spawnOrphan(new SqliteProcessRegistry(db), { runId: j.id, attempt: 1 }, s.tmp);
  db.close();
  let ran = 0;
  core = await bootCore(opts({ handlers: { "playground.generate": async () => (ran++, { status: "completed", outputRefs: {} }) } }));
  expect(core.recovery.requeued).toEqual([j.id]);
  expect(await procInfo(o.grandchild)).toBeUndefined();
  await until(() => jobs.get(core!.db, j.id)!.status === "completed", "completed", 5000);
  expect(ran).toBe(1);
  expect(jobs.get(core.db, j.id)!.attempt).toBe(2);
});

it("unkillable leftovers are reported in core.reaped and the job is blocked (reap result reused, no second wait)", async () => {
  const db = openDb(s.root);
  await migrate(db);
  scenes.create(db, { id: "scn_1", project_id: "playground", title: "x" });
  const j = enqueue(db, req()).job;
  jobs.update(db, j.id, { status: "running", attempt: 1 });
  const o = await spawnOrphan(new SqliteProcessRegistry(db), { runId: j.id, attempt: 1 }, s.tmp);
  db.close();
  let reaps = 0;
  core = await bootCore(opts({ reap: (r, f) => (reaps++, reapAttempt(r, f, { kill: () => undefined, graceMs: 50, waitMs: 50 })) }));
  expect(reaps).toBe(1);
  expect(core.reaped.alive.map((p) => p.pid)).toEqual([o.pid]);
  expect(core.recovery.blocked).toEqual([{ jobId: j.id, pids: [o.pid], cmds: [expect.stringContaining("orphan-render.sh")] }]);
  expect(jobs.get(core.db, j.id)!.status).toBe("blocked");
});

it("relock → reconcile before recovery: a version directory without a row is registered before the runner claims (H9)", async () => {
  // каталог версии без строки в БД (rename прошёл, COMMIT — нет): номер 1 занят
  const d = await makeDraft(s.root, { runId: "run_x", attempt: 1, sceneId: "scn_9" });
  await mkdir(join(s.root, "workspace/projects/playground/scenes/scn_9"), { recursive: true });
  await writeFile(join(s.root, "workspace/projects/playground/scenes/scn_9/brief.json"), JSON.stringify({ prompt: "x" }));
  const pub = await publishVersion(d, meta("scn_9"), s.guard);
  core = await bootCore(opts());
  expect(versions.get(core.db, pub.versionId)).toMatchObject({ number: 1, scene_id: "scn_9" });
  expect(versions.nextNumber(core.db, "scn_9")).toBe(2);
});

it("broken version rows (broken_reason) are exposed in core.boot.reconcile.missing.broken", async () => {
  const db = openDb(s.root);
  await migrate(db);
  scenes.create(db, { id: "scn_1", project_id: "playground", title: "x" });
  versions.insert(db, {
    id: "ver_gone", scene_id: "scn_1", parent_version_id: null, number: 1, status: "ready", prompt: "p", edit_plan: null,
    settings: meta("scn_1").settings, path: "workspace/projects/playground/scenes/scn_1/versions/ver_gone", manifest_sha256: "a".repeat(64),
    created_by_job_id: null, created_at: new Date().toISOString(),
  });
  db.close();
  core = await bootCore(opts());
  expect(core.boot.reconcile.missing.broken).toEqual([{ versionId: "ver_gone", reason: expect.stringContaining("не найден") }]);
  expect(versions.get(core.db, "ver_gone")!.broken_reason).toMatch(/не найден/);
});

it("fix 5: periodic lock sweep — a cancelled blocked job's scene lock is released during the session once its process dies", async () => {
  const db = openDb(s.root);
  await migrate(db);
  scenes.create(db, { id: "scn_1", project_id: "playground", title: "x" });
  const j = enqueue(db, req()).job;
  jobs.update(db, j.id, { status: "running", attempt: 1 });
  sceneLocks.acquire(db, "scn_1", j.id);
  const o = await spawnOrphan(new SqliteProcessRegistry(db), { runId: j.id, attempt: 1 }, s.tmp);
  db.close();
  // процесс не убивается (фейковый kill) → blocked, замок держится
  core = await bootCore(opts({ reap: (r, f) => reapAttempt(r, f, { kill: () => undefined, graceMs: 20, waitMs: 20 }), lockSweepMs: 50 }));
  expect(jobs.get(core.db, j.id)!.status).toBe("blocked");
  requestCancel(core.db, j.id);
  await new Promise((r) => setTimeout(r, 200));
  expect(sceneLocks.holder(core.db, "scn_1")).toBe(j.id);
  // человек добил процесс — замок снимается без рестарта
  process.kill(-o.pid, "SIGKILL");
  await until(() => sceneLocks.holder(core!.db, "scn_1") === undefined, "замок снят", 5000);
  expect(jobs.get(core.db, j.id)!.status).toBe("cancelled");
});
