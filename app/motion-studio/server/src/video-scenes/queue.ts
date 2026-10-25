// Позиция задачи в очереди (Task 38-39) — для «в очереди за …»: ждущую задачу держат замки
// (сцены — `scene_locks`, ресурса проекта — `lockKeyFor`). Впереди — задачи с тем же замком:
// идущие и ждущие, поставленные раньше (claimNext берёт по created_at, rowid).
import type { Job } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import { lockKeyFor, sceneLockFor } from "../jobs/locks.js";

export interface QueuePosition {
  ahead: number;
  /** Задача, которая держит замок сейчас (или первая впереди, если никто не держит). */
  blockingJobId?: string;
}

/** Замки задачи: сцена и ресурс проекта (с префиксами, чтобы не совпасть). */
function locksOf(j: Job): string[] {
  const out: string[] = [];
  const scene = sceneLockFor(j);
  if (scene !== undefined) out.push(`scene:${scene}`);
  const key = lockKeyFor(j);
  if (key !== undefined) out.push(`res:${key}`);
  return out;
}

/** Задача не ждёт (идёт, завершена, нет такой) или замков у неё нет — `{ ahead: 0 }`. */
export function queuePosition(db: Db, jobId: string): QueuePosition {
  const job = jobs.get(db, jobId);
  if (!job || job.status !== "pending") return { ahead: 0 };
  const mine = new Set(locksOf(job));
  if (mine.size === 0) return { ahead: 0 };
  const ids = db.prepare("SELECT id FROM jobs WHERE status IN ('pending', 'running') ORDER BY created_at, rowid").pluck().all() as string[];
  let ahead = 0;
  let running: string | undefined;
  let first: string | undefined;
  for (const id of ids) {
    if (id === jobId) {
      // идущие после неё в порядке очереди всё равно впереди: они уже держат замок
      continue;
    }
    const other = jobs.get(db, id)!;
    if (!locksOf(other).some((k) => mine.has(k))) continue;
    if (other.status === "running") {
      ahead++;
      running ??= id;
      continue;
    }
    if (isBefore(db, id, jobId)) {
      ahead++;
      first ??= id;
    }
  }
  const blocking = running ?? first;
  return blocking === undefined ? { ahead } : { ahead, blockingJobId: blocking };
}

/** `a` в очереди раньше `b` (created_at, rowid). */
function isBefore(db: Db, a: string, b: string): boolean {
  const r = db.prepare("SELECT (SELECT created_at FROM jobs WHERE id = ?) AS ac, (SELECT rowid FROM jobs WHERE id = ?) AS ar, (SELECT created_at FROM jobs WHERE id = ?) AS bc, (SELECT rowid FROM jobs WHERE id = ?) AS br")
    .get(a, a, b, b) as { ac: string; ar: number; bc: string; br: number };
  return r.ac < r.bc || (r.ac === r.bc && r.ar < r.br);
}
