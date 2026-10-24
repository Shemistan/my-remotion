// Генерация, вертикальные двойники и пакеты экспорта сценария (спека §7, трек B).
// S5: пакет генерации (Approval B + сцены + задачи), его статус и отмена. S7: пакет экспорта —
// задача script.package, пакет, шпаргалка, «Показать в Finder». Двойники 9:16 — 501 (S10).
import { CheatsheetQuerySchema, CreatedJobDtoSchema, GenerateBodySchema, PackageBodySchema, ReframeBodySchema, ScriptBatchDtoSchema, ScriptPackageDtoSchema } from "@ms/contracts";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import * as projects from "../../db/repos/projects.js";
import { scriptPackages } from "../../db/repos/script.js";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { packageDto } from "../../pipeline/script-package.js";
import { CHEAT_FILES } from "../../script/cheatsheet.js";
import { batchForKey, batchStatus, cancelBatch, startScriptBatch } from "../../script/batch.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";

const CHEAT_TYPES = { md: "text/markdown; charset=utf-8", csv: "text/csv; charset=utf-8", txt: "text/plain; charset=utf-8" } as const;

/** `open -R <путь>` (показать в Finder) без shell; ошибка запуска — 500 `reveal_failed`. */
export function revealInFinder(abs: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("open", ["-R", abs], { stdio: "ignore" });
    child.once("error", (e) => reject(new ApiError(500, "reveal_failed", `Finder не открыт: ${e.message}`)));
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new ApiError(500, "reveal_failed", `open -R завершился с кодом ${code}`))));
  });
}

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
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const db = core.db;
    const input = { projectId: req.params.id, aspect: req.body.aspect };
    const out = tx(db, () => {
      const prev = replay(db, key, "script.package", () => input);
      if (prev) return { status: 200 as const, job: prev };
      const project = projects.get(db, req.params.id);
      if (!project) throw notFound(`проект ${req.params.id}`);
      if (project.kind !== "script") throw new ApiError(409, "not_script_project", "проект не сценарный");
      return { status: 202 as const, job: enqueue(db, { type: "script.package", projectId: project.id, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });

  const packageOr404 = (id: string) => {
    const row = scriptPackages.get(core.db, id);
    const dto = row ? packageDto(core.root, row) : undefined;
    if (!row || !dto) throw notFound(`пакет экспорта ${id}`);
    return { row, dto };
  };

  app.get("/api/script-packages/:id", { schema: { params: IdParams, response: { 200: ScriptPackageDtoSchema } } }, async (req) =>
    packageOr404(req.params.id).dto);

  // текст файла шпаргалки из папки пакета (то, что лежит у человека); csv/txt — скачиванием
  app.get("/api/script-packages/:id/cheatsheet", { schema: { params: IdParams, querystring: CheatsheetQuerySchema } }, async (req, reply) => {
    const { row, dto } = packageOr404(req.params.id);
    const format = req.query.format;
    const text = await readFile(join(core.root, row.rel_path, CHEAT_FILES[format]));
    reply.type(CHEAT_TYPES[format]);
    if (format !== "md") {
      const name = `${dto.display_name}_шпаргалка.${format}`;
      reply.header("content-disposition", `attachment; filename="cheatsheet.${format}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    }
    return reply.send(text);
  });

  // Finder: `open -R <папка>` без shell; путь — только из строки БД
  app.post("/api/script-packages/:id/reveal", { schema: { params: IdParams, response: { 204: z.null() } } }, async (req, reply) => {
    await revealInFinder(packageOr404(req.params.id).dto.abs_path);
    return reply.status(204).send(null);
  });
};
