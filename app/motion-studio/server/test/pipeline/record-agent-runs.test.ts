import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as agentRuns from "../../src/db/repos/agent-runs.js";
import * as projects from "../../src/db/repos/projects.js";
import { claimNext, enqueue } from "../../src/jobs/queue.js";
import { recordAgentRuns } from "../../src/pipeline/record.js";
import type { AgentRunRecord } from "../../src/pipeline/steps.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

let s: TestStore;
let db: Db;
beforeAll(async () => {
  s = await makeStore("ms-record-agent-runs-");
  db = openDb(s.root);
  await migrate(db);
});
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

const rec = (role: string): AgentRunRecord => ({
  role: role as AgentRunRecord["role"], status: "completed", permissionDenials: [], sessionId: "sess",
  usage: { model: "sonnet", inputTokens: 10, outputTokens: 5, costUsd: 0.5 }, startedAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:01.000Z",
});

describe("recordAgentRuns", () => {
  it("пишет прогоны текущей попытки; чужая попытка — false и ни одной лишней строки", () => {
    projects.create(db, { id: "ra1", kind: "script", title: "t" });
    enqueue(db, { type: "script.plan", projectId: "ra1", input: { projectId: "ra1" }, idempotencyKey: "ra-1" });
    const c = claimNext(db, "test", 0, { running: 0, maxRunning: 4 })!;
    expect(recordAgentRuns(db, c.job.id, c.attempt, [rec("script_director")])).toBe(true);
    expect(db.prepare("SELECT role FROM agent_runs WHERE job_id = ?").pluck().all(c.job.id)).toEqual(["script_director"]);
    expect(db.prepare("SELECT cost_usd FROM agent_runs WHERE job_id = ?").pluck().get(c.job.id)).toBe(0.5);
    expect(recordAgentRuns(db, c.job.id, c.attempt - 1, [rec("x")])).toBe(false);
    expect(db.prepare("SELECT COUNT(*) FROM agent_runs WHERE job_id = ?").pluck().get(c.job.id)).toBe(1);
  });

  it("S17b: повторная запись тех же прогонов не дублирует строки; cost неизвестен — null; сумма задачи", () => {
    projects.create(db, { id: "ra2", kind: "script", title: "t" });
    enqueue(db, { type: "script.plan", projectId: "ra2", input: { projectId: "ra2" }, idempotencyKey: "ra-2" });
    const c = claimNext(db, "test", 0, { running: 0, maxRunning: 4 })!;
    const a = rec("script_director");
    const lost: AgentRunRecord = { ...rec("script_director"), status: "failed", error: { kind: "cli", message: "spawn" }, costUnknown: true, usage: { model: "", inputTokens: 0, outputTokens: 0, costUsd: 0 } };
    expect(recordAgentRuns(db, c.job.id, c.attempt, [a])).toBe(true);
    expect(recordAgentRuns(db, c.job.id, c.attempt, [a, lost])).toBe(true);
    expect(db.prepare("SELECT status, model, cost_usd FROM agent_runs WHERE job_id = ? ORDER BY cost_usd IS NULL").all(c.job.id)).toEqual([
      { status: "completed", model: "sonnet", cost_usd: 0.5 },
      { status: "failed", model: "unknown", cost_usd: null },
    ]);
    expect(agentRuns.jobCost(db, c.job.id)).toEqual({ usd: 0.5, runs: 2, unknown: 1 });
  });
});
