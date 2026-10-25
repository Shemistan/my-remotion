import { VisualPlanRevisionDocSchema, type ScenePlanItem, type VisualPlanRevisionDoc } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import type { Db } from "../open.js";
import { advanceCurrent, nowIso } from "./util.js";

export interface PlanRow {
  id: string;
  project_id: string;
  current_revision: number | null;
  created_at: string;
}
export interface PlanRevisionRow {
  plan_id: string;
  revision: number;
  parent_revision: number | null;
  rel_path: string;
  sha256: string;
  /** canonicalHash(документ ревизии) — subject_hash Approval B. */
  hash: string;
  created_at: string;
}
export interface OpportunityRow {
  opp_id: string;
  decision: "plan" | "skip";
  anchor_ids: string[];
  skip_reason: string | null;
}
export type ScenePlanRow = Pick<ScenePlanItem, "status" | "composition_mode" | "zone" | "start_word_id" | "end_word_id" | "visual_type"> & {
  item_id: string;
  edited_start_us: number;
  edited_end_us: number;
};

export function create(db: Db, p: { id: string; project_id: string }): PlanRow {
  db.prepare("INSERT INTO visual_plans (id, project_id, current_revision, created_at) VALUES (?, ?, NULL, ?)").run(p.id, p.project_id, nowIso());
  return get(db, p.id)!;
}

export function get(db: Db, id: string): PlanRow | undefined {
  return db.prepare("SELECT * FROM visual_plans WHERE id = ?").get(id) as PlanRow | undefined;
}

/** Последний созданный план проекта. */
export function byProject(db: Db, projectId: string): PlanRow | undefined {
  return db.prepare("SELECT * FROM visual_plans WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(projectId) as PlanRow | undefined;
}

/**
 * Индекс опубликованной ревизии плана (в `register`): ревизия, сцены, возможности,
 * `current_revision` (только вперёд). Документ (и сцены в нём) проверяется схемой; `hash`
 * (субъект Approval B) — `canonicalHash` проверенного документа, считается здесь.
 */
export function insertRevision(db: Db, r: { doc: VisualPlanRevisionDoc; rel_path: string; sha256: string; opportunities: OpportunityRow[] }): void {
  const doc = VisualPlanRevisionDocSchema.parse(r.doc);
  const id = doc.plan_id;
  db.prepare("INSERT INTO visual_plan_revisions (plan_id, revision, parent_revision, rel_path, sha256, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, doc.revision, doc.parent_revision ?? null, r.rel_path, r.sha256, canonicalHash(doc), nowIso());
  const s = db.prepare(`INSERT INTO scene_plans (plan_id, revision, item_id, status, composition_mode, zone, edited_start_us, edited_end_us,
      start_word_id, end_word_id, visual_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const i of doc.items) {
    s.run(id, doc.revision, i.id, i.status, i.composition_mode, i.zone, i.edited.start_us, i.edited.end_us, i.start_word_id, i.end_word_id, i.visual_type);
  }
  const o = db.prepare("INSERT INTO visual_opportunities (plan_id, revision, opp_id, decision, anchor_ids_json, skip_reason) VALUES (?, ?, ?, ?, ?, ?)");
  for (const x of r.opportunities) o.run(id, doc.revision, x.opp_id, x.decision, JSON.stringify(x.anchor_ids), x.skip_reason);
  advanceCurrent(db, "visual_plans", id, doc.revision, "плана");
}

export function revision(db: Db, id: string, rev: number): PlanRevisionRow | undefined {
  return db.prepare("SELECT * FROM visual_plan_revisions WHERE plan_id = ? AND revision = ?").get(id, rev) as PlanRevisionRow | undefined;
}

export function scenePlans(db: Db, id: string, rev: number): ScenePlanRow[] {
  return db.prepare(`SELECT item_id, status, composition_mode, zone, edited_start_us, edited_end_us, start_word_id, end_word_id, visual_type
      FROM scene_plans WHERE plan_id = ? AND revision = ? ORDER BY edited_start_us, item_id`).all(id, rev) as ScenePlanRow[];
}

export function opportunities(db: Db, id: string, rev: number): OpportunityRow[] {
  const rows = db.prepare("SELECT opp_id, decision, anchor_ids_json, skip_reason FROM visual_opportunities WHERE plan_id = ? AND revision = ? ORDER BY opp_id")
    .all(id, rev) as { opp_id: string; decision: "plan" | "skip"; anchor_ids_json: string; skip_reason: string | null }[];
  return rows.map(({ anchor_ids_json, ...x }) => ({ ...x, anchor_ids: JSON.parse(anchor_ids_json) as string[] }));
}
