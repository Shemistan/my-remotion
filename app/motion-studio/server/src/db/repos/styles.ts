import { ProjectStyleDocSchema, type ProjectStyleDoc } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import type { Db } from "../open.js";
import { advanceCurrent, nowIso } from "./util.js";

export interface StyleRow {
  id: string;
  project_id: string;
  current_revision: number | null;
  created_at: string;
}
export interface StyleRevisionRow {
  style_id: string;
  revision: number;
  rel_path: string;
  sha256: string;
  /** canonicalHash(документ ревизии) — вход Approval B. */
  hash: string;
  author: "agent" | "user";
  created_at: string;
}

export function create(db: Db, s: { id: string; project_id: string }): StyleRow {
  db.prepare("INSERT INTO style_bibles (id, project_id, current_revision, created_at) VALUES (?, ?, NULL, ?)").run(s.id, s.project_id, nowIso());
  return get(db, s.id)!;
}

export function get(db: Db, id: string): StyleRow | undefined {
  return db.prepare("SELECT * FROM style_bibles WHERE id = ?").get(id) as StyleRow | undefined;
}

/** Последний созданный StyleBible проекта. */
export function byProject(db: Db, projectId: string): StyleRow | undefined {
  return db.prepare("SELECT * FROM style_bibles WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(projectId) as StyleRow | undefined;
}

/**
 * Индекс опубликованной ревизии (в `register`) и `current_revision` (только вперёд).
 * `style_id`, `revision`, `author` — из проверенного документа; `hash` (вход Approval B)
 * считается здесь — `canonicalHash` документа, вызывающий его не передаёт (как edls/plans).
 */
export function insertRevision(db: Db, r: { doc: ProjectStyleDoc; rel_path: string; sha256: string }): void {
  const doc = ProjectStyleDocSchema.parse(r.doc);
  db.prepare("INSERT INTO style_revisions (style_id, revision, rel_path, sha256, hash, author, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(doc.style_id, doc.revision, r.rel_path, r.sha256, canonicalHash(doc), doc.author, nowIso());
  advanceCurrent(db, "style_bibles", doc.style_id, doc.revision, "StyleBible");
}

export function revision(db: Db, id: string, rev: number): StyleRevisionRow | undefined {
  return db.prepare("SELECT * FROM style_revisions WHERE style_id = ? AND revision = ?").get(id, rev) as StyleRevisionRow | undefined;
}
