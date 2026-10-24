// Медиа видеопроекта (Task 29): импорт по пути (`media.import`, только `media.importRoots`) и
// потоковая загрузка (`upload.ts`), карточка исходника, файлы производных — только по id
// исходника из БД (прокси с Range, waveform, миниатюры по номеру), запуск ASR и его доступность.
// Путь клиента на диск не попадает; ответы ошибок — без абсолютных путей.
import { join } from "node:path";
import {
  AsrCapabilityDtoSchema,
  CreatedJobDtoSchema,
  ImportBodySchema,
  type Job,
  type MediaDto,
  MediaDtoSchema,
  TranscribeBodySchema,
} from "@ms/contracts";
import { z } from "zod";
import * as jobs from "../../db/repos/jobs.js";
import * as media from "../../db/repos/media.js";
import * as projects from "../../db/repos/projects.js";
import * as transcripts from "../../db/repos/transcripts.js";
import { tx } from "../../db/tx.js";
import { asrCapability } from "../../media/asr-capability.js";
import { resolveImportPath } from "../../media/guards.js";
import { MediaInvalidError, type MediaInvalidReason } from "../../media/probe.js";
import { enqueue } from "../../jobs/queue.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";
import { sendFile } from "../range.js";
import { uploadRoute } from "../upload.js";

const THUMB_RE = /^(0|[1-9]\d{0,5})\.jpg$/;
const ACTIVE_IMPORT: ReadonlySet<Job["status"]> = new Set(["pending", "running", "blocked"]);

/** Текст отказа импорта по коду причины — без путей (сообщение `MediaInvalidError` их содержит). */
const IMPORT_REASON: Record<MediaInvalidReason, string> = {
  not_absolute: "нужен абсолютный путь к видеофайлу",
  not_found: "файл не найден",
  not_file: "это не обычный файл",
  bad_extension: "расширение не видео (mov, mp4, m4v, mkv, webm)",
  in_storage: "файл внутри хранилища Motion Studio — импорт оттуда запрещён",
  outside_roots: "файл вне разрешённых каталогов импорта (media.importRoots в config.json)",
  invalid: "файл не годится для импорта",
};

export function mediaDto(db: Parameters<typeof media.get>[0], id: string): MediaDto | undefined {
  const asset = media.get(db, id);
  if (!asset) return undefined;
  const derivatives = media.derivatives(db, id).map((d) => ({ kind: d.kind, sha256: d.sha256, params: d.params }));
  const t = transcripts.byProject(db, asset.project_id);
  return { asset, derivatives, transcript_id: t && t.media_id === id && t.current_revision !== null ? t.id : null };
}

/** Видеопроект для импорта: есть, вида `video`, исходника ещё нет и импорт не идёт. */
export function importTarget(db: Parameters<typeof media.get>[0], projectId: string): void {
  const p = projects.get(db, projectId);
  if (!p) throw notFound(`проект ${projectId}`);
  if (p.kind !== "video") throw new ApiError(409, "not_video_project", "импорт видео — только в видеопроект");
  if (media.byProject(db, projectId)) throw new ApiError(409, "media_exists", "у проекта уже есть исходное видео (один исходник на проект)");
  const running = jobs.list(db, { projectId }).find((j) => j.type === "media.import" && ACTIVE_IMPORT.has(j.status));
  if (running) throw new ApiError(409, "import_in_progress", "импорт в этот проект уже идёт", { job_id: running.id });
}

export function mediaRoutes(app: ZApp, ctx: ApiContext): void {
  const { core } = ctx;
  const derivativeFile = (id: string, kind: "proxy" | "waveform" | "thumbs") => {
    if (!media.get(core.db, id)) throw notFound(`исходник ${id}`);
    const d = media.derivatives(core.db, id).find((x) => x.kind === kind);
    if (!d) throw notFound(`${kind} исходника ${id}`);
    return d;
  };

  app.post("/api/projects/:id/media/import", {
    schema: { params: IdParams, body: ImportBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const projectId = req.params.id;
    const input = { projectId, method: "path" as const, path: req.body.path };
    const prev = replay(core.db, key, "media.import", () => input);
    if (prev) return reply.status(200).send({ job: publicJob(prev, core.root) });
    importTarget(core.db, projectId);
    try {
      await resolveImportPath(req.body.path, core.config.media.importRoots, { forbidden: [core.root] });
    } catch (e) {
      if (e instanceof MediaInvalidError) throw new ApiError(400, "media_invalid", IMPORT_REASON[e.reason], { reason: e.reason });
      throw e;
    }
    const out = tx(core.db, () => {
      const again = replay(core.db, key, "media.import", () => input);
      if (again) return { status: 200 as const, job: again };
      importTarget(core.db, projectId);
      return { status: 202 as const, job: enqueue(core.db, { type: "media.import", projectId, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });

  uploadRoute(app, ctx);

  app.get("/api/media/:id", { schema: { params: IdParams, response: { 200: MediaDtoSchema } } }, async (req) => {
    const dto = mediaDto(core.db, req.params.id);
    if (!dto) throw notFound(`исходник ${req.params.id}`);
    return dto;
  });

  app.get("/api/media/:id/proxy.mp4", { schema: { params: IdParams } }, async (req, reply) => {
    const d = derivativeFile(req.params.id, "proxy");
    return sendFile(req, reply, join(core.root, d.rel_path), { contentType: "video/mp4" });
  });

  app.get("/api/media/:id/waveform.bin", { schema: { params: IdParams } }, async (req, reply) => {
    const d = derivativeFile(req.params.id, "waveform");
    return sendFile(req, reply, join(core.root, d.rel_path), { contentType: "application/octet-stream" });
  });

  app.get("/api/media/:id/thumbs/:file", {
    schema: { params: z.object({ id: IdParams.shape.id, file: z.string() }).strict() },
  }, async (req, reply) => {
    const m = THUMB_RE.exec(req.params.file);
    if (!m) throw notFound(`миниатюра ${req.params.file}`);
    const d = derivativeFile(req.params.id, "thumbs");
    const n = Number(m[1]);
    const count = typeof d.params.count === "number" ? d.params.count : 0;
    if (n >= count) throw notFound(`миниатюра ${n}`);
    // каталог миниатюр — рядом с thumbs.json; кадры ffmpeg нумерует с 1
    const dir = d.rel_path.slice(0, d.rel_path.lastIndexOf("/"));
    return sendFile(req, reply, join(core.root, dir, "thumbs", `${String(n + 1).padStart(6, "0")}.jpg`), { contentType: "image/jpeg" });
  });

  app.post("/api/media/:id/transcribe", {
    schema: { params: IdParams, body: TranscribeBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const out = tx(core.db, () => {
      const asset = media.get(core.db, req.params.id);
      const input = (projectId: string) => ({ projectId, mediaId: req.params.id, ...req.body });
      const prev = replay(core.db, key, "asr.transcribe", (j) => input(j.project_id));
      if (prev) return { status: 200 as const, job: prev };
      if (!asset) throw notFound(`исходник ${req.params.id}`);
      return { status: 202 as const, job: enqueue(core.db, { type: "asr.transcribe", projectId: asset.project_id, input: input(asset.project_id), idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: out.job });
  });

  app.get("/api/asr/capability", { schema: { response: { 200: AsrCapabilityDtoSchema } } }, async (req) => {
    const cap = await asrCapability(core.config.asr);
    // подробности (пути к python, воркеру, весам) — только в журнал сервера и `doctor`
    if (!cap.available) req.log.info({ reason: cap.reason, detail: cap.detail }, "asr unavailable");
    return cap.available
      ? { available: true, model: core.config.asr.model, gpu_contention: cap.gpuContention }
      : { available: false, reason: cap.reason, model: core.config.asr.model };
  });
}
