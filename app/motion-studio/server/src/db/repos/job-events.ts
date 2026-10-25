import type { JobEventDto } from "@ms/contracts";
import type { Db } from "../open.js";
import { nowIso, toJson } from "./util.js";

export interface EventRow { id: number; job_id: string; ts: string; level: JobEventDto["level"]; kind: string; message: string; data_json: string | null }
type Raw = EventRow;

/** Строка `job_events` → событие (данные разобраны). */
export const eventRow = (r: EventRow): JobEventDto => ({
  id: r.id, job_id: r.job_id, ts: r.ts, level: r.level, kind: r.kind, message: r.message,
  ...(r.data_json === null ? {} : { data: JSON.parse(r.data_json) as unknown }),
});

export function insert(db: Db, e: Omit<JobEventDto, "id" | "ts"> & { ts?: string }): JobEventDto {
  const r = db.prepare("INSERT INTO job_events (job_id, ts, level, kind, message, data_json) VALUES (?, ?, ?, ?, ?, ?)")
    .run(e.job_id, e.ts ?? nowIso(), e.level, e.kind, e.message, toJson(e.data));
  return eventRow(db.prepare("SELECT * FROM job_events WHERE id = ?").get(r.lastInsertRowid) as Raw);
}

/** События с `id > sinceId` по возрастанию id (догон SSE). */
export function listSince(db: Db, sinceId: number, opts: { jobId?: string; limit?: number } = {}): JobEventDto[] {
  const limit = opts.limit ?? 1000;
  const rows = opts.jobId
    ? db.prepare("SELECT * FROM job_events WHERE id > ? AND job_id = ? ORDER BY id LIMIT ?").all(sinceId, opts.jobId, limit)
    : db.prepare("SELECT * FROM job_events WHERE id > ? ORDER BY id LIMIT ?").all(sinceId, limit);
  return (rows as Raw[]).map(eventRow);
}

/** Наибольший id события (0 — журнал пуст): начало SSE без `since`. */
export function maxId(db: Db): number {
  return (db.prepare("SELECT coalesce(max(id), 0) FROM job_events").pluck().get() as number);
}
