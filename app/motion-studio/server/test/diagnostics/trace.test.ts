// jobTrace: проект → сцена → версия → задача (+ дочерние) → запуски агентов → рендеры (ТЗ §12).
import { afterEach, beforeEach, expect, it } from "vitest";
import * as agentRuns from "../../src/db/repos/agent-runs.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as renderJobs from "../../src/db/repos/render-jobs.js";
import { tx } from "../../src/db/tx.js";
import { jobTrace } from "../../src/diagnostics/trace.js";
import { type Api, makeApi, seedVersion } from "../api/helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(async () => {
  await api.close();
});

it("правка: роли агентов по порядку, рендеры, события, стоимость с неудачной попыткой", async () => {
  const db = api.core.db;
  const { scene, versionId, projectId } = await seedVersion(api);
  jobs.insert(db, { id: "job_edit", type: "playground.edit", project_id: projectId, scene_id: scene.id, version_id: versionId, input: {}, status: "failed", attempt: 2 });
  jobs.insert(db, { id: "job_child", type: "scene.export", project_id: projectId, scene_id: scene.id, parent_job_id: "job_edit", input: {}, status: "completed", attempt: 1 });
  const roles = ["edit_planner", "motion_director", "engineer", "visual_qa"];
  roles.forEach((role, i) => {
    agentRuns.insert(db, { id: `ar_${i}`, job_id: "job_edit", role, model: "sonnet", started_at: `2026-10-25T10:00:0${i}.000Z` });
    agentRuns.finish(db, `ar_${i}`, { status: i === 2 ? "failed" : "completed", cost_usd: 0.1 * (i + 1), finished_at: `2026-10-25T10:00:0${i}.500Z` });
  });
  renderJobs.insert(db, { id: "rnd_1", job_id: "job_edit", version_id: versionId, kind: "preview", duration_ms: 1234 });
  tx(db, () => api.core.events.emit(db, { job_id: "job_edit", level: "error", kind: "failed", message: "engineer упал" }));

  const tr = jobTrace(db, "job_edit")!;
  expect(tr.agentRuns.map((r) => r.role)).toEqual(["edit_planner", "motion_director", "engineer", "visual_qa"]);
  expect(tr.agentRuns[0]).toMatchObject({ id: "ar_0", status: "completed", cost_usd: 0.1, duration_ms: 500 });
  expect(tr.project).toMatchObject({ id: projectId });
  expect(tr.scene).toMatchObject({ id: scene.id });
  expect(tr.version).toMatchObject({ id: versionId, number: 1, status: "ready" });
  expect(tr.job.id).toBe("job_edit");
  expect(tr.children.map((c) => c.id)).toEqual(["job_child"]);
  expect(tr.renderJobs).toEqual([expect.objectContaining({ id: "rnd_1", kind: "preview", duration_ms: 1234 })]);
  expect(tr.events.map((e) => e.message)).toEqual(["engineer упал"]);
  expect(tr.cost).toEqual({ usd: 1, runs: 4, unknown: 0 });
});

it("нет задачи — undefined; задача без сцены — без scene/version", async () => {
  expect(jobTrace(api.core.db, "job_nope")).toBeUndefined();
  jobs.insert(api.core.db, { id: "job_p", type: "script.plan", project_id: "playground", input: {}, status: "pending" });
  const tr = jobTrace(api.core.db, "job_p")!;
  expect(tr.scene).toBeUndefined();
  expect(tr.version).toBeUndefined();
  expect(tr.cost).toEqual({ usd: 0, runs: 0, unknown: 0 });
});
