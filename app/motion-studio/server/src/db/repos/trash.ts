// Корзина (Task 47, F14): что перенесено при удалении проекта; `purged_at` — каталог стёрт
// задачей `trash.purge`. Восстановление удаляет строку (каталог вернулся в проект).
import type { Db } from "../open.js";

export interface TrashRow {
  id: string;
  project_id: string;
  /** Каталог в корзине относительно корня хранилища: `workspace/trash/<project>-<ts>`. */
  rel_path: string;
  bytes: number;
  created_at: string;
  purged_at: string | null;
}

export function insert(db: Db, row: Omit<TrashRow, "purged_at">): TrashRow {
  db.prepare("INSERT INTO trash (id, project_id, rel_path, bytes, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(row.id, row.project_id, row.rel_path, row.bytes, row.created_at);
  return get(db, row.id)!;
}

export function get(db: Db, id: string): TrashRow | undefined {
  return db.prepare("SELECT * FROM trash WHERE id = ?").get(id) as TrashRow | undefined;
}

/** Не очищенные строки корзины, новые первыми. */
export function listActive(db: Db): TrashRow[] {
  return db.prepare("SELECT * FROM trash WHERE purged_at IS NULL ORDER BY created_at DESC, rowid DESC").all() as TrashRow[];
}

/** Не очищенная строка корзины проекта (у удалённого проекта — одна). */
export function activeByProject(db: Db, projectId: string): TrashRow | undefined {
  return db.prepare("SELECT * FROM trash WHERE project_id = ? AND purged_at IS NULL ORDER BY created_at DESC, rowid DESC").get(projectId) as TrashRow | undefined;
}

export function hasRelPath(db: Db, relPath: string): boolean {
  return db.prepare("SELECT 1 FROM trash WHERE rel_path = ?").get(relPath) !== undefined;
}

export function markPurged(db: Db, id: string, at: string): void {
  db.prepare("UPDATE trash SET purged_at = ? WHERE id = ? AND purged_at IS NULL").run(at, id);
}

export function remove(db: Db, id: string): void {
  db.prepare("DELETE FROM trash WHERE id = ?").run(id);
}
