// Метрики генерации прогона (S5 п. 7): время по этапам (wall-clock), стоимость p50/p90 и
// «опубликованная оценка Visual QA не ниже первой попытки» — по gen.json сцен.
import { stageOf } from "../pipeline/steps.js";

/** Перцентиль p ∈ [0, 1] линейной интерполяцией; пусто — null. */
export function percentile(xs: readonly number[], p: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = (s.length - 1) * p;
  const lo = Math.floor(k);
  const hi = Math.ceil(k);
  return s[lo]! + (s[hi]! - s[lo]!) * (k - lo);
}

/**
 * Время этапов сцены из pipeline-log.json: `stage_wall_ms` (S5) или, у журналов до S5,
 * сумма `timings` по этапам (параллельности до S5 внутри сцены не было).
 */
export function stageWallOf(log: { stage_wall_ms?: Record<string, number>; timings?: Record<string, number> } | undefined): Record<string, number> | null {
  if (!log) return null;
  if (log.stage_wall_ms) return log.stage_wall_ms;
  if (!log.timings) return null;
  const out: Record<string, number> = {};
  let sum = 0;
  for (const [k, v] of Object.entries(log.timings)) {
    if (k === "total" || k === "queue_wait") continue;
    const st = stageOf(k);
    out[st] = (out[st] ?? 0) + v;
    sum += v;
  }
  out.total = log.timings.total ?? sum;
  return out;
}

/** Попытка в журнале (pipeline-log.json → `attempts`). */
export interface AttemptLine {
  n: number;
  overall?: number;
  published: boolean;
}

/** Оценка опубликованной попытки против первой оценённой; без оценок — null. */
export function publishedVsFirst(attempts: readonly AttemptLine[] | undefined): { first: number; published: number; ok: boolean } | null {
  const scored = (attempts ?? []).filter((a) => a.overall !== undefined).sort((a, b) => a.n - b.n);
  const pub = scored.find((a) => a.published);
  if (!pub || scored.length === 0) return null;
  const first = scored[0]!.overall!;
  return { first, published: pub.overall!, ok: pub.overall! >= first };
}

export interface GenRow {
  id?: string;
  cost_usd: number;
  stage_wall_ms: Record<string, number> | null | undefined;
  attempts: readonly AttemptLine[] | undefined;
}

export interface GenStats {
  cost_p50: number | null;
  cost_p90: number | null;
  /** По этапу: медиана и среднее по сценам, где этап был, мс. */
  stages: Record<string, { p50: number; mean: number; n: number }>;
  published_ge_first: { ok: number; of: number; misses: string[] };
}

export function genStats(rows: readonly GenRow[]): GenStats {
  const costs = rows.map((r) => r.cost_usd);
  const per = new Map<string, number[]>();
  for (const r of rows) for (const [k, v] of Object.entries(r.stage_wall_ms ?? {})) per.set(k, [...(per.get(k) ?? []), v]);
  const stages: GenStats["stages"] = {};
  for (const [k, xs] of per) stages[k] = { p50: percentile(xs, 0.5)!, mean: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length };
  const pv = rows.map((r) => ({ id: r.id ?? "?", v: publishedVsFirst(r.attempts) })).filter((x) => x.v !== null);
  return {
    cost_p50: percentile(costs, 0.5),
    cost_p90: percentile(costs, 0.9),
    stages,
    published_ge_first: { ok: pv.filter((x) => x.v!.ok).length, of: pv.length, misses: pv.filter((x) => !x.v!.ok).map((x) => `${x.id} (${x.v!.first} → ${x.v!.published})`) },
  };
}
