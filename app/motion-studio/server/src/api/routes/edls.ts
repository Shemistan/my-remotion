// Черновой монтаж (Task 29): предложение (`roughcut.propose`), ревизия EDL с таймлайном и
// положением слов в edited, правка решений от `base_revision` (`saveEdlRevision`), превью
// ревизии (`roughcut.preview`) и его файл — только опубликованный `preview/<edl>/r<N>/`.
// Чтение пересчитывает якоря по текущей ревизии транскрипта без записи (ревью Task 27, M2);
// у проекта один EDL (M6): повторный propose — новая ревизия того же EDL.
import { join } from "node:path";
import {
  CreatedJobDtoSchema,
  type EdlDto,
  EdlDtoSchema,
  EdlRevisionBodySchema,
  RoughcutProposeBodySchema,
  mapWords,
} from "@ms/contracts";
import { z } from "zod";
import { artifactPaths } from "../../artifacts/paths.js";
import { ArtifactStore, isPublished } from "../../artifacts/store.js";
import type { Db } from "../../db/open.js";
import * as edls from "../../db/repos/edls.js";
import * as projects from "../../db/repos/projects.js";
import * as transcripts from "../../db/repos/transcripts.js";
import { tx } from "../../db/tx.js";
import { currentEdl, reanchorDecisions, saveEdlRevision } from "../../edit/edl-ops.js";
import { EditError } from "../../edit/errors.js";
import { timelineFor } from "../../edit/timeline-store.js";
import { enqueue } from "../../jobs/queue.js";
import { PREVIEW_FILE } from "../../pipeline/roughcut-preview.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { sendFile } from "../range.js";
import { EDIT_BODY_LIMIT, RevisionQuery, checkOps } from "./transcripts.js";

const RevParams = z.object({ id: IdParams.shape.id, n: z.string().regex(/^[1-9]\d{0,8}$/).transform(Number) }).strict();

/** Превью ревизии опубликовано (`roughcut.preview`). */
export function previewReady(db: Db, root: string, projectId: string, edlId: string, revision: number): boolean {
  return isPublished(db, artifactPaths(root, projectId).previewRev(edlId, revision));
}

/** Слова текущей ревизии транскрипта (индекс БД); транскрипта нет — пусто. */
function currentWords(db: Db, transcriptId: string) {
  const t = transcripts.get(db, transcriptId);
  if (!t || t.current_revision === null) return [];
  return transcripts.words(db, transcriptId, t.current_revision).map((x) => ({ id: x.word_id, start_us: x.start_us, end_us: x.end_us }));
}

/** Ревизия EDL для UI: якоря решений и `word_map` — по текущей ревизии транскрипта, без записи. */
export function edlDto(db: Db, root: string, id: string, revision?: number): EdlDto {
  const e = edls.get(db, id);
  if (!e || e.current_revision === null) throw new EditError("edl_not_found", `нет EDL ${id}`);
  const doc = currentEdl(db, root, id, revision);
  const words = currentWords(db, doc.transcript_id);
  const timeline = timelineFor(db, id, doc.revision);
  return {
    id,
    current_revision: e.current_revision,
    doc: { ...doc, decisions: reanchorDecisions(doc.decisions, words, doc.timeline_fps) },
    timeline,
    word_map: mapWords(timeline, words),
    preview_ready: previewReady(db, root, e.project_id, id, doc.revision),
  };
}

export function edlRoutes(app: ZApp, { core }: ApiContext): void {
  const edlOr404 = (id: string) => {
    const e = edls.get(core.db, id);
    if (!e || e.current_revision === null) throw new EditError("edl_not_found", `нет EDL ${id}`);
    return e;
  };

  app.post("/api/projects/:id/roughcut/propose", {
    schema: { params: IdParams, body: RoughcutProposeBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const projectId = req.params.id;
    const input = { projectId, ...(req.body.useAgent === undefined ? {} : { useAgent: req.body.useAgent }) };
    const out = tx(core.db, () => {
      const prev = replay(core.db, key, "roughcut.propose", () => input);
      if (prev) return { status: 200 as const, job: prev };
      const p = projects.get(core.db, projectId);
      if (!p) throw notFound(`проект ${projectId}`);
      if (p.kind !== "video") throw new ApiError(409, "not_video_project", "черновой монтаж — только в видеопроекте");
      const t = transcripts.byProject(core.db, projectId);
      if (!t || t.current_revision === null) throw new ApiError(409, "no_transcript", "сначала распознайте речь: черновой монтаж строится по транскрипту");
      return { status: 202 as const, job: enqueue(core.db, { type: "roughcut.propose", projectId, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: out.job });
  });

  app.get("/api/edls/:id", {
    schema: { params: IdParams, querystring: RevisionQuery, response: { 200: EdlDtoSchema } },
  }, async (req) => edlDto(core.db, core.root, req.params.id, req.query.revision));

  app.post("/api/edls/:id/revisions", {
    bodyLimit: EDIT_BODY_LIMIT,
    preValidation: async (req) => {
      const ops = (req.body as { ops?: unknown } | null)?.ops;
      if (Array.isArray(ops)) checkOps(ops);
    },
    schema: { params: IdParams, body: EdlRevisionBodySchema, response: { 201: EdlDtoSchema } },
  }, async (req, reply) => {
    const store = new ArtifactStore({ root: core.root, db: core.db, guard: core.storageCheck });
    const { doc } = await saveEdlRevision({ db: core.db, store, root: core.root, roughcut: core.config.roughcut }, req.params.id, req.body);
    return reply.status(201).send(edlDto(core.db, core.root, req.params.id, doc.revision));
  });

  app.post("/api/edls/:id/revisions/:n/preview", {
    schema: { params: RevParams, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const input = { edlId: req.params.id, revision: req.params.n };
    const out = tx(core.db, () => {
      const prev = replay(core.db, key, "roughcut.preview", () => input);
      if (prev) return { status: 200 as const, job: prev };
      const e = edlOr404(req.params.id);
      if (!edls.revision(core.db, e.id, req.params.n)) throw new EditError("edl_not_found", `нет ревизии r${req.params.n} EDL ${e.id}`);
      return { status: 202 as const, job: enqueue(core.db, { type: "roughcut.preview", projectId: e.project_id, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: out.job });
  });

  app.get("/api/edls/:id/revisions/:n/preview.mp4", { schema: { params: RevParams } }, async (req, reply) => {
    const e = edlOr404(req.params.id);
    const rel = artifactPaths(core.root, e.project_id).previewRev(e.id, req.params.n);
    if (!isPublished(core.db, rel)) throw notFound(`превью r${req.params.n} EDL ${e.id}`);
    return sendFile(req, reply, join(core.root, rel, PREVIEW_FILE), { contentType: "video/mp4" });
  });
}
