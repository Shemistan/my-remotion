// Генерация, вертикальные двойники и пакеты экспорта сценария (спека §7, трек B).
// S5: пакет генерации (Approval B + сцены + задачи), его статус и отмена. Остальное — S1:
// схемы тел и ответов, тело — 501 `not_implemented`.
import { CheatsheetQuerySchema, CreatedJobDtoSchema, GenerateBodySchema, PackageBodySchema, ReframeBodySchema, ScriptBatchDtoSchema, ScriptPackageDtoSchema } from "@ms/contracts";
import { z } from "zod";
import { batchForKey, batchStatus, cancelBatch, startScriptBatch } from "../../script/batch.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey } from "../context.js";
import { ApiError } from "../errors.js";

const notImplemented = (what: string): ApiError => new ApiError(501, "not_implemented", `${what}: ещё не реализовано`);

export const scriptBatchRoutes: (app: ZApp, ctx: ApiContext) => void = (app, { core }) => {
  // 202 — новый пакет, 200 — повтор того же Idempotency-Key (тот же пакет)
  app.post("/api/projects/:id/script/generate", {
    schema: { params: IdParams, body: GenerateBodySchema, response: { 200: ScriptBatchDtoSchema, 202: ScriptBatchDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const { revision, item_ids, regenerate, aspect } = req.body;
    const existed = batchForKey(core.db, req.params.id, key) !== undefined;
    const dto = startScriptBatch(core, {
      projectId: req.params.id, revision, idempotencyKey: key,
      ...(item_ids ? { itemIds: item_ids } : {}), ...(regenerate !== undefined ? { regenerate } : {}), ...(aspect ? { aspect } : {}),
    });
    return reply.status(existed ? 200 : 202).send(dto);
  });

  app.get("/api/script-batches/:id", { schema: { params: IdParams, response: { 200: ScriptBatchDtoSchema } } }, async (req) =>
    batchStatus(core.db, core.root, req.params.id));

  app.post("/api/script-batches/:id/cancel", { schema: { params: IdParams, response: { 200: ScriptBatchDtoSchema } } }, async (req) =>
    cancelBatch(core, req.params.id));

  app.post("/api/projects/:id/script/reframe", {
    schema: { params: IdParams, body: ReframeBodySchema, response: { 200: ScriptBatchDtoSchema, 202: ScriptBatchDtoSchema } },
  }, async (req) => {
    idempotencyKey(req);
    throw notImplemented("вертикальные двойники");
  });

  app.post("/api/projects/:id/script/package", {
    schema: { params: IdParams, body: PackageBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req) => {
    idempotencyKey(req);
    throw notImplemented("пакет экспорта");
  });

  app.get("/api/script-packages/:id", { schema: { params: IdParams, response: { 200: ScriptPackageDtoSchema } } }, async () => {
    throw notImplemented("пакет экспорта");
  });

  app.get("/api/script-packages/:id/cheatsheet", {
    schema: { params: IdParams, querystring: CheatsheetQuerySchema, response: { 200: z.string() } },
  }, async () => {
    throw notImplemented("шпаргалка");
  });

  app.post("/api/script-packages/:id/reveal", { schema: { params: IdParams, response: { 204: z.null() } } }, async () => {
    throw notImplemented("показ папки в Finder");
  });
};
