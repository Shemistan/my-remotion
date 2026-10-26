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

/** Снимок очереди: идущие и ждущие задачи в порядке claimNext (created_at, rowid) с их замками. */
export interface QueueSnapshot {
  order: { job: Job; locks: string[] }[];
  index: Map<string, number>;
}

/** Один проход по активным задачам — на весь ответ состояния, не на каждую сцену. */
export function queueSnapshot(db: Db): QueueSnapshot {
  const ids = db.prepare("SELECT id FROM jobs WHERE status IN ('pending', 'running') ORDER BY created_at, rowid").pluck().all() as string[];
  const order = ids.map((id) => jobs.get(db, id)).filter((j): j is Job => j !== undefined).map((job) => ({ job, locks: locksOf(job) }));
  return { order, index: new Map(order.map((x, k) => [x.job.id, k])) };
}

/**
 * Задача не ждёт (идёт, завершена, нет такой) или замков у неё нет — `{ ahead: 0 }`. Впереди —
 * идущие с тем же замком (они его держат) и ждущие, поставленные раньше. `snap` — снимок
 * очереди, если считается для многих задач сразу.
 */
export function queuePosition(db: Db, jobId: string, snap: QueueSnapshot = queueSnapshot(db)): QueuePosition {
  const at = snap.index.get(jobId);
  const job = at === undefined ? undefined : snap.order[at]!.job;
  if (!job || job.status !== "pending") return { ahead: 0 };
  const mine = new Set(snap.order[at!]!.locks);
  if (mine.size === 0) return { ahead: 0 };
  let ahead = 0;
  let running: string | undefined;
  let first: string | undefined;
  snap.order.forEach((x, k) => {
    if (k === at || !x.locks.some((l) => mine.has(l))) return;
    if (x.job.status === "running") {
      ahead++;
      running ??= x.job.id;
    } else if (k < at!) {
      ahead++;
      first ??= x.job.id;
    }
  });
  const blocking = running ?? first;
  return blocking === undefined ? { ahead } : { ahead, blockingJobId: blocking };
}

/** Последняя ждущая задача сцены из снимка, подходящая под `pred`. */
export function lastPending(snap: QueueSnapshot, sceneId: string, pred: (j: Job) => boolean): Job | undefined {
  return snap.order.filter((x) => x.job.status === "pending" && x.job.scene_id === sceneId && pred(x.job)).at(-1)?.job;
}
