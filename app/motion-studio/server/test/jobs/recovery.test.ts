// Восстановление задач при старте (ADR 0007 п. 4–5, 09 §5 п. 2, 8): настоящие процессы,
// в том числе игнорирующие SIGTERM; «не убивается» — только через фейковый kill.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ProcessRegistry, fileProcessRegistry, procInfo, reapAttempt } from "@ms/core";
import * as jobEvents from "../../src/db/repos/job-events.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as sceneLocks from "../../src/db/repos/scene-locks.js";
import { SqliteProcessRegistry, mergeRegistries } from "../../src/jobs/process-registry.js";
import { cancelJob, claimNext, enqueue, requestCancel } from "../../src/jobs/queue.js";
import { recoverOnStart, releaseStaleLocks } from "../../src/jobs/recovery.js";
import { retryJob } from "../../src/jobs/retry.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { makeDraft, meta } from "../scenes/helpers.js";
import { idle, req, setupDb, teardownDb, type JobsEnv } from "./helpers.js";
import { killLeftovers, spawnOrphan } from "./procs.js";

let env: JobsEnv;
let sql: SqliteProcessRegistry;
let registry: ProcessRegistry;
let repo: SceneRepo;
const noop = () => undefined;
/** Быстрый реальный разбор: SIGTERM, через 300 мс SIGKILL. */
const fastReap: typeof reapAttempt = (r, f) => reapAttempt(r, f, { graceMs: 300, waitMs: 5000 });

beforeEach(async () => {
  env = await setupDb("ms-jobs-recovery-");
  sql = new SqliteProcessRegistry(env.db);
  registry = mergeRegistries(sql, fileProcessRegistry(env.s.root));
  repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard, registry });
});
afterEach(async () => {
  killLeftovers();
  await teardownDb(env);
});

/** Задача «в работе» у мёртвого сервера: захвачена `attempt` раз, замок сцены взят, draft попытки есть. */
async function seedRunning(id: string, o: { attempt?: number; interrupts?: number; sceneId?: string; key?: string; noDraft?: boolean } = {}) {
  const attempt = o.attempt ?? 1;
  const j = enqueue(env.db, req({ idempotencyKey: o.key ?? id, sceneId: o.sceneId ?? "scn_1" })).job;
  // id задачи — как в брифе (`job_1`): переименовываем строку
  env.db.prepare("UPDATE jobs SET id = ? WHERE id = ?").run(id, j.id);
  jobs.update(env.db, id, { status: "running", attempt, interrupts: o.interrupts ?? 0, lease_owner: "dead-srv", lease_until: new Date().toISOString(), started_at: new Date().toISOString() });
  sceneLocks.acquire(env.db, o.sceneId ?? "scn_1", id);
  const dir = join(env.s.root, "workspace/drafts", `${id}-a${attempt}`);
  if (o.noDraft) return dir;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "props.json"), "{}");
  return dir;
}

const marker = (dir: string) => JSON.parse(readFileSync(join(dir, ".quarantined"), "utf8")) as { reason: string };

describe("recoverOnStart", () => {
  it("09 §5 п.8: the old attempt's grandchild ignores SIGTERM → killed with SIGKILL → pending; draft removed", async () => {
    const draft = await seedRunning("job_1");
    const o = await spawnOrphan(registry, { runId: "job_1", attempt: 1 }, env.s.tmp);
    // до разбора задача не pending: восстановления ещё не было, процесс жив
    expect(jobs.get(env.db, "job_1")!.status).toBe("running");
    const rep = await recoverOnStart({ db: env.db, repo, registry, reap: fastReap });
    expect(rep.requeued).toEqual(["job_1"]);
    expect(await procInfo(o.pid)).toBeUndefined();
    expect(await procInfo(o.grandchild)).toBeUndefined();
    const j = jobs.get(env.db, "job_1")!;
    expect(j).toMatchObject({ status: "pending", interrupts: 1, attempt: 1, lease_owner: null, error: { code: "interrupted", stage: "interrupted" } });
    expect(sceneLocks.holder(env.db, "scn_1")).toBeUndefined();
    expect(await registry.live()).toEqual([]);
    // draft прерванной попытки: карантин interrupted → удалён cleanupDrafts в конце разбора
    expect(rep.draftsRemoved).toEqual([draft]);
    expect(existsSync(draft)).toBe(false);
    expect(jobEvents.listSince(env.db, 0, { jobId: "job_1" }).map((e) => e.kind)).toContain("interrupted");
    // новый захват — попытка 2
    expect(claimNext(env.db, "srv", Date.now(), idle)!.attempt).toBe(2);
  });

  it("unkillable process (fake kill) → blocked(stale_process) with pid and cmd, draft quarantined, no auto-retry", async () => {
    const draft = await seedRunning("job_1");
    const o = await spawnOrphan(registry, { runId: "job_1", attempt: 1 }, env.s.tmp);
    const rep = await recoverOnStart({ db: env.db, repo, registry, reap: (r, f) => reapAttempt(r, f, { kill: noop, graceMs: 50, waitMs: 50 }) });
    expect(rep.requeued).toEqual([]);
    expect(rep.blocked[0]).toMatchObject({ jobId: "job_1", pids: [o.pid] });
    expect(rep.blocked[0]!.cmds[0]).toContain("orphan-render.sh");
    expect(jobs.get(env.db, "job_1")).toMatchObject({ status: "blocked", error: { code: "stale_process", stage: "orphaned", pids: [o.pid] } });
    expect(env.db.prepare("SELECT error_json FROM jobs WHERE id = 'job_1'").pluck().get()).toEqual(expect.stringContaining("stale_process"));
    expect(existsSync(join(draft, ".quarantined"))).toBe(true);
    expect(marker(draft).reason).toMatch(/^stale_process/);
    // карантин stale_process не одноразовый: draft на месте
    expect(existsSync(draft)).toBe(true);
    // ни сама задача, ни другая правка той же сцены не захватываются: замок держится
    enqueue(env.db, req({ idempotencyKey: "other", type: "playground.edit" }));
    expect(claimNext(env.db, "srv", Date.now(), idle)).toBeUndefined();
    await expect(retryJob(env.db, "job_1", registry)).rejects.toThrow(/stale_process_alive/);
    // процесс исчез (человек его добил) → повтор разрешён
    process.kill(-o.pid, "SIGKILL");
    await new Promise((r) => setTimeout(r, 200));
    const retried = await retryJob(env.db, "job_1", registry);
    expect(retried).toMatchObject({ status: "pending", attempt: 1, error: null });
    expect(await registry.live()).toEqual([]);
  });

  it("interrupts exhausted (3rd interruption) → failed(interrupted); attempt 5 with interrupts 1 → pending (M16)", async () => {
    await seedRunning("job_1", { interrupts: 2 });
    await seedRunning("job_2", { attempt: 5, interrupts: 1, sceneId: "scn_2" });
    const rep = await recoverOnStart({ db: env.db, repo, registry, reap: fastReap });
    expect(rep.failed).toEqual(["job_1"]);
    expect(rep.requeued).toEqual(["job_2"]);
    expect(jobs.get(env.db, "job_1")).toMatchObject({ status: "failed", interrupts: 3, error: { code: "interrupted", stage: "interrupted" } });
    expect(jobs.get(env.db, "job_2")).toMatchObject({ status: "pending", interrupts: 2, attempt: 5 });
    expect(sceneLocks.holder(env.db, "scn_1")).toBeUndefined();
  });

  it("cleanupDrafts after recovery: interrupted draft removed, fenced_out draft kept", async () => {
    const interrupted = await seedRunning("job_1");
    const fenced = join(env.s.root, "workspace/drafts", "job_9-a1");
    await mkdir(fenced, { recursive: true });
    await writeFile(join(fenced, ".quarantined"), JSON.stringify({ reason: "fenced_out: попытка 1 устарела" }));
    const rep = await recoverOnStart({ db: env.db, repo, registry, reap: fastReap });
    expect(rep.draftsRemoved).toEqual([interrupted]);
    expect(existsSync(fenced)).toBe(true);
  });

  it("S6 I1: draft экспортов с ключом (<job>-a<n>--<key>) — карантин попытки вместе с основным, удаляются; чужие не трогаются", async () => {
    const main = await seedRunning("job_1");
    const drafts = join(env.s.root, "workspace/drafts");
    const keyed = ["job_1-a1--1-mp4", "job_1-a1--1-alpha"].map((n) => join(drafts, n));
    const other = ["job_1-a2--1-mp4", "job_10-a1--1-mp4"].map((n) => join(drafts, n));
    for (const d of [...keyed, ...other]) await mkdir(d, { recursive: true });
    const rep = await recoverOnStart({ db: env.db, repo, registry, reap: fastReap });
    expect(rep.requeued).toEqual(["job_1"]);
    expect([...rep.draftsRemoved].sort()).toEqual([main, ...keyed].sort());
    for (const d of other) expect(existsSync(d), d).toBe(true);
    for (const d of other) expect(existsSync(join(d, ".quarantined")), d).toBe(false);
  });

  it("S6 I1: неубиваемый процесс — карантин stale_process у всех draft попытки с ключом", async () => {
    await seedRunning("job_1");
    const keyed = join(env.s.root, "workspace/drafts", "job_1-a1--2-alpha");
    await mkdir(keyed, { recursive: true });
    await spawnOrphan(registry, { runId: "job_1", attempt: 1 }, env.s.tmp);
    await recoverOnStart({ db: env.db, repo, registry, reap: (r, f) => reapAttempt(r, f, { kill: noop, graceMs: 50, waitMs: 50 }) });
    expect(marker(keyed).reason).toMatch(/^stale_process/);
    expect(existsSync(keyed)).toBe(true);
  });

  it("Ruling P3: the attempt already published its version (crash before finish) → completed, no re-run", async () => {
    const sceneId = "scn_1";
    await seedRunning("job_1", { noDraft: true });
    const d = await makeDraft(env.s.root, { runId: "job_1", attempt: 1, sceneId });
    const pub = await repo.publish(d, meta(sceneId), { jobId: "job_1", attempt: 1 });
    const rep = await recoverOnStart({ db: env.db, repo, registry, reap: fastReap });
    expect(rep.requeued).toEqual([]);
    expect(rep.completed).toEqual(["job_1"]);
    expect(jobs.get(env.db, "job_1")).toMatchObject({ status: "completed", output_refs: { version_id: pub.versionId, recovered: true } });
    expect(sceneLocks.holder(env.db, sceneId)).toBeUndefined();
  });

  it("a version of an older attempt does not complete the current one", async () => {
    await seedRunning("job_1", { attempt: 2, noDraft: true });
    const d = await makeDraft(env.s.root, { runId: "job_1", attempt: 2, sceneId: "scn_1" });
    // версия попытки 2 есть, но задача уже на попытке 3 — не её
    await repo.publish(d, meta("scn_1"), { jobId: "job_1", attempt: 2 });
    jobs.update(env.db, "job_1", { attempt: 3 });
    const rep = await recoverOnStart({ db: env.db, repo, registry, reap: fastReap });
    expect(rep.requeued).toEqual(["job_1"]);
  });

  it("cancel requested before the crash → cancelled, locks released", async () => {
    await seedRunning("job_1");
    requestCancel(env.db, "job_1");
    const rep = await recoverOnStart({ db: env.db, repo, registry, reap: fastReap });
    expect(rep.cancelled).toEqual(["job_1"]);
    expect(jobs.get(env.db, "job_1")).toMatchObject({ status: "cancelled", error: { code: "cancelled" } });
    expect(sceneLocks.holder(env.db, "scn_1")).toBeUndefined();
  });

  it("Task 12 carry: cancelled blocked job keeps its lock while the process lives; recovery kills it and releases", async () => {
    await seedRunning("job_1");
    const o = await spawnOrphan(registry, { runId: "job_1", attempt: 1 }, env.s.tmp);
    jobs.update(env.db, "job_1", { status: "blocked", error: { code: "stale_process", message: "x", pids: [o.pid] } });
    requestCancel(env.db, "job_1");
    expect(jobs.get(env.db, "job_1")!.status).toBe("cancelled");
    expect(sceneLocks.holder(env.db, "scn_1")).toBe("job_1");
    const rep = await recoverOnStart({ db: env.db, repo, registry, reap: fastReap });
    expect(await procInfo(o.grandchild)).toBeUndefined();
    expect(rep.locksReleased).toEqual(["job_1"]);
    expect(sceneLocks.holder(env.db, "scn_1")).toBeUndefined();
    expect(jobs.get(env.db, "job_1")!.status).toBe("cancelled");
  });

  it("SQLite and the side Chrome registry are merged by (runId, attempt): both groups are killed", async () => {
    await seedRunning("job_1");
    const worker = await spawnOrphan(sql, { runId: "job_1", attempt: 1 }, env.s.tmp);
    const chrome = await spawnOrphan(fileProcessRegistry(env.s.root), { runId: "job_1", attempt: 1 }, env.s.tmp);
    const rep = await recoverOnStart({ db: env.db, repo, registry, reap: fastReap });
    expect(rep.requeued).toEqual(["job_1"]);
    for (const p of [worker.pid, worker.grandchild, chrome.pid, chrome.grandchild]) expect(await procInfo(p)).toBeUndefined();
    expect(await fileProcessRegistry(env.s.root).live()).toEqual([]);
  });

  it("reason storage_unavailable (return from storage_offline): pending with that code, interrupts unchanged", async () => {
    await seedRunning("job_1", { interrupts: 2 });
    const rep = await recoverOnStart({ db: env.db, repo, registry, reap: fastReap, reason: "storage_unavailable" });
    expect(rep.requeued).toEqual(["job_1"]);
    expect(jobs.get(env.db, "job_1")).toMatchObject({ status: "pending", interrupts: 2, error: { code: "storage_unavailable", stage: "storage" } });
  });
});

describe("releaseStaleLocks (fix 5: runtime sweep)", () => {
  it("cancelled blocked job: lock held while its process lives (sweep never kills); released once the process is gone", async () => {
    await seedRunning("job_1");
    const o = await spawnOrphan(registry, { runId: "job_1", attempt: 1 }, env.s.tmp);
    jobs.update(env.db, "job_1", { status: "blocked", error: { code: "stale_process", message: "x", pids: [o.pid] } });
    requestCancel(env.db, "job_1");
    expect(await releaseStaleLocks(env.db, registry)).toEqual([]);
    expect(await procInfo(o.grandchild)).toBeDefined();
    expect(sceneLocks.holder(env.db, "scn_1")).toBe("job_1");
    process.kill(-o.pid, "SIGKILL");
    await new Promise((r) => setTimeout(r, 200));
    expect(await releaseStaleLocks(env.db, registry)).toEqual(["job_1"]);
    expect(sceneLocks.holder(env.db, "scn_1")).toBeUndefined();
    expect(await registry.live()).toEqual([]);
    expect(jobs.get(env.db, "job_1")!.status).toBe("cancelled");
  });

  it("running and pending jobs are not touched", async () => {
    await seedRunning("job_1");
    expect(await releaseStaleLocks(env.db, registry)).toEqual([]);
    expect(sceneLocks.holder(env.db, "scn_1")).toBe("job_1");
  });
});

describe("Task 17 (carry Task 13)", () => {
  it("cancelJob(blocked): процесс есть только в боковом файловом реестре (Chrome) — замки держатся", async () => {
    await seedRunning("job_1");
    // процесс попытки записан только в run/processes/ (так регистрирует себя Chrome)
    const o = await spawnOrphan(fileProcessRegistry(env.s.root), { runId: "job_1", attempt: 1 }, env.s.tmp);
    jobs.update(env.db, "job_1", { status: "blocked", error: { code: "stale_process", message: "x", pids: [o.pid] } });
    expect(await cancelJob(env.db, registry, "job_1")).toMatchObject({ status: "cancelled" });
    expect(sceneLocks.holder(env.db, "scn_1")).toBe("job_1");
    process.kill(-o.pid, "SIGKILL");
  });

  it("cancelJob(blocked): запись процесса жива в БД, но процесса нет — запись закрыта, замки сняты", async () => {
    await seedRunning("job_1");
    await sql.add({ runId: "job_1", attempt: 1, pid: 999_999, pgid: 999_999, startedAt: "Mon Jan  1 00:00:00 2001", cmd: "claude -p" });
    jobs.update(env.db, "job_1", { status: "blocked", error: { code: "stale_process", message: "x", pids: [999_999] } });
    // старая синхронная проверка (только SQLite, без проверки живости) держала бы замок
    await cancelJob(env.db, registry, "job_1");
    expect(sceneLocks.holder(env.db, "scn_1")).toBeUndefined();
    expect(await registry.live({ runId: "job_1" })).toEqual([]);
  });

  it("cancelJob(running) — как requestCancel: только cancel_requested", async () => {
    await seedRunning("job_1");
    expect(await cancelJob(env.db, registry, "job_1")).toMatchObject({ status: "running", cancel_requested: true });
  });

  it("releaseStaleLocks: попытка сменилась, пока проверялись процессы, — замки не снимаются", async () => {
    await seedRunning("job_1");
    jobs.update(env.db, "job_1", { status: "blocked" });
    // пока уборка опрашивает реестр, человек повторил задачу и новая попытка уже blocked
    const racing: ProcessRegistry = {
      ...registry,
      async live(f) {
        jobs.update(env.db, "job_1", { attempt: 2 });
        return registry.live(f);
      },
    };
    expect(await releaseStaleLocks(env.db, racing)).toEqual([]);
    expect(sceneLocks.holder(env.db, "scn_1")).toBe("job_1");
  });
});
