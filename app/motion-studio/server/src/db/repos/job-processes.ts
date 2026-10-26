import type { Db } from "../open.js";
import { nowIso } from "./util.js";

/**
 * Строка `job_processes` (ADR 0007): `started_at` — время старта процесса из `ps`. S20: `owner_*` —
 * владелец (сервер/CLI под owner-lock), записавший процесс; `foreign_owner` — pid живого чужого
 * владельца/родителя, если разбор признал процесс чужим (не тронут, `ended_at` пуст).
 */
export interface JobProcessRow {
  job_id: string;
  attempt: number;
  pid: number;
  pgid: number;
  started_at: string;
  cmd: string;
  ended_at: string | null;
  exit_code: number | null;
  owner_pid: number | null;
  owner_started_at: string | null;
  owner_nonce: string | null;
  foreign_owner: number | null;
}
type Key = Pick<JobProcessRow, "job_id" | "attempt" | "pid">;
type NewRow = Omit<JobProcessRow, "ended_at" | "exit_code" | "owner_pid" | "owner_started_at" | "owner_nonce" | "foreign_owner"> &
  Partial<Pick<JobProcessRow, "owner_pid" | "owner_started_at" | "owner_nonce">>;

const INSERT = "INTO job_processes (job_id, attempt, pid, pgid, started_at, cmd, owner_pid, owner_started_at, owner_nonce) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

/** Запись процесса; `ignoreExisting` — досинхронизация после `storage_offline` (повтор — не ошибка). */
export function insert(db: Db, p: NewRow, opts: { ignoreExisting?: boolean } = {}): void {
  db.prepare(`INSERT ${opts.ignoreExisting ? "OR IGNORE " : ""}${INSERT}`)
    .run(p.job_id, p.attempt, p.pid, p.pgid, p.started_at, p.cmd, p.owner_pid ?? null, p.owner_started_at ?? null, p.owner_nonce ?? null);
}

/** Процесс подтверждённо завершён. Повтор для уже завершённого — не ошибка. */
export function end(db: Db, key: Key, r: { exit_code?: number | null; ended_at?: string } = {}): void {
  db.prepare("UPDATE job_processes SET ended_at = ?, exit_code = ? WHERE job_id = ? AND attempt = ? AND pid = ? AND ended_at IS NULL")
    .run(r.ended_at ?? nowIso(), r.exit_code ?? null, key.job_id, key.attempt, key.pid);
}

/** S20: процесс жив и принадлежит другому живому серверу — пометка, `ended_at` не ставится. */
export function markForeign(db: Db, key: Key, ownerPid: number): void {
  db.prepare("UPDATE job_processes SET foreign_owner = ? WHERE job_id = ? AND attempt = ? AND pid = ? AND ended_at IS NULL")
    .run(ownerPid, key.job_id, key.attempt, key.pid);
}

/** Процессы без подтверждённого завершения. */
export function listLive(db: Db, filter: { jobId?: string; attempt?: number } = {}): JobProcessRow[] {
  const where = ["ended_at IS NULL"];
  const args: (string | number)[] = [];
  if (filter.jobId !== undefined) { where.push("job_id = ?"); args.push(filter.jobId); }
  if (filter.attempt !== undefined) { where.push("attempt = ?"); args.push(filter.attempt); }
  return db.prepare(`SELECT * FROM job_processes WHERE ${where.join(" AND ")} ORDER BY job_id, attempt, pid`).all(...args) as JobProcessRow[];
}
