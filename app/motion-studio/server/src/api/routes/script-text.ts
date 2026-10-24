// Текст и план сценария (спека §7, трек A): PUT/GET текста, `script.plan`, правки плана.
// GET собирает состояние (`scriptState`, S1); PUT — новая ревизия текста (`saveScriptText`, S2);
// план и правки плана — пока схемы тел и ответов, 501.
import { CreatedJobDtoSchema, PlanOpsBodySchema, PutScriptBodySchema, ScriptDtoSchema, ScriptPlanBodySchema, ScriptPlanDtoSchema, ScriptStateDtoSchema } from "@ms/contracts";
import { ArtifactStore } from "../../artifacts/store.js";
import { scriptState } from "../../script/state.js";
import { saveScriptText, scriptReading } from "../../script/text.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey } from "../context.js";
import { ApiError } from "../errors.js";

const notImplemented = (what: string): ApiError => new ApiError(501, "not_implemented", `${what}: ещё не реализовано`);

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

  app.post("/api/projects/:id/script/plan", {
    schema: { params: IdParams, body: ScriptPlanBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req) => {
    idempotencyKey(req);
    throw notImplemented("план сценария");
  });

  app.post("/api/projects/:id/script/plan/ops", {
    schema: { params: IdParams, body: PlanOpsBodySchema, response: { 200: ScriptPlanDtoSchema } },
  }, async () => {
    throw notImplemented("правка плана сценария");
  });
}
