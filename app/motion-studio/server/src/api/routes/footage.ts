// Анализ видеоряда (Task 33): запуск `footage.analyze` по исходнику проекта (`useAgent: false` —
// только детектор), документ анализа и ключевые кадры. Кадр отдаётся только из списка кадров
// анализа (`frames/<µs>.png` рядом с footage.json): имя из запроса в путь не попадает.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AnalyzeBodySchema, CreatedJobDtoSchema, type FootageAnalysis, FootageAnalysisSchema, FootageDtoSchema } from "@ms/contracts";
import { z } from "zod";
import type { Db } from "../../db/open.js";
import * as footageRepo from "../../db/repos/footage.js";
import * as media from "../../db/repos/media.js";
import * as projects from "../../db/repos/projects.js";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";
import { sendFile } from "../range.js";

const FRAME_RE = /^(0|[1-9]\d{0,11})\.png$/;

/** Опубликованный анализ видеоряда по id; нет — 404. */
export function readFootageDoc(db: Db, root: string, id: string): { row: footageRepo.FootageRow; doc: FootageAnalysis } {
  const row = footageRepo.get(db, id);
  if (!row) throw notFound(`анализ видеоряда ${id}`);
  return { row, doc: FootageAnalysisSchema.parse(JSON.parse(readFileSync(join(root, row.rel_path), "utf8"))) };
}

export function footageRoutes(app: ZApp, { core }: ApiContext): void {
  app.post("/api/projects/:id/footage/analyze", {
    schema: { params: IdParams, body: AnalyzeBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const projectId = req.params.id;
    const out = tx(core.db, () => {
      const asset = media.byProject(core.db, projectId);
      const input = (mediaId: string) => ({ projectId, mediaId, ...(req.body.useAgent === undefined ? {} : { useAgent: req.body.useAgent }) });
      const prev = replay(core.db, key, "footage.analyze", (j) => input(String((j.input as { mediaId?: unknown }).mediaId ?? "")));
      if (prev) return { status: 200 as const, job: prev };
      const p = projects.get(core.db, projectId);
      if (!p) throw notFound(`проект ${projectId}`);
      if (p.kind !== "video") throw new ApiError(409, "not_video_project", "анализ видеоряда — только в видеопроекте");
      if (!asset) throw new ApiError(409, "no_media", "сначала импортируйте исходное видео");
      return { status: 202 as const, job: enqueue(core.db, { type: "footage.analyze", projectId, input: input(asset.id), idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });

  app.get("/api/footage/:id", { schema: { params: IdParams, response: { 200: FootageDtoSchema } } }, async (req) => {
    const { row, doc } = readFootageDoc(core.db, core.root, req.params.id);
    return { media_id: row.media_id, analysis: doc };
  });

  app.get("/api/footage/:id/frames/:file", {
    schema: { params: z.object({ id: IdParams.shape.id, file: z.string() }).strict() },
  }, async (req, reply) => {
    const m = FRAME_RE.exec(req.params.file);
    if (!m) throw notFound(`кадр ${req.params.file}`);
    const { row, doc } = readFootageDoc(core.db, core.root, req.params.id);
    const us = Number(m[1]);
    const kf = doc.shots.flatMap((s) => s.keyframes).find((k) => k.us === us);
    if (!kf) throw notFound(`кадр ${us}`);
    // путь кадра — из документа анализа (`frames/<µs>.png`); на всякий случай — только внутри каталога анализа
    if (!/^frames\/\d{1,12}\.png$/.test(kf.path)) throw notFound(`кадр ${us}`);
    const dir = row.rel_path.slice(0, row.rel_path.lastIndexOf("/"));
    return sendFile(req, reply, join(core.root, dir, kf.path), { contentType: "image/png" });
  });
}
