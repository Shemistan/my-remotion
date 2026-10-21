import type { Db } from "../open.js";
import { nowIso, toJson } from "./util.js";

export function insert(db: Db, r: { id: string; job_id: string; role: string; model: string; log_dir?: string; started_at?: string }): void {
  db.prepare("INSERT INTO agent_runs (id, job_id, role, model, status, log_dir, started_at) VALUES (?, ?, ?, ?, 'running', ?, ?)")
    .run(r.id, r.job_id, r.role, r.model, r.log_dir ?? null, r.started_at ?? nowIso());
}

export function finish(
  db: Db,
  id: string,
  r: { status: string; input_tokens?: number; output_tokens?: number; cost_usd?: number; session_id?: string; permission_denials?: unknown[]; finished_at?: string },
): void {
  const res = db.prepare(`UPDATE agent_runs SET status = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?, session_id = ?,
      permission_denials_json = ?, finished_at = ? WHERE id = ?`)
    .run(r.status, r.input_tokens ?? null, r.output_tokens ?? null, r.cost_usd ?? null, r.session_id ?? null,
      toJson(r.permission_denials), r.finished_at ?? nowIso(), id);
  if (res.changes !== 1) throw new Error(`db: прогона агента нет: ${id}`);
}
