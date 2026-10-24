// Визуальный план (Task 33): запуск `plan.visual` (гейт A, свежая смысловая разметка — с агентом
// только построенная агентом, анализ видеоряда того же исходника; без агента — пока в плане нет
// сцен — иначе 409 без задачи), ревизия плана со свежестью входов,
// предложениями агента и итогом перепроверки, правка сцен (`savePlanRevision`), перепроверка
// (`plan.recheck`, без LLM).
import { AnalyzeBodySchema, CreatedJobDtoSchema, type PlanDto, PlanDtoSchema, type PlanProposal, PlanRevisionBodySchema, type RecheckEntry } from "@ms/contracts";
import { currentPlan, savePlanRevision } from "../../analysis/plan-ops.js";
import { ArtifactStore } from "../../artifacts/store.js";
import type { Db } from "../../db/open.js";
import * as edls from "../../db/repos/edls.js";
import * as footageRepo from "../../db/repos/footage.js";
import * as jobs from "../../db/repos/jobs.js";
import * as plans from "../../db/repos/plans.js";
import * as semanticRepo from "../../db/repos/semantic.js";
import * as styles from "../../db/repos/styles.js";
import * as transcripts from "../../db/repos/transcripts.js";
import { tx } from "../../db/tx.js";
import { EditError } from "../../edit/errors.js";
import { enqueue } from "../../jobs/queue.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";
import { RevisionQuery, checkOps, EDIT_BODY_LIMIT } from "./transcripts.js";
import { requireApprovalA, semanticDoc, semanticFresh } from "./semantic.js";

interface PlanRefs { plan_id?: unknown; revision?: unknown; changed?: unknown; no_change?: unknown }

/**
 * Итоги завершённых задач проекта типа `type`, опубликовавших ревизию плана `planId` (перепроверка
 * без изменений — `no_change` — ревизию не публикует и итог прошлой перепроверки не затирает).
 */
function planJobRefs(db: Db, projectId: string, type: "plan.visual" | "plan.recheck", planId: string): (PlanRefs & { revision: number })[] {
  return jobs.list(db, { projectId })
    .filter((j) => j.type === type && j.status === "completed")
    .map((j) => (j.output_refs ?? {}) as PlanRefs)
    .filter((o): o is PlanRefs & { revision: number } => o.plan_id === planId && typeof o.revision === "number" && o.no_change !== true);
}

/**
 * Предложения агента: поля сцен в последней ревизии, опубликованной `plan.visual` (не позже `upTo`).
 * Сцены пользователя и план без агента — без предложения.
 */
function proposals(db: Db, projectId: string, planId: string, upTo: number): Record<string, PlanProposal> {
  const revs = planJobRefs(db, projectId, "plan.visual", planId).map((o) => o.revision).filter((r) => r <= upTo);
  if (revs.length === 0) return {};
  const out: Record<string, PlanProposal> = {};
  for (const x of plans.scenePlans(db, planId, Math.max(...revs))) {
    out[x.item_id] = { visual_type: x.visual_type, composition_mode: x.composition_mode, zone: x.zone, start_word_id: x.start_word_id, end_word_id: x.end_word_id };
  }
  return out;
}

/** Ревизия плана для UI: свежесть входов по текущим EDL, транскрипту и стилю проекта; порог лица — из конфига. */
export function planDto(db: Db, root: string, faceOverlapMax: number, id: string, revision?: number): PlanDto {
  const p = plans.get(db, id);
  if (!p || p.current_revision === null) throw new EditError("plan_not_found", `нет плана ${id}`);
  const doc = currentPlan(db, root, id, revision);
  const e = edls.byProject(db, p.project_id);
  const eRev = e?.current_revision == null ? undefined : edls.revision(db, e.id, e.current_revision);
  const trRev = e ? transcripts.get(db, e.transcript_id)?.current_revision ?? null : null;
  const st = styles.byProject(db, p.project_id);
  const stRev = st?.current_revision == null ? undefined : styles.revision(db, st.id, st.current_revision);
  const { edl, transcript, style } = doc.inputs;
  let recheck: { changed: RecheckEntry[] } | null = null;
  if (doc.revision === p.current_revision) {
    const last = planJobRefs(db, p.project_id, "plan.recheck", id).filter((o) => o.revision === doc.revision && Array.isArray(o.changed)).at(-1);
    if (last) recheck = { changed: last.changed as RecheckEntry[] };
  }
  return {
    id,
    current_revision: p.current_revision,
    doc,
    inputs_fresh: {
      edl: !!eRev && e!.id === edl.id && eRev.revision === edl.revision && eRev.hash === edl.hash,
      transcript: !!e && e.transcript_id === transcript.id && trRev === transcript.revision,
      style: !!stRev && stRev.style_id === style.id && stRev.revision === style.revision && stRev.hash === style.hash,
    },
    proposals: proposals(db, p.project_id, id, doc.revision),
    recheck,
    face_overlap_max: faceOverlapMax,
  };
}

export function planRoutes(app: ZApp, { core }: ApiContext): void {
  app.post("/api/projects/:id/plan/generate", {
    schema: { params: IdParams, body: AnalyzeBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const projectId = req.params.id;
    const input = { projectId, ...(req.body.useAgent === undefined ? {} : { useAgent: req.body.useAgent }) };
    const out = tx(core.db, () => {
      const prev = replay(core.db, key, "plan.visual", () => input);
      if (prev) return { status: 200 as const, job: prev };
      requireApprovalA(core.db, projectId, "визуальный план");
      const sem = semanticRepo.latest(core.db, projectId);
      if (!sem) throw new ApiError(409, "semantic_missing", "сначала запустите смысловой анализ");
      if (!semanticFresh(core.db, sem)) throw new ApiError(409, "semantic_missing", "смысловая разметка построена по прежнему монтажу — запустите смысловой анализ заново");
      const ftg = footageRepo.latest(core.db, projectId);
      const edl = edls.byProject(core.db, projectId)!;
      if (!ftg || ftg.media_id !== edl.media_id) throw new ApiError(409, "footage_missing", "сначала проанализируйте видеоряд");
      // ревью Task 33 I1: разметка без агента пуста — агенту планировать не по чему; план без агента
      // не стирает сцены готового плана
      if (req.body.useAgent !== false && semanticDoc(core.root, sem).agent === "skipped") {
        throw new ApiError(409, "semantic_missing", "смысловая разметка построена без агента — запустите смысловой анализ с агентом");
      }
      const plan = plans.byProject(core.db, projectId);
      if (req.body.useAgent === false && plan?.current_revision != null && plans.scenePlans(core.db, plan.id, plan.current_revision).length > 0) {
        throw new ApiError(409, "plan_exists", "в плане уже есть сцены — план без агента их бы стёр; правьте сцены или постройте план с агентом");
      }
      return { status: 202 as const, job: enqueue(core.db, { type: "plan.visual", projectId, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });

  app.get("/api/plans/:id", {
    schema: { params: IdParams, querystring: RevisionQuery, response: { 200: PlanDtoSchema } },
  }, async (req) => planDto(core.db, core.root, core.config.planning.faceOverlapMax, req.params.id, req.query.revision));

  app.post("/api/plans/:id/revisions", {
    bodyLimit: EDIT_BODY_LIMIT,
    preValidation: async (req) => {
      const ops = (req.body as { ops?: unknown } | null)?.ops;
      if (Array.isArray(ops)) checkOps(ops);
    },
    schema: { params: IdParams, body: PlanRevisionBodySchema, response: { 201: PlanDtoSchema } },
  }, async (req, reply) => {
    const store = new ArtifactStore({ root: core.root, db: core.db, guard: core.storageCheck });
    const doc = await savePlanRevision({ db: core.db, store, root: core.root, planning: core.config.planning }, req.params.id, req.body);
    return reply.status(201).send(planDto(core.db, core.root, core.config.planning.faceOverlapMax, req.params.id, doc.revision));
  });

  app.post("/api/plans/:id/recheck", {
    schema: { params: IdParams, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const out = tx(core.db, () => {
      const p = plans.get(core.db, req.params.id);
      const input = (projectId: string) => ({ projectId });
      const prev = replay(core.db, key, "plan.recheck", (j) => input(j.project_id));
      if (prev) return { status: 200 as const, job: prev };
      if (!p || p.current_revision === null) throw notFound(`план ${req.params.id}`);
      return { status: 202 as const, job: enqueue(core.db, { type: "plan.recheck", projectId: p.project_id, input: input(p.project_id), idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });
}
