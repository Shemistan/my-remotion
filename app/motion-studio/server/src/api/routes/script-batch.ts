// Генерация, вертикальные двойники и пакеты экспорта сценария (спека §7, трек B).
// S1: схемы тел и ответов всех маршрутов, тело — 501 `not_implemented`.
import { CheatsheetQuerySchema, CreatedJobDtoSchema, GenerateBodySchema, PackageBodySchema, ReframeBodySchema, ScriptBatchDtoSchema, ScriptPackageDtoSchema } from "@ms/contracts";
import { z } from "zod";
import { type ApiContext, IdParams, type ZApp, idempotencyKey } from "../context.js";
import { ApiError } from "../errors.js";

const notImplemented = (what: string): ApiError => new ApiError(501, "not_implemented", `${what}: ещё не реализовано`);

export const scriptBatchRoutes: (app: ZApp, ctx: ApiContext) => void = (app) => {
  app.post("/api/projects/:id/script/generate", {
    schema: { params: IdParams, body: GenerateBodySchema, response: { 200: ScriptBatchDtoSchema, 202: ScriptBatchDtoSchema } },
  }, async (req) => {
    idempotencyKey(req);
    throw notImplemented("генерация сцен сценария");
  });

  app.get("/api/script-batches/:id", { schema: { params: IdParams, response: { 200: ScriptBatchDtoSchema } } }, async () => {
    throw notImplemented("пакет генерации");
  });

  app.post("/api/script-batches/:id/cancel", { schema: { params: IdParams, response: { 200: ScriptBatchDtoSchema } } }, async () => {
    throw notImplemented("отмена пакета генерации");
  });

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
