// Текст и план сценария (спека §7, трек A): PUT/GET текста, `script.plan`, правки плана.
// GET собирает состояние (`scriptState`, S1); PUT — новая ревизия текста (`saveScriptText`, S2);
// POST plan — задача `script.plan` (S3); POST plan/ops — синхронная правка плана (`savePlanOps`, S4);
// сцены с `fill: pending` и нет активной задачи — задача дозаполнения `script.plan` с `fill`
// (S16a F2/F3); POST plan/fill — её повтор по кнопке (ревью S16a I1).
import { CreatedJobDtoSchema, PlanOpsBodySchema, PutScriptBodySchema, ScriptDtoSchema, ScriptPlanBodySchema, ScriptPlanDtoSchema, ScriptStateDtoSchema } from "@ms/contracts";
import { ArtifactStore } from "../../artifacts/store.js";
import * as projects from "../../db/repos/projects.js";
import { scripts } from "../../db/repos/script.js";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { savePlanOps } from "../../script/plan-ops.js";
import { ensureFillJob } from "../../script/fill-jobs.js";
import { planOutdated, scriptApproval } from "../../script/plan-state.js";
import { currentScript, currentScriptPlan } from "../../script/read.js";
import { scriptState } from "../../script/state.js";
import { saveScriptText, scriptReading } from "../../script/text.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";

export function scriptTextRoutes(app: ZApp, { core }: ApiContext): void {
  app.put("/api/projects/:id/script", {
    schema: { params: IdParams, body: PutScriptBodySchema, response: { 200: ScriptDtoSchema } },
  }, async (req) => {
    const store = new ArtifactStore({ root: core.root, db: core.db, guard: core.storageCheck });
    const script = await saveScriptText({ db: core.db, store, root: core.root }, req.params.id, req.body);
    return { script, reading: scriptReading(core.db, core.root, req.params.id) };
  });

  app.get("/api/projects/:id/script", {
    schema: { params: IdParams, response: { 200: ScriptStateDtoSchema } },
  }, async (req) => scriptState(core.db, core.root, req.params.id));

  // план сценария: каждый запуск — полное перестроение (новый plan_id); без текста — 409 no_script
  app.post("/api/projects/:id/script/plan", {
    schema: { params: IdParams, body: ScriptPlanBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const projectId = req.params.id;
    const input = {
      projectId,
      ...(req.body.useAgent === undefined ? {} : { useAgent: req.body.useAgent }),
      ...(req.body.reading === undefined ? {} : { reading: req.body.reading }),
    };
    const out = tx(core.db, () => {
      const prev = replay(core.db, key, "script.plan", () => input);
      if (prev) return { status: 200 as const, job: prev };
      const project = projects.get(core.db, projectId);
      if (!project) throw notFound(`проект ${projectId}`);
      if (project.kind !== "script") throw new ApiError(409, "not_script_project", "проект не сценарный");
      if (scripts.byProject(core.db, projectId)?.current_revision == null) throw new ApiError(409, "no_script", "сначала сохраните текст сценария");
      return { status: 202 as const, job: enqueue(core.db, { type: "script.plan", projectId, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });

  app.post("/api/projects/:id/script/plan/ops", {
    schema: { params: IdParams, body: PlanOpsBodySchema, response: { 200: ScriptPlanDtoSchema } },
  }, async (req) => {
    const store = new ArtifactStore({ root: core.root, db: core.db, guard: core.storageCheck });
    const doc = await savePlanOps({ db: core.db, store, root: core.root }, req.params.id, req.body);
    // S16a F2/F3, ревью I1: есть сцены, ждущие дозаполнения, а активной задачи нет — ставится новая
    ensureFillJob(core.db, req.params.id, doc);
    return { plan_id: doc.plan_id, doc, approval: scriptApproval(core.db, req.params.id) };
  });

  // ревью S16a I1: «Повторить дозаполнение» — задача по сценам `fill: pending`, если активной нет
  app.post("/api/projects/:id/script/plan/fill", {
    schema: { params: IdParams, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const projectId = req.params.id;
    const project = projects.get(core.db, projectId);
    if (!project) throw notFound(`проект ${projectId}`);
    if (project.kind !== "script") throw new ApiError(409, "not_script_project", "проект не сценарный");
    const cur = currentScriptPlan(core.db, core.root, projectId);
    const script = currentScript(core.db, core.root, projectId);
    if (cur && script && planOutdated(cur.doc, script)) throw new ApiError(409, "plan_outdated", "текст сценария изменился после плана — перестройте план");
    const out = cur ? ensureFillJob(core.db, projectId, cur.doc) : null;
    if (!out) throw new ApiError(409, "nothing_to_fill", "в плане нет сцен, ждущих дозаполнения");
    return reply.status(out.created ? 202 : 200).send({ job: publicJob(out.job, core.root) });
  });
}
