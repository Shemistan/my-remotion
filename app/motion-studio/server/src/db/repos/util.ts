import type { Db } from "../open.js";

/** Время в формате столбцов БД: ISO 8601 UTC с миллисекундами. */
export const nowIso = (): string => new Date().toISOString();

/**
 * `current_revision` только растёт: ревизия, опубликованная позже меньшего номера (гонка
 * публикаций, восстановление), указатель назад не откатывает. Нет строки — ошибка.
 */
export function advanceCurrent(db: Db, table: "transcripts" | "edls" | "visual_plans" | "style_bibles" | "scripts" | "video_timelines", id: string, revision: number, what: string): void {
  if (db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id) === undefined) throw new Error(`db: ${what} нет: ${id}`);
  db.prepare(`UPDATE ${table} SET current_revision = ? WHERE id = ? AND (current_revision IS NULL OR current_revision < ?)`).run(revision, id, revision);
}

export const toJson = (v: unknown): string | null => (v === undefined || v === null ? null : JSON.stringify(v));
export const fromJson = <T>(s: string | null): T | null => (s === null ? null : (JSON.parse(s) as T));
