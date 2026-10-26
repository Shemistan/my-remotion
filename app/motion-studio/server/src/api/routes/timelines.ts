// Маршруты Task 45: таймлайн видеопроекта — состояние текущей ревизии со свежестью (42), сборка
// (`timeline.build`), правка ревизии (`saveTimelineRevision`: move / use_version / include, Р-V6 и
// Д2 — длительности, режима и зоны здесь нет), список и документ ревизии, превью ревизии
// (`timeline.preview`) и его файл с Range — только опубликованный `timeline-preview/<id>/r<N>/`.
import { join } from "node:path";
import { CreatedJobDtoSchema, type Job, type TimelineDto, TimelineDtoSchema, TimelineRevisionBodySchema, VideoTimelineDocSchema } from "@ms/contracts";
import { z } from "zod";
import { peekApprovalState } from "../../approvals/engine.js";
import { currentSubject } from "../../approvals/subjects.js";
import { artifactPaths } from "../../artifacts/paths.js";
import { ArtifactStore, isPublished } from "../../artifacts/store.js";
import type { Db } from "../../db/open.js";
import * as jobs from "../../db/repos/jobs.js";
import * as projects from "../../db/repos/projects.js";
import { type VideoTimelineRow, videoTimelines } from "../../db/repos/video.js";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { TIMELINE_PREVIEW_FILE } from "../../pipeline/timeline-preview.js";
import { deletedRefusal } from "../../projects/lifecycle.js";
import { timelineFreshness } from "../../timeline/freshness.js";
import { TimelineError, readTimelineDoc, saveTimelineRevision, timelineRow } from "../../timeline/ops.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";
import { sendFile } from "../range.js";
import { EDIT_BODY_LIMIT, checkOps } from "./transcripts.js";

export const RevParams = z.object({ id: IdParams.shape.id, n: z.string().regex(/^[1-9]\d{0,8}$/).transform(Number) }).strict();

/** Ревизия таймлайна в списке «Ревизии». */
export const TimelineRevisionEntrySchema = z.object({
  revision: z.number().int().positive(),
  parent_revision: z.number().int().positive().nullable(),
  created_at: z.string(),
  current: z.boolean(),
  /** Действующих операций пользователя в ревизии (накопительно). */
  ops: z.number().int().nonnegative(),
  scenes: z.number().int().nonnegative(),
}).strict();

const RevisionDocSchema = z.object({ timeline_id: z.string(), revision: z.number().int().positive(), doc: VideoTimelineDocSchema }).strict();

/** Ошибка операций таймлайна (`TimelineError`, «<код>: …») → ответ API с её статусом и кодом. */
export function timelineApiError(e: unknown): unknown {
  if (e instanceof TimelineError) return new ApiError(e.status, e.code, e.message.slice(e.code.length + 2));
  return e;
}

async function orApi<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw timelineApiError(e);
  }
}

/** Последняя задача сборки или превью таймлайна проекта. */
function lastTimelineJob(db: Db, projectId: string): Job | undefined {
  return jobs.list(db, { projectId }).filter((j) => j.type === "timeline.build" || j.type === "timeline.preview").at(-1);
}

/** Видеопроект (не в корзине) или 404 / 409. */
export function videoProjectOr4xx(db: Db, projectId: string) {
  const p = projects.get(db, projectId);
  if (!p) throw notFound(`проект ${projectId}`);
  const deleted = deletedRefusal(db, p.id);
  if (deleted) throw deleted;
  if (p.kind !== "video") throw new ApiError(409, "not_video_project", "проект не видеопроект");
  return p;
}

/** Таймлайн с опубликованной ревизией или 404 `timeline_not_found`. */
export function timelineOr404(db: Db, timelineId: string): VideoTimelineRow & { current_revision: number } {
  const t = timelineRow(db, timelineId);
  if (!t || t.current_revision === null) throw new ApiError(404, "timeline_not_found", `таймлайна ${timelineId} нет`);
  return t as VideoTimelineRow & { current_revision: number };
}

/** Состояние текущей ревизии таймлайна проекта для UI: документ, свежесть, последняя задача, превью. */
export function timelineDto(db: Db, root: string, projectId: string): TimelineDto {
  const row = videoTimelines.byProject(db, projectId);
  const job = lastTimelineJob(db, projectId);
  if (!row || row.current_revision === null) {
    throw new ApiError(404, "timeline_not_found", "таймлайн ещё не собран", { job: job ? publicJob(job, root) : null });
  }
  const doc = readTimelineDoc(db, root, row.id, row.current_revision);
  const fresh = timelineFreshness(db, root, projectId);
  return {
    timeline_id: row.id,
    revision: row.current_revision,
    doc,
    fresh: fresh.fresh,
    reasons: fresh.reasons,
    job: job ? publicJob(job, root) : null,
    preview_ready: isPublished(db, artifactPaths(root, projectId).timelinePreviewRev(row.id, row.current_revision)),
  };
}

interface RevisionRow { revision: number; parent_revision: number | null; created_at: string }

export const timelineRoutes: (app: ZApp, ctx: ApiContext) => void = (app, { core }) => {
  const { db, root } = core;

  app.get("/api/projects/:id/timeline", { schema: { params: IdParams, response: { 200: TimelineDtoSchema } } }, async (req) => {
    videoProjectOr4xx(db, req.params.id);
    return orApi(() => timelineDto(db, root, req.params.id));
  });

  // 202 — новая задача, 200 — повтор того же Idempotency-Key; A или B не валидны — 409 без задачи
  app.post("/api/projects/:id/timeline/build", {
    schema: { params: IdParams, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const input = { projectId: req.params.id };
    const out = tx(db, () => {
      const prev = replay(db, key, "timeline.build", () => input);
      if (prev) return { status: 200 as const, job: prev };
      const p = videoProjectOr4xx(db, req.params.id);
      for (const kind of ["A", "B"] as const) {
        const s = peekApprovalState(db, p.id, kind, currentSubject(db, p.id, kind));
        if (s.state !== "valid") {
          const what = kind === "A" ? "черновой монтаж (A)" : "визуальный план (B)";
          throw new ApiError(409, "approval_required", `${what} ${s.state === "missing" ? "не утверждён" : "устарел"} — утвердите его, затем соберите таймлайн`, { kind });
        }
      }
      return { status: 202 as const, job: enqueue(db, { type: "timeline.build", projectId: p.id, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, root) });
  });

  // Правка ревизии. Защита `base_revision` — в `saveTimelineRevision`: сверка с текущей ревизией до
  // работы и ещё раз в транзакции публикации (`publishTimelineRevision(…, conflict)`), так что две
  // правки на одной базе не перезапишут друг друга — вторая получит 409 `revision_conflict`;
  // таймлайн пишет задача — 409 `resource_busy`. Idempotency-Key не нужен: повтор той же правки на
  // старой базе — тот же 409, клиент перечитывает текущую ревизию.
  app.post("/api/timelines/:id/revisions", {
    bodyLimit: EDIT_BODY_LIMIT,
    preValidation: async (req) => {
      const ops = (req.body as { ops?: unknown } | null)?.ops;
      if (Array.isArray(ops)) checkOps(ops);
    },
    schema: { params: IdParams, body: TimelineRevisionBodySchema, response: { 201: TimelineDtoSchema } },
  }, async (req, reply) => {
    const t = timelineOr404(db, req.params.id);
    videoProjectOr4xx(db, t.project_id);
    const store = new ArtifactStore({ root, db, guard: core.storageCheck });
    await orApi(() => saveTimelineRevision({ db, store, root }, t.id, req.body));
    return reply.status(201).send(timelineDto(db, root, t.project_id));
  });

  app.get("/api/timelines/:id/revisions", { schema: { params: IdParams, response: { 200: z.array(TimelineRevisionEntrySchema) } } }, async (req) => {
    const t = timelineOr404(db, req.params.id);
    const rows = db.prepare("SELECT revision, parent_revision, created_at FROM video_timeline_revisions WHERE timeline_id = ? ORDER BY revision").all(t.id) as RevisionRow[];
    return rows.map((r) => {
      const doc = readTimelineDoc(db, root, t.id, r.revision);
      return { ...r, current: r.revision === t.current_revision, ops: doc.ops?.length ?? 0, scenes: doc.scenes.length };
    });
  });

  app.get("/api/timelines/:id/revisions/:n", { schema: { params: RevParams, response: { 200: RevisionDocSchema } } }, async (req) => {
    const t = timelineOr404(db, req.params.id);
    return orApi(() => ({ timeline_id: t.id, revision: req.params.n, doc: readTimelineDoc(db, root, t.id, req.params.n) }));
  });

  app.post("/api/timelines/:id/revisions/:n/preview", {
    schema: { params: RevParams, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const input = { timelineId: req.params.id, revision: req.params.n };
    const out = tx(db, () => {
      const prev = replay(db, key, "timeline.preview", () => input);
      if (prev) return { status: 200 as const, job: prev };
      const t = timelineOr404(db, req.params.id);
      videoProjectOr4xx(db, t.project_id);
      if (!videoTimelines.revision(db, t.id, req.params.n)) throw new ApiError(404, "timeline_not_found", `нет ревизии r${req.params.n} таймлайна ${t.id}`);
      return { status: 202 as const, job: enqueue(db, { type: "timeline.preview", projectId: t.project_id, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, root) });
  });

  app.get("/api/timelines/:id/revisions/:n/preview.mp4", { schema: { params: RevParams } }, async (req, reply) => {
    const t = timelineOr404(db, req.params.id);
    const rel = artifactPaths(root, t.project_id).timelinePreviewRev(t.id, req.params.n);
    if (!isPublished(db, rel)) throw notFound(`превью r${req.params.n} таймлайна ${t.id}`);
    return sendFile(req, reply, join(root, rel, TIMELINE_PREVIEW_FILE), { contentType: "video/mp4" });
  });
};
