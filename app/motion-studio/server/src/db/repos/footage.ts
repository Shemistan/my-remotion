import type { FootageAnalysis } from "@ms/contracts";
import type { Db } from "../open.js";
import { nowIso } from "./util.js";

export interface FootageRow {
  id: string;
  project_id: string;
  media_id: string;
  mode: FootageAnalysis["mode"];
  rel_path: string;
  sha256: string;
  created_at: string;
}

/** Индекс опубликованного анализа видеоряда (в `register`). */
export function insert(db: Db, f: Omit<FootageRow, "created_at">): void {
  db.prepare("INSERT INTO footage_analyses (id, project_id, media_id, mode, rel_path, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(f.id, f.project_id, f.media_id, f.mode, f.rel_path, f.sha256, nowIso());
}

export function get(db: Db, id: string): FootageRow | undefined {
  return db.prepare("SELECT * FROM footage_analyses WHERE id = ?").get(id) as FootageRow | undefined;
}

/** Последний анализ проекта. */
export function latest(db: Db, projectId: string): FootageRow | undefined {
  return db.prepare("SELECT * FROM footage_analyses WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(projectId) as FootageRow | undefined;
}
