// Сводка затрат (Task 49a): по ролям, моделям и сценам; фильтры проекта, сцены, периода, задач.
import { afterEach, beforeEach, expect, it } from "vitest";
import * as agentRuns from "../../src/db/repos/agent-runs.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { enqueue } from "../../src/jobs/queue.js";
import { costSummary } from "../../src/perf/costs.js";
import { setupDb, teardownDb, type JobsEnv } from "../jobs/helpers.js";

let env: JobsEnv;
const ids: Record<string, string> = {};

beforeEach(async () => {
  env = await setupDb("ms-perf-costs-");
  const { db } = env;
  projects.create(db, { id: "p1", title: "Первый" });
  projects.create(db, { id: "p2", title: "Второй" });
  scenes.create(db, { id: "s1", project_id: "p1", title: "a" });
  scenes.create(db, { id: "s2", project_id: "p1", title: "b" });
  scenes.create(db, { id: "s3", project_id: "p2", title: "c" });
  const job = (key: string, projectId: string, sceneId: string) =>
    (ids[key] = enqueue(db, { type: "playground.generate", projectId, sceneId, input: { k: key }, idempotencyKey: key }).job.id);
  job("j1", "p1", "s1");
  job("j2", "p1", "s2");
  job("j3", "p2", "s3");
  let n = 0;
  const run = (jobKey: string, role: string, model: string, cost: number | undefined, at = "2026-10-20T10:00:00.000Z") => {
    const id = `run_${++n}`;
    agentRuns.insert(db, { id, job_id: ids[jobKey]!, role, model, started_at: at });
    agentRuns.finish(db, id, { status: "completed", ...(cost === undefined ? {} : { cost_usd: cost }) });
  };
  run("j1", "engineer", "claude-opus", 1.5);
  run("j1", "visual_qa", "claude-sonnet", 0.25);
  run("j1", "motion_director", "claude-opus", 1, "2026-10-24T10:00:00.000Z");
  run("j2", "engineer", "claude-opus", 1, "2026-10-24T11:00:00.000Z");
  run("j2", "engineer", "claude-opus", undefined, "2026-10-24T12:00:00.000Z");
  run("j3", "engineer", "claude-opus", 7);
});
afterEach(async () => { await teardownDb(env); });

it("по проекту: итог, роли, модели, сцены, вызовы без цены", () => {
  const s = costSummary(env.db, { projectId: "p1" });
  expect(s).toMatchObject({ totalUsd: 3.75, byRole: { engineer: 2.5, visual_qa: 0.25, motion_director: 1 }, calls: 5, unknown: 1 });
  expect(s.byModel).toEqual({ "claude-opus": 3.5, "claude-sonnet": 0.25 });
  expect(s.byScene).toEqual([{ sceneId: "s1", usd: 2.75 }, { sceneId: "s2", usd: 1 }]);
});

it("без фильтра — все проекты; сцена; период; задачи пакета", () => {
  expect(costSummary(env.db).totalUsd).toBe(10.75);
  expect(costSummary(env.db, { sceneId: "s2" })).toMatchObject({ totalUsd: 1, calls: 2, unknown: 1 });
  expect(costSummary(env.db, { projectId: "p1", since: "2026-10-23T00:00:00.000Z" })).toMatchObject({ totalUsd: 2, byRole: { motion_director: 1, engineer: 1 } });
  expect(costSummary(env.db, { jobIds: [ids.j2!, ids.j3!] })).toMatchObject({ totalUsd: 8, calls: 3 });
  // сцены пакета: все задачи сцен, а не только последняя
  expect(costSummary(env.db, { sceneIds: ["s1", "s2"] })).toMatchObject({ totalUsd: 3.75, calls: 5 });
  expect(costSummary(env.db, { sceneIds: ["s3"] })).toMatchObject({ totalUsd: 7 });
  expect(costSummary(env.db, { sceneIds: [] }).calls).toBe(0);
  expect(costSummary(env.db, { jobIds: [] })).toEqual({ totalUsd: 0, byRole: {}, byModel: {}, byScene: [], calls: 0, unknown: 0 });
});
