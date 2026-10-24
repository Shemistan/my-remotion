// Смысловой анализ через API (Task 33): запуск `semantic.analyze` — только при валидном A
// (409 `approval_required`, задача не создаётся); документ разметки; свежесть в сводке проекта.
import { afterEach, beforeEach, expect, it } from "vitest";
import * as jobsRepo from "../../src/db/repos/jobs.js";
import { approveRoughCut } from "../../src/edit/approval-a.js";
import { seedPlanProject } from "../analysis/plan-db-helpers.js";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";
import { seedSemantic } from "./plan-api-helpers.js";
import { k, storeOf } from "./video-helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
  await seedPlanProject(api.core.db, storeOf(api), api.core.root, []);
});
afterEach(() => api.close());

const analyze = (key: string, body: unknown = {}) => api.inj("POST", "/api/projects/p1/semantic/analyze", { ...okHeaders, ...k(key) }, body);

it("без валидного A — 409 approval_required, задачи нет; с A — 202 (useAgent передаётся)", async () => {
  const no = await analyze("sem-1");
  expect(no.statusCode).toBe(409);
  expect(no.json().error).toBe("approval_required");
  expect(jobsRepo.list(api.core.db, { projectId: "p1" }).filter((j) => j.type === "semantic.analyze")).toHaveLength(0);

  approveRoughCut(api.core.db, "p1");
  const r = await analyze("sem-2", { useAgent: false });
  expect(r.statusCode, r.body).toBe(202);
  expect(jobsRepo.get(api.core.db, r.json().job.id)).toMatchObject({ type: "semantic.analyze", input: { projectId: "p1", useAgent: false } });
  expect((await analyze("sem-2", { useAgent: false })).json().job.id).toBe(r.json().job.id);
});

it("GET semantic/:id — документ; сводка проекта — id и свежесть по текущим EDL и транскрипту", async () => {
  const doc = await seedSemantic(api);
  const g = await api.inj("GET", "/api/semantic/sem_k1", getHeaders);
  expect(g.statusCode, g.body).toBe(200);
  expect(g.json()).toEqual({ semantic: doc });
  expect((await api.inj("GET", "/api/semantic/sem_none", getHeaders)).statusCode).toBe(404);
  expect((await api.inj("GET", "/api/projects/p1/video", getHeaders)).json().semantic).toEqual({ id: "sem_k1", fresh: true });

  await seedSemantic(api, "sem_k2", 7); // по чужой ревизии EDL — устарела
  expect((await api.inj("GET", "/api/projects/p1/video", getHeaders)).json().semantic).toEqual({ id: "sem_k2", fresh: false });
});
