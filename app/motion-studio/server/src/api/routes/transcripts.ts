// Транскрипт (Task 29): ревизия (текущая или `?revision=`), список ревизий, правка текста —
// новая ревизия от `base_revision` (`saveTranscriptRevision`, Task 27). Тело правки ≤ 1 МБ и
// ≤ 1000 операций — до разбора и выравнивания (ревью Task 27, M5).
import {
  RevisionEntrySchema,
  type TranscriptDto,
  TranscriptDtoSchema,
  TranscriptRevisionBodySchema,
} from "@ms/contracts";
import { z } from "zod";
import { ArtifactStore } from "../../artifacts/store.js";
import * as transcripts from "../../db/repos/transcripts.js";
import { EditError } from "../../edit/errors.js";
import { currentTranscript, saveTranscriptRevision } from "../../edit/transcript-ops.js";
import { type ApiContext, IdParams, type ZApp } from "../context.js";
import { ApiError } from "../errors.js";

/** Лимиты синхронной правки (ревью Task 27, M5): тело и число операций. */
export const EDIT_BODY_LIMIT = 1024 * 1024;
export const EDIT_MAX_OPS = 1000;

/** `?revision=N` (целое ≥ 1). */
export const RevisionQuery = z.object({ revision: z.coerce.number().int().positive().optional() }).strict();

/** Операций больше лимита — 422 до применения. */
export function checkOps(ops: unknown[]): void {
  if (ops.length > EDIT_MAX_OPS) throw new ApiError(422, "too_many_ops", `в одной правке не больше ${EDIT_MAX_OPS} операций (прислано ${ops.length}) — правьте частями`);
}

export function transcriptRoutes(app: ZApp, { core }: ApiContext): void {
  const store = () => new ArtifactStore({ root: core.root, db: core.db, guard: core.storageCheck });
  const dto = (id: string, revision?: number): TranscriptDto => {
    const t = transcripts.get(core.db, id);
    if (!t || t.current_revision === null) throw new EditError("transcript_not_found", `нет транскрипта ${id}`);
    return { id, current_revision: t.current_revision, doc: currentTranscript(core.db, core.root, id, revision) };
  };

  app.get("/api/transcripts/:id", {
    schema: { params: IdParams, querystring: RevisionQuery, response: { 200: TranscriptDtoSchema } },
  }, async (req) => dto(req.params.id, req.query.revision));

  app.get("/api/transcripts/:id/revisions", {
    schema: { params: IdParams, response: { 200: z.array(RevisionEntrySchema) } },
  }, async (req) => {
    if (!transcripts.get(core.db, req.params.id)) throw new EditError("transcript_not_found", `нет транскрипта ${req.params.id}`);
    return transcripts.revisions(core.db, req.params.id).map((r) => ({
      revision: r.revision, parent_revision: r.parent_revision, author: r.author, created_at: r.created_at,
    }));
  });

  app.post("/api/transcripts/:id/revisions", {
    bodyLimit: EDIT_BODY_LIMIT,
    // лимит операций — до проверки схемы каждой операции (`preValidation` видит разобранное тело)
    preValidation: async (req) => {
      const ops = (req.body as { ops?: unknown } | null)?.ops;
      if (Array.isArray(ops)) checkOps(ops);
    },
    schema: { params: IdParams, body: TranscriptRevisionBodySchema, response: { 201: TranscriptDtoSchema } },
  }, async (req, reply) => {
    const doc = await saveTranscriptRevision({ db: core.db, store: store(), root: core.root }, req.params.id, req.body);
    return reply.status(201).send({ id: req.params.id, current_revision: doc.revision, doc });
  });
}
