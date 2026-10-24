// retryJob (ADR 0007 п. 4): повтор только `failed | cancelled | blocked` и только когда
// процессов прежних попыток нет (настоящие процессы, без моков ps/kill).
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ProcessRegistry, fileProcessRegistry } from "@ms/core";
import * as jobs from "../../src/db/repos/jobs.js";
import * as sceneLocks from "../../src/db/repos/scene-locks.js";
import { SqliteProcessRegistry, mergeRegistries } from "../../src/jobs/process-registry.js";
import { enqueue } from "../../src/jobs/queue.js";
import { StaleProcessAliveError, retryJob } from "../../src/jobs/retry.js";
import { req, setupDb, teardownDb, type JobsEnv } from "./helpers.js";
import { killLeftovers, spawnOrphan, track } from "./procs.js";

let env: JobsEnv;
let sql: SqliteProcessRegistry;
let registry: ProcessRegistry;
beforeEach(async () => {
  env = await setupDb("ms-jobs-retry-");
  sql = new SqliteProcessRegistry(env.db);
  registry = mergeRegistries(sql, fileProcessRegistry(env.s.root));
});
afterEach(async () => {
  killLeftovers();
  await teardownDb(env);
});

async function seedRunning(id: string): Promise<void> {
  const j = enqueue(env.db, req({ idempotencyKey: id })).job;
  env.db.prepare("UPDATE jobs SET id = ? WHERE id = ?").run(id, j.id);
  jobs.update(env.db, id, { status: "running", attempt: 1 });
  sceneLocks.acquire(env.db, "scn_1", id);
  await mkdir(join(env.s.root, "workspace/drafts", `${id}-a1`), { recursive: true });
}

describe("retryJob", () => {
  it("only failed | cancelled | blocked; resets to pending without touching attempt", async () => {
    await seedRunning("job_1");
    await expect(retryJob(env.db, "job_1", registry)).rejects.toThrow(/job_not_retryable/);
    jobs.update(env.db, "job_1", { status: "failed", interrupts: 3, error: { code: "interrupted", message: "x" }, finished_at: new Date().toISOString() });
    const j = await retryJob(env.db, "job_1", registry);
    expect(j).toMatchObject({ status: "pending", attempt: 1, interrupts: 0, error: null, finished_at: null, cancel_requested: false });
    expect(sceneLocks.holder(env.db, "scn_1")).toBeUndefined();
  });

  it("a stale record whose process is already dead does not block the retry and gets ended", async () => {
    await seedRunning("job_1");
    jobs.update(env.db, "job_1", { status: "blocked", error: { code: "stale_process", message: "x" } });
    const dead = await spawnOrphan(sql, { runId: "job_1", attempt: 1 }, env.s.tmp);
    process.kill(-dead.pid, "SIGKILL");
    track(dead.pid);
    await new Promise((r) => setTimeout(r, 200));
    expect((await retryJob(env.db, "job_1", registry)).status).toBe("pending");
    expect(await sql.live()).toEqual([]);
  });

  it("a live process of the previous attempt → StaleProcessAliveError with pids and cmds", async () => {
    await seedRunning("job_1");
    jobs.update(env.db, "job_1", { status: "blocked", error: { code: "stale_process", message: "x" } });
    const o = await spawnOrphan(registry, { runId: "job_1", attempt: 1 }, env.s.tmp);
    const err = await retryJob(env.db, "job_1", registry).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StaleProcessAliveError);
    expect(err).toMatchObject({ code: "stale_process_alive", pids: [o.pid], cmds: [expect.stringContaining("orphan-render.sh")] });
    expect(jobs.get(env.db, "job_1")!.status).toBe("blocked");
  });
});
