// Отчёты старта сервера (Task 47): был ли сбой, что восстановлено; `acknowledged_at` — человек видел.
import type { Db } from "../open.js";

export interface BootReportRow<R = unknown> {
  id: string;
  created_at: string;
  crashed: boolean;
  report: R;
  acknowledged_at: string | null;
}

interface Raw { id: string; created_at: string; crashed: number; report_json: string; acknowledged_at: string | null }

const row = <R>(r: Raw): BootReportRow<R> => ({
  id: r.id, created_at: r.created_at, crashed: r.crashed === 1, report: JSON.parse(r.report_json) as R, acknowledged_at: r.acknowledged_at,
});

export function insert(db: Db, r: { id: string; created_at: string; crashed: boolean; report: unknown }): void {
  db.prepare("INSERT INTO boot_reports (id, created_at, crashed, report_json) VALUES (?, ?, ?, ?)")
    .run(r.id, r.created_at, r.crashed ? 1 : 0, JSON.stringify(r.report));
}

export function get<R = unknown>(db: Db, id: string): BootReportRow<R> | undefined {
  const r = db.prepare("SELECT * FROM boot_reports WHERE id = ?").get(id) as Raw | undefined;
  return r && row<R>(r);
}

/** Последний отчёт (по порядку вставки: часы могут идти назад). */
export function latest<R = unknown>(db: Db): BootReportRow<R> | undefined {
  const r = db.prepare("SELECT * FROM boot_reports ORDER BY rowid DESC LIMIT 1").get() as Raw | undefined;
  return r && row<R>(r);
}

export function count(db: Db): number {
  return db.prepare("SELECT count(*) FROM boot_reports").pluck().get() as number;
}

export function acknowledge(db: Db, id: string, at: string): void {
  db.prepare("UPDATE boot_reports SET acknowledged_at = ? WHERE id = ? AND acknowledged_at IS NULL").run(at, id);
}

/** Оставляет `keep` последних отчётов. */
export function prune(db: Db, keep: number): void {
  db.prepare("DELETE FROM boot_reports WHERE rowid NOT IN (SELECT rowid FROM boot_reports ORDER BY rowid DESC LIMIT ?)").run(keep);
}
