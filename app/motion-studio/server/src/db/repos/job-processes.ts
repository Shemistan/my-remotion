import type { Db } from "../open.js";
import { nowIso } from "./util.js";

/** Строка `job_processes` (ADR 0007): `started_at` — время старта процесса из `ps`. */
export interface JobProcessRow {
  job_id: string;
  attempt: number;
  pid: number;
  pgid: number;
  started_at: string;
  cmd: string;
  ended_at: string | null;
  exit_code: number | null;
}
type Key = Pick<JobProcessRow, "job_id" | "attempt" | "pid">;

export function insert(db: Db, p: Omit<JobProcessRow, "ended_at" | "exit_code">): void {
  db.prepare("INSERT INTO job_processes (job_id, attempt, pid, pgid, started_at, cmd) VALUES (?, ?, ?, ?, ?, ?)")
    .run(p.job_id, p.attempt, p.pid, p.pgid, p.started_at, p.cmd);
}

/** Процесс подтверждённо завершён. Повтор для уже завершённого — не ошибка. */
export function end(db: Db, key: Key, r: { exit_code?: number | null; ended_at?: string } = {}): void {
  db.prepare("UPDATE job_processes SET ended_at = ?, exit_code = ? WHERE job_id = ? AND attempt = ? AND pid = ? AND ended_at IS NULL")
    .run(r.ended_at ?? nowIso(), r.exit_code ?? null, key.job_id, key.attempt, key.pid);
}

/** Процессы без подтверждённого завершения. */
export function listLive(db: Db, filter: { jobId?: string; attempt?: number } = {}): JobProcessRow[] {
  const where = ["ended_at IS NULL"];
  const args: (string | number)[] = [];
  if (filter.jobId !== undefined) { where.push("job_id = ?"); args.push(filter.jobId); }
  if (filter.attempt !== undefined) { where.push("attempt = ?"); args.push(filter.attempt); }
  return db.prepare(`SELECT * FROM job_processes WHERE ${where.join(" AND ")} ORDER BY job_id, attempt, pid`).all(...args) as JobProcessRow[];
}
