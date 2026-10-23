// Правило приёмки итерации ночного цикла (спека 2026-10-23-night-quality-loop). Строже
// `--compare` из BENCH.md: изменение принимается только при росте explainer и без потерь по
// набору user, стоимости, времени и числу failed. Неполный прогон — не принят.
import { type Comparison, type Scores, compareRuns } from "./compare.js";
import { percentile } from "./gen-stats.js";
import { CRITERIA, type Criterion, mean } from "./metrics.js";
import { canonicalSceneId } from "./sets.js";

/** Пороги правила приёмки ночи. */
export const NIGHT_RULE = {
  /** Минимальный рост среднего explainer. */
  explainerGain: 0.1,
  /** Допустимое падение среднего user. */
  userDrop: 0.2,
  /** Потолок p90 стоимости генерации сцены по обоим наборам, $. */
  p90CostUsd: 5,
  /** Допустимый рост медианы времени генерации explainer (доля). */
  medianTimeGrowth: 0.25,
} as const;

/** Строка `scores.json`, нужная правилу (поля — как пишет `bench-set.mts`). */
export interface BenchRow {
  id: string;
  judge: { overall: number; criteria: Record<Criterion, number> } | null;
  gen?: { job_status?: string; status?: string; wall_ms?: number; stage_wall_ms?: Record<string, number> | null } | null;
  gen_cost_total_usd?: number;
}
export interface BenchScores extends Scores {
  rows: BenchRow[];
}
/** Прогоны одной стороны: оба набора. */
export interface NightBench {
  explainer: BenchScores;
  user: BenchScores;
}
export interface NightExpected {
  explainer: readonly string[];
  user: readonly string[];
}

interface MeanDelta {
  before: number;
  after: number;
  delta: number;
}
export interface NightVerdict {
  accepted: boolean;
  reasons: string[];
  metrics: {
    explainer: MeanDelta | null;
    /** Средняя дельта по сценам explainer на каждый критерий рубрики. */
    explainer_criteria: Partial<Record<Criterion, number>>;
    user: MeanDelta | null;
    failed: { before: number; after: number };
    p90_cost_usd: number | null;
    median_gen_ms: { before: number | null; after: number | null };
    compare: Comparison | null;
  };
}

const SETS = ["explainer", "user"] as const;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Ожидаемые сцены без оценки судьи (или без строки) в прогоне. */
export function missingScenes(s: BenchScores, expected: readonly string[]): string[] {
  const judged = new Set(s.rows.filter((r) => r.judge).map((r) => canonicalSceneId(r.id)));
  return expected.filter((id) => !judged.has(canonicalSceneId(id)));
}

/** Задачи генерации, не дошедшие до `completed` (без gen.json — тоже). */
export const failedCount = (s: BenchScores): number => s.rows.filter((r) => r.gen?.job_status !== "completed").length;

const genMs = (r: BenchRow): number | null => r.gen?.stage_wall_ms?.total ?? r.gen?.wall_ms ?? null;
/** Медиана времени генерации сцены набора, мс. */
export const medianGenMs = (s: BenchScores): number | null =>
  percentile(s.rows.map(genMs).filter((x): x is number => x !== null), 0.5);

/**
 * `requireGain: false` — пункт «без регрессии» (технический, оценку не поднимает): роста
 * explainer не нужно, остальные пороги и `--compare` действуют.
 */
export function acceptNight(base: NightBench, cand: NightBench, expected: NightExpected, opts: { requireGain?: boolean } = {}): NightVerdict {
  const reasons: string[] = [];
  const metrics: NightVerdict["metrics"] = {
    explainer: null, explainer_criteria: {}, user: null,
    failed: { before: failedCount(base.explainer) + failedCount(base.user), after: failedCount(cand.explainer) + failedCount(cand.user) },
    p90_cost_usd: percentile([...cand.explainer.rows, ...cand.user.rows].map((r) => r.gen_cost_total_usd ?? 0), 0.9),
    median_gen_ms: { before: medianGenMs(base.explainer), after: medianGenMs(cand.explainer) },
    compare: null,
  };
  // неполные данные не сравниваются: «принято» по половине сцен недопустимо
  for (const set of SETS) {
    const b = missingScenes(base[set], expected[set]);
    if (b.length) reasons.push(`неполная базовая линия ${set}: нет оценки у ${b.join(", ")}`);
  }
  for (const set of SETS) {
    const c = missingScenes(cand[set], expected[set]);
    if (c.length) reasons.push(`неполный прогон ${set}: нет оценки у ${c.join(", ")}`);
  }
  if (reasons.length) return { accepted: false, reasons, metrics };

  try {
    const cx = compareRuns(base.explainer, cand.explainer);
    metrics.compare = cx;
    metrics.explainer = { before: r2(cx.meanBefore), after: r2(cx.meanAfter), delta: r2(cx.meanDelta) };
    metrics.explainer_criteria = Object.fromEntries(CRITERIA.map((k) => [k, mean(cx.scenes.map((s) => s.criteria[k]))]));
    if (opts.requireGain !== false && cx.meanDelta < NIGHT_RULE.explainerGain - 1e-9) reasons.push(`explainer ${cx.meanDelta >= 0 ? "+" : ""}${cx.meanDelta.toFixed(2)} (нужно ≥ +${NIGHT_RULE.explainerGain.toFixed(2)})`);
    if (!cx.accepted) reasons.push(`--compare explainer «отклонить»: ${cx.reasons.join("; ")}`);
    const cu = compareRuns(base.user, cand.user);
    metrics.user = { before: r2(cu.meanBefore), after: r2(cu.meanAfter), delta: r2(cu.meanDelta) };
    if (cu.meanDelta < -NIGHT_RULE.userDrop - 1e-9) reasons.push(`user упал на ${(-cu.meanDelta).toFixed(2)} (допустимо ${NIGHT_RULE.userDrop})`);
  } catch (e) {
    reasons.push((e as Error).message);
  }
  if (metrics.failed.after > metrics.failed.before) reasons.push(`failed: ${metrics.failed.before} → ${metrics.failed.after}`);
  if (metrics.p90_cost_usd !== null && metrics.p90_cost_usd > NIGHT_RULE.p90CostUsd + 1e-9) {
    reasons.push(`p90 стоимости сцены $${metrics.p90_cost_usd.toFixed(2)} (> $${NIGHT_RULE.p90CostUsd})`);
  }
  const { before, after } = metrics.median_gen_ms;
  if (before && after !== null && after > before * (1 + NIGHT_RULE.medianTimeGrowth) + 1e-6) {
    reasons.push(`медиана времени explainer +${Math.round((after / before - 1) * 100)} % (допустимо +${NIGHT_RULE.medianTimeGrowth * 100} %)`);
  }
  return { accepted: reasons.length === 0, reasons, metrics };
}
