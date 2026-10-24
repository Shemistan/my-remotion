import type { Db } from "../open.js";
import { nowIso } from "./util.js";

export interface SemanticRow {
  id: string;
  project_id: string;
  transcript_id: string;
  transcript_revision: number;
  edl_id: string;
  edl_revision: number;
  rel_path: string;
  sha256: string;
  created_at: string;
}
export interface ChapterRow {
  chapter_id: string;
  title: string;
  start_word_id: string;
  end_word_id: string;
}

/** Индекс опубликованной смысловой разметки и её глав (в `register`). */
export function insert(db: Db, s: Omit<SemanticRow, "created_at"> & { chapters: ChapterRow[] }): void {
  db.prepare(`INSERT INTO semantic_analyses (id, project_id, transcript_id, transcript_revision, edl_id, edl_revision, rel_path, sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(s.id, s.project_id, s.transcript_id, s.transcript_revision, s.edl_id, s.edl_revision, s.rel_path, s.sha256, nowIso());
  const c = db.prepare("INSERT INTO semantic_chapters (analysis_id, chapter_id, title, start_word_id, end_word_id) VALUES (?, ?, ?, ?, ?)");
  for (const ch of s.chapters) c.run(s.id, ch.chapter_id, ch.title, ch.start_word_id, ch.end_word_id);
}

export function get(db: Db, id: string): SemanticRow | undefined {
  return db.prepare("SELECT * FROM semantic_analyses WHERE id = ?").get(id) as SemanticRow | undefined;
}

/** Последняя разметка проекта. */
export function latest(db: Db, projectId: string): SemanticRow | undefined {
  return db.prepare("SELECT * FROM semantic_analyses WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(projectId) as SemanticRow | undefined;
}

export function chapters(db: Db, analysisId: string): ChapterRow[] {
  return db.prepare("SELECT chapter_id, title, start_word_id, end_word_id FROM semantic_chapters WHERE analysis_id = ? ORDER BY rowid").all(analysisId) as ChapterRow[];
}
