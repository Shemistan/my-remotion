import type { Db } from "../open.js";
import { nowIso } from "./util.js";

/** Берёт замок сцены; `true` — замок у этой задачи (взят сейчас или уже был её). */
export function acquire(db: Db, sceneId: string, jobId: string): boolean {
  db.prepare("INSERT INTO scene_locks (scene_id, job_id, acquired_at) VALUES (?, ?, ?) ON CONFLICT (scene_id) DO NOTHING")
    .run(sceneId, jobId, nowIso());
  return holder(db, sceneId) === jobId;
}

/** Снимает замок, только если его держит `jobId`. */
export function release(db: Db, sceneId: string, jobId: string): boolean {
  return db.prepare("DELETE FROM scene_locks WHERE scene_id = ? AND job_id = ?").run(sceneId, jobId).changes === 1;
}

export function holder(db: Db, sceneId: string): string | undefined {
  return (db.prepare("SELECT job_id FROM scene_locks WHERE scene_id = ?").get(sceneId) as { job_id: string } | undefined)?.job_id;
}
