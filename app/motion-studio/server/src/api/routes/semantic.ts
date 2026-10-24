// Смысловой анализ (Task 33): запуск `semantic.analyze` — только при валидном Approval A (V3),
// иначе 409 `approval_required` без задачи; документ разметки. Свежесть разметки (построена по
// текущим ревизиям EDL и транскрипта) — `semanticFresh`, её же проверяет `plan/generate`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AnalyzeBodySchema, CreatedJobDtoSchema, SemanticDtoSchema, type SemanticTimeline, SemanticTimelineSchema } from "@ms/contracts";
import type { Db } from "../../db/open.js";
import * as edls from "../../db/repos/edls.js";
import * as projects from "../../db/repos/projects.js";
import * as semanticRepo from "../../db/repos/semantic.js";
import * as transcripts from "../../db/repos/transcripts.js";
import { tx } from "../../db/tx.js";
import { roughCutApprovalValid } from "../../edit/approval-a.js";
import { enqueue } from "../../jobs/queue.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";

/** Разметка построена по текущим ревизиям EDL и транскрипта проекта (как требует `plan.visual`). */
export function semanticFresh(db: Db, row: semanticRepo.SemanticRow): boolean {
  const e = edls.byProject(db, row.project_id);
  if (!e || e.current_revision === null) return false;
  const tr = transcripts.get(db, e.transcript_id)?.current_revision ?? null;
  return row.edl_id === e.id && row.edl_revision === e.current_revision && row.transcript_id === e.transcript_id && row.transcript_revision === tr;
}

/** Документ смысловой разметки из хранилища, проверенный схемой. */
export function semanticDoc(root: string, row: semanticRepo.SemanticRow): SemanticTimeline {
  return SemanticTimelineSchema.parse(JSON.parse(readFileSync(join(root, row.rel_path), "utf8")));
}

/** Видеопроект есть и Approval A валиден — иначе 404 / 409. */
export function requireApprovalA(db: Db, projectId: string, what: string): void {
  const p = projects.get(db, projectId);
  if (!p) throw notFound(`проект ${projectId}`);
  if (p.kind !== "video") throw new ApiError(409, "not_video_project", `${what} — только в видеопроекте`);
  if (!roughCutApprovalValid(db, projectId)) throw new ApiError(409, "approval_required", `${what}: сначала утвердите черновой монтаж (A)`);
}

export function semanticRoutes(app: ZApp, { core }: ApiContext): void {
  app.post("/api/projects/:id/semantic/analyze", {
    schema: { params: IdParams, body: AnalyzeBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const projectId = req.params.id;
    const input = { projectId, ...(req.body.useAgent === undefined ? {} : { useAgent: req.body.useAgent }) };
    const out = tx(core.db, () => {
      const prev = replay(core.db, key, "semantic.analyze", () => input);
      if (prev) return { status: 200 as const, job: prev };
      requireApprovalA(core.db, projectId, "смысловой анализ");
      return { status: 202 as const, job: enqueue(core.db, { type: "semantic.analyze", projectId, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });

  app.get("/api/semantic/:id", { schema: { params: IdParams, response: { 200: SemanticDtoSchema } } }, async (req) => {
    const row = semanticRepo.get(core.db, req.params.id);
    if (!row) throw notFound(`смысловая разметка ${req.params.id}`);
    return { semantic: semanticDoc(core.root, row) };
  });
}
