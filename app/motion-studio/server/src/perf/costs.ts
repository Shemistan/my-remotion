// Учёт затрат (Task 49a, Р10/Р-V7): расчётная стоимость вызовов агентов по журналу `agent_runs`
// (`usage.costUsd` CLI), справочно — не счёт подписки и не бюджетный гейт. Все попытки и
// неудачные вызовы входят (как `jobCost`, S17b); вызовы без цены — `unknown`, сумма тогда —
// нижняя граница.
import type { CostFilter, CostSummaryDto } from "@ms/contracts/diagnostics";
import type { Db } from "../db/open.js";

const round = (v: number): number => Math.round(v * 1e6) / 1e6;

/**
 * Сводка затрат по фильтру: проект, сцена (задачи сцены), начало периода (`agent_runs.started_at`
 * ≥ `since`) и/или явный список задач (пакет генерации). Без фильтра — всё.
 */
export function costSummary(db: Db, f: CostFilter = {}): CostSummaryDto {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.projectId !== undefined) {
    where.push("j.project_id = ?");
    args.push(f.projectId);
  }
  if (f.sceneId !== undefined) {
    where.push("j.scene_id = ?");
    args.push(f.sceneId);
  }
  if (f.since !== undefined) {
    where.push("r.started_at >= ?");
    args.push(f.since);
  }
  if (f.jobIds !== undefined) {
    if (f.jobIds.length === 0) return empty();
    where.push(`r.job_id IN (${f.jobIds.map(() => "?").join(", ")})`);
    args.push(...f.jobIds);
  }
  const sql = `SELECT r.role AS role, r.model AS model, j.scene_id AS scene_id, COALESCE(SUM(r.cost_usd), 0) AS usd,
      COUNT(*) AS calls, COUNT(*) - COUNT(r.cost_usd) AS unknown
    FROM agent_runs r JOIN jobs j ON j.id = r.job_id
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY r.role, r.model, j.scene_id`;
  const rows = db.prepare(sql).all(...args) as { role: string; model: string; scene_id: string | null; usd: number; calls: number; unknown: number }[];
  const out = empty();
  const scenes = new Map<string, number>();
  for (const r of rows) {
    out.totalUsd += r.usd;
    out.calls += r.calls;
    out.unknown += r.unknown;
    out.byRole[r.role] = (out.byRole[r.role] ?? 0) + r.usd;
    out.byModel[r.model] = (out.byModel[r.model] ?? 0) + r.usd;
    if (r.scene_id) scenes.set(r.scene_id, (scenes.get(r.scene_id) ?? 0) + r.usd);
  }
  out.totalUsd = round(out.totalUsd);
  for (const k of Object.keys(out.byRole)) out.byRole[k] = round(out.byRole[k]!);
  for (const k of Object.keys(out.byModel)) out.byModel[k] = round(out.byModel[k]!);
  out.byScene = [...scenes].map(([sceneId, usd]) => ({ sceneId, usd: round(usd) })).sort((a, b) => b.usd - a.usd || (a.sceneId < b.sceneId ? -1 : 1));
  return out;
}

function empty(): CostSummaryDto {
  return { totalUsd: 0, byRole: {}, byModel: {}, byScene: [], calls: 0, unknown: 0 };
}
