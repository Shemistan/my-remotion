import type { Db } from "../open.js";
import { nowIso } from "./util.js";

/** Берёт замок ресурса; `true` — замок у этой задачи (взят сейчас или уже был её). */
export function acquire(db: Db, resource: string, jobId: string): boolean {
  db.prepare("INSERT INTO resource_locks (resource, job_id, acquired_at) VALUES (?, ?, ?) ON CONFLICT (resource) DO NOTHING")
    .run(resource, jobId, nowIso());
  return holder(db, resource) === jobId;
}

/** Снимает все замки ресурсов задачи. */
export function releaseAll(db: Db, jobId: string): number {
  return db.prepare("DELETE FROM resource_locks WHERE job_id = ?").run(jobId).changes;
}

export function holder(db: Db, resource: string): string | undefined {
  return (db.prepare("SELECT job_id FROM resource_locks WHERE resource = ?").get(resource) as { job_id: string } | undefined)?.job_id;
}
