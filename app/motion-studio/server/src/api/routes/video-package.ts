// Маршруты Task 5L: папка клипов видеопроекта (задача `video.package`), список и карточка папки,
// шпаргалка md/csv/txt, «Показать в Finder» — как у пакета сценария (`script-batch.ts`).
import { CheatsheetQuerySchema, CreatedJobDtoSchema, VideoPackageDtoSchema } from "@ms/contracts";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import * as projects from "../../db/repos/projects.js";
import { videoPackages } from "../../db/repos/video.js";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { videoPackageDto, videoPackagesForProject } from "../../pipeline/video-package.js";
import { CHEAT_FILES } from "../../script/cheatsheet.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";
import { revealInFinder, rfc5987 } from "./script-batch.js";

/** `POST /projects/:id/video/package`: по умолчанию — только утверждённые (C) версии. */
export const VideoPackageBodySchema = z.object({ only_approved: z.boolean().optional() }).strict();

const CHEAT_TYPES = { md: "text/markdown; charset=utf-8", csv: "text/csv; charset=utf-8", txt: "text/plain; charset=utf-8" } as const;

export const videoPackageRoutes: (app: ZApp, ctx: ApiContext) => void = (app, { core }) => {
  // 202 — новая задача, 200 — повтор того же Idempotency-Key (та же задача)
  app.post("/api/projects/:id/video/package", {
    schema: { params: IdParams, body: VideoPackageBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const db = core.db;
    const input = { projectId: req.params.id, only_approved: req.body.only_approved !== false };
    const out = tx(db, () => {
      const prev = replay(db, key, "video.package", () => input);
      if (prev) return { status: 200 as const, job: prev };
      const project = projects.get(db, req.params.id);
      if (!project) throw notFound(`проект ${req.params.id}`);
      if (project.kind !== "video") throw new ApiError(409, "not_video_project", "проект не видеопроект");
      return { status: 202 as const, job: enqueue(db, { type: "video.package", projectId: project.id, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });

  app.get("/api/projects/:id/video-packages", { schema: { params: IdParams, response: { 200: z.array(VideoPackageDtoSchema) } } }, async (req) => {
    const project = projects.get(core.db, req.params.id);
    if (!project) throw notFound(`проект ${req.params.id}`);
    return videoPackagesForProject(core.db, core.root, project.id);
  });

  const rowOr404 = (id: string) => {
    const row = videoPackages.get(core.db, id);
    if (!row) throw notFound(`папка клипов ${id}`);
    return row;
  };

  app.get("/api/video-packages/:id", { schema: { params: IdParams, response: { 200: VideoPackageDtoSchema } } }, async (req) => {
    const row = rowOr404(req.params.id);
    const dto = videoPackageDto(core.root, row);
    if (!dto) throw new ApiError(409, "package_broken", `манифест папки клипов ${row.id} не читается — откройте папку в Finder`);
    return dto;
  });

  // текст файла шпаргалки из папки (то, что лежит у человека); csv/txt — скачиванием
  app.get("/api/video-packages/:id/cheatsheet", { schema: { params: IdParams, querystring: CheatsheetQuerySchema } }, async (req, reply) => {
    const row = rowOr404(req.params.id);
    const format = req.query.format;
    const text = await readFile(join(core.root, row.rel_path, CHEAT_FILES[format])).catch((e: unknown) => {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") throw notFound(`шпаргалка папки клипов ${row.id}`);
      throw e;
    });
    reply.type(CHEAT_TYPES[format]);
    if (format !== "md") {
      const name = `${videoPackageDto(core.root, row)?.display_name ?? row.id}_шпаргалка.${format}`;
      reply.header("content-disposition", `attachment; filename="cheatsheet.${format}"; filename*=UTF-8''${rfc5987(name)}`);
    }
    return reply.send(text);
  });

  // Finder: `open -R <папка>` без shell; путь — только из строки БД
  app.post("/api/video-packages/:id/reveal", { schema: { params: IdParams, response: { 204: z.null() } } }, async (req, reply) => {
    const row = rowOr404(req.params.id);
    const abs = join(core.root, row.rel_path);
    if (!existsSync(abs)) throw notFound(`папка клипов ${row.id}`);
    await revealInFinder(abs);
    return reply.status(204).send(null);
  });
};
