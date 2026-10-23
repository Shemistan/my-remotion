import { EdlRevisionDocSchema, EditedTimelineSchema, type EditDecision, type EditedTimeline, type EdlRevisionDoc } from "@ms/contracts";
import type { Db } from "../open.js";
import { nowIso } from "./util.js";

export interface EdlRow {
  id: string;
  project_id: string;
  media_id: string;
  transcript_id: string;
  current_revision: number | null;
  created_at: string;
}
export interface EdlRevisionRow {
  edl_id: string;
  revision: number;
  parent_revision: number | null;
  rel_path: string;
  sha256: string;
  /** canonicalHash(документ ревизии) — subject_hash Approval A. */
  hash: string;
  created_at: string;
}
export type DecisionRow = Pick<EditDecision, "reason" | "origin" | "status" | "source_start_us" | "source_end_us" | "confidence"> & {
  decision_id: string;
  start_word_id: string | null;
  end_word_id: string | null;
};

export function create(db: Db, e: { id: string; project_id: string; media_id: string; transcript_id: string }): EdlRow {
  db.prepare("INSERT INTO edls (id, project_id, media_id, transcript_id, current_revision, created_at) VALUES (?, ?, ?, ?, NULL, ?)")
    .run(e.id, e.project_id, e.media_id, e.transcript_id, nowIso());
  return get(db, e.id)!;
}

export function get(db: Db, id: string): EdlRow | undefined {
  return db.prepare("SELECT * FROM edls WHERE id = ?").get(id) as EdlRow | undefined;
}

/** Последний созданный EDL проекта. */
export function byProject(db: Db, projectId: string): EdlRow | undefined {
  return db.prepare("SELECT * FROM edls WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(projectId) as EdlRow | undefined;
}

/** Индекс опубликованной ревизии EDL (в `register`): ревизия, решения, таймлайн, `current_revision`. */
export function insertRevision(db: Db, r: { doc: EdlRevisionDoc; rel_path: string; sha256: string; hash: string; timeline: EditedTimeline }): void {
  const doc = EdlRevisionDocSchema.parse(r.doc);
  const tl = EditedTimelineSchema.parse(r.timeline);
  const id = doc.edl_id;
  db.prepare("INSERT INTO edl_revisions (edl_id, revision, parent_revision, rel_path, sha256, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(id, doc.revision, doc.parent_revision ?? null, r.rel_path, r.sha256, r.hash, nowIso());
  const d = db.prepare(`INSERT INTO edit_decisions (edl_id, revision, decision_id, reason, origin, status, start_word_id, end_word_id,
      source_start_us, source_end_us, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const x of doc.decisions) {
    d.run(id, doc.revision, x.id, x.reason, x.origin, x.status, x.start_word_id ?? null, x.end_word_id ?? null, x.source_start_us, x.source_end_us, x.confidence);
  }
  db.prepare("INSERT INTO timelines (edl_id, revision, fps_num, fps_den, source_duration_us, duration_us) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, doc.revision, tl.fps.num, tl.fps.den, tl.source_duration_us, tl.duration_us);
  const c = db.prepare("INSERT INTO timeline_clips (edl_id, revision, idx, source_start_us, source_end_us, edited_start_us) VALUES (?, ?, ?, ?, ?, ?)");
  for (const x of tl.clips) c.run(id, doc.revision, x.idx, x.source_start_us, x.source_end_us, x.edited_start_us);
  if (db.prepare("UPDATE edls SET current_revision = ? WHERE id = ?").run(doc.revision, id).changes !== 1) throw new Error(`db: EDL нет: ${id}`);
}

export function revision(db: Db, id: string, rev: number): EdlRevisionRow | undefined {
  return db.prepare("SELECT * FROM edl_revisions WHERE edl_id = ? AND revision = ?").get(id, rev) as EdlRevisionRow | undefined;
}

export function decisions(db: Db, id: string, rev: number): DecisionRow[] {
  return db.prepare(`SELECT decision_id, reason, origin, status, start_word_id, end_word_id, source_start_us, source_end_us, confidence
      FROM edit_decisions WHERE edl_id = ? AND revision = ? ORDER BY source_start_us, decision_id`).all(id, rev) as DecisionRow[];
}

export function timeline(db: Db, id: string, rev: number): EditedTimeline | undefined {
  const t = db.prepare("SELECT * FROM timelines WHERE edl_id = ? AND revision = ?").get(id, rev) as
    { fps_num: number; fps_den: number; source_duration_us: number; duration_us: number } | undefined;
  if (!t) return undefined;
  const clips = db.prepare("SELECT idx, source_start_us, source_end_us, edited_start_us FROM timeline_clips WHERE edl_id = ? AND revision = ? ORDER BY idx")
    .all(id, rev) as EditedTimeline["clips"];
  return { fps: { num: t.fps_num, den: t.fps_den }, source_duration_us: t.source_duration_us, duration_us: t.duration_us, clips };
}
