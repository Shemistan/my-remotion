// Правка визуального плана пользователем (Task 32): операции `PlanOp` → новая ревизия плана.
// Статусы, правка полей и слов сцены (время, прямоугольник, лицо пересчитывает `placeScene`),
// сцена пользователя (`add`). После операций — `planChecks`. Ревизии — `plan/<id>/r<N>/plan.json`,
// замок `project:<p>:plan`, 409 `revision_conflict` / `resource_busy`, холостая правка — `no_change`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FootageAnalysisSchema, type FootageAnalysis, type PlanOp, type ScenePlanItem, type VisualPlanRevisionDoc, VisualPlanRevisionDocSchema,
  mapWords,
} from "@ms/contracts";
import { canonicalJson } from "@ms/contracts/canonical";
import { approvalState } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import { artifactPaths } from "../artifacts/paths.js";
import type { Db } from "../db/open.js";
import * as footageRepo from "../db/repos/footage.js";
import * as plans from "../db/repos/plans.js";
import { EditError, RevisionConflictError } from "../edit/errors.js";
import { timelineFor } from "../edit/timeline-store.js";
import { type EditDeps, currentTranscript } from "../edit/transcript-ops.js";
import { projectLockKey } from "../jobs/locks.js";
import { type PlaceContext, type PlanningConfig, type SceneWords, itemId, placeScene } from "./plan-build.js";
import { planChecks } from "./plan-checks.js";

export const PLAN_FILE = "plan.json";

const sceneWords = (x: ScenePlanItem): SceneWords => ({
  start_word_id: x.start_word_id, end_word_id: x.end_word_id, zone: x.zone,
  key_terms: x.key_terms.map((k) => ({ text: k.text, word_id: k.word_id })),
  evidence: x.evidence.map((e) => ({ quote: e.quote, start_word_id: e.start_word_id, end_word_id: e.end_word_id })),
  ...(x.face_overlap.override_reason !== undefined ? { override_reason: x.face_overlap.override_reason } : {}),
});

function place(s: SceneWords, c: PlaceContext, what: string) {
  const p = placeScene(s, c);
  if (!p.ok) throw new EditError(p.code, `${what}: ${p.message}`);
  return p.value;
}

/** Без `status`/`stale_reason`: смена слов делает stale-сцену снова `proposed`. */
function withoutStale(x: ScenePlanItem): ScenePlanItem {
  const rest = { ...x };
  delete rest.stale_reason;
  return rest;
}

const nextNumber = (items: ScenePlanItem[]): number => items.reduce((m, x) => Math.max(m, Number(x.id.slice(3))), 0) + 1;

/**
 * Операции над документом ревизии → следующая ревизия (`revision + 1`, `parent_revision`, `ops`).
 * `set_status accepted` у `stale(anchor_cut)` — `item_stale` (якорь вырезан: сначала поправить слова);
 * `stale(timing_changed)` принимается как есть. `modify` пересчитывает размещение; успешная правка
 * stale-сцены возвращает её в `proposed`. `add` — сцена пользователя `accepted`, цитата — услышанные
 * слова диапазона. Сцены не изменились — `no_change`; пустой список — `empty_ops`.
 */
export function applyPlanOps(doc: VisualPlanRevisionDoc, ops: PlanOp[], ctx: PlaceContext): VisualPlanRevisionDoc {
  if (ops.length === 0) throw new EditError("empty_ops", "нет операций правки плана");
  const c: PlaceContext = { ...ctx, wordMap: ctx.wordMap ?? mapWords(ctx.tl, ctx.words) };
  const items = doc.items.map((x) => structuredClone(x));
  const find = (id: string): number => {
    const i = items.findIndex((x) => x.id === id);
    if (i < 0) throw new EditError("unknown_item", `в плане нет сцены ${id}`);
    return i;
  };
  for (const op of ops) {
    if (op.op === "set_status") {
      const i = find(op.item_id);
      const x = items[i]!;
      if (op.status === "accepted" && x.status === "stale" && x.stale_reason === "anchor_cut") {
        throw new EditError("item_stale", `сцена ${x.id} опирается на вырезанные слова — поправьте слова сцены или отклоните её`);
      }
      items[i] = { ...withoutStale(x), status: op.status };
    } else if (op.op === "modify") {
      const i = find(op.item_id);
      const x = items[i]!;
      const { override_reason, key_terms, ...fields } = op.patch;
      const s: SceneWords = {
        ...sceneWords(x), ...(fields.start_word_id ? { start_word_id: fields.start_word_id } : {}),
        ...(fields.end_word_id ? { end_word_id: fields.end_word_id } : {}), ...(fields.zone ? { zone: fields.zone } : {}),
        ...(key_terms ? { key_terms } : {}), ...(override_reason !== undefined ? { override_reason } : {}),
      };
      const placed = place(s, c, `сцена ${x.id}`);
      const base = x.status === "stale" ? { ...withoutStale(x), status: "proposed" as const } : x;
      items[i] = { ...base, ...fields, ...placed };
    } else {
      const quoteWords = wordsBetween(c, op.start_word_id, op.end_word_id);
      const s: SceneWords = {
        start_word_id: op.start_word_id, end_word_id: op.end_word_id, zone: op.zone, key_terms: [],
        evidence: [{ quote: quoteWords || "—", start_word_id: op.start_word_id, end_word_id: op.end_word_id }],
      };
      const placed = place(s, c, "новая сцена");
      const styleId = items[0]?.style_id ?? doc.inputs.style.id;
      items.push({
        id: itemId(nextNumber(items)), status: "accepted", origin: "user", anchor_ids: [], start_word_id: op.start_word_id, end_word_id: op.end_word_id,
        ...placed, purpose: op.purpose, visual_type: op.visual_type, composition_mode: op.composition_mode, zone: op.zone,
        metaphor: "", complexity: 1, usefulness: 3, effort: 3, visual_load: 3, style_id: styleId,
      });
    }
  }
  if (canonicalJson(items) === canonicalJson(doc.items)) throw new EditError("no_change", "правка не меняет сцены плана — новая ревизия не создаётся");
  return {
    ...doc, revision: doc.revision + 1, parent_revision: doc.revision, items,
    issues: planChecks(items, { editedDurationUs: c.tl.duration_us, cfg: c.cfg, footage: c.footage }), ops,
  };
}

/** Услышанные слова диапазона одной строкой (цитата сцены пользователя); проверку диапазона делает `placeScene`. */
function wordsBetween(c: PlaceContext, startId: string, endId: string): string {
  const si = c.words.findIndex((w) => w.id === startId);
  const ei = c.words.findIndex((w) => w.id === endId);
  if (si < 0 || ei < si) return "";
  return c.words.slice(si, ei + 1).filter((w) => {
    const m = c.wordMap?.[w.id];
    return m !== undefined && m.state !== "removed";
  }).map((w) => w.text).join(" ");
}

/** Документ ревизии плана (по умолчанию текущей) из хранилища, проверенный схемой. */
export function currentPlan(db: Db, root: string, planId: string, revision?: number): VisualPlanRevisionDoc {
  const p = plans.get(db, planId);
  const rev = revision ?? p?.current_revision ?? undefined;
  const row = p && rev !== undefined ? plans.revision(db, planId, rev) : undefined;
  if (!row) throw new EditError("plan_not_found", `нет плана ${planId}${revision === undefined ? "" : ` r${revision}`}`);
  return VisualPlanRevisionDocSchema.parse(JSON.parse(readFileSync(join(root, row.rel_path), "utf8")));
}

/** Анализ видеоряда по id (вход плана). */
export function readFootage(db: Db, root: string, footageId: string): FootageAnalysis {
  const row = footageRepo.get(db, footageId);
  if (!row) throw new EditError("plan_not_found", `нет анализа видеоряда ${footageId}`);
  return FootageAnalysisSchema.parse(JSON.parse(readFileSync(join(root, row.rel_path), "utf8")));
}

/** Контекст размещения сцен по входам ревизии плана: слова её транскрипта, таймлайн её EDL, её видеоряд. */
export function planContext(db: Db, root: string, doc: VisualPlanRevisionDoc, cfg: PlanningConfig): PlaceContext {
  const tr = currentTranscript(db, root, doc.inputs.transcript.id, doc.inputs.transcript.revision);
  return {
    words: tr.words, segments: tr.segments, tl: timelineFor(db, doc.inputs.edl.id, doc.inputs.edl.revision),
    footage: readFootage(db, root, doc.inputs.footage_id), cfg,
  };
}

/**
 * Публикация ревизии плана в транзакции: файл, индекс (`plans.insertRevision`, возможности — как у
 * базы), затем `approvalState(…, "B", currentSubject)` — валидный B на прежней ревизии → `stale`.
 */
export async function publishPlanRevision(
  deps: EditDeps, projectId: string, doc: VisualPlanRevisionDoc, o: { check?: (db: Db) => Error | undefined; opportunitiesFrom?: number } = {},
): Promise<void> {
  const destRel = artifactPaths(deps.root, projectId).planRev(doc.plan_id, doc.revision);
  await deps.store.writeRevision(destRel, PLAN_FILE, doc, (d, files) => {
    const opportunities = o.opportunitiesFrom === undefined ? [] : plans.opportunities(d, doc.plan_id, o.opportunitiesFrom);
    plans.insertRevision(d, { doc, rel_path: `${destRel}/${PLAN_FILE}`, sha256: files[0]!.sha256, opportunities });
    approvalState(d, projectId, "B", currentSubject(d, projectId, "B"));
  }, { lockKey: projectLockKey(projectId, "plan"), ...(o.check ? { check: o.check } : {}) });
}

/** Синхронная правка плана пользователем: новая ревизия от `base_revision`. */
export async function savePlanRevision(
  deps: EditDeps & { planning: PlanningConfig }, planId: string, body: { base_revision: number; ops: PlanOp[] },
): Promise<VisualPlanRevisionDoc> {
  const { db } = deps;
  const p = plans.get(db, planId);
  if (!p || p.current_revision === null) throw new EditError("plan_not_found", `нет плана ${planId}`);
  const conflict = (d: Db): RevisionConflictError | undefined => {
    const cur = plans.get(d, planId)!.current_revision;
    return cur === body.base_revision ? undefined : new RevisionConflictError(`план ${planId}`, body.base_revision, cur);
  };
  const early = conflict(db);
  if (early) throw early;
  const base = currentPlan(db, deps.root, planId, body.base_revision);
  const doc = VisualPlanRevisionDocSchema.parse(applyPlanOps(base, body.ops, planContext(db, deps.root, base, deps.planning)));
  await publishPlanRevision(deps, p.project_id, doc, { check: conflict, opportunitiesFrom: base.revision });
  return doc;
}
