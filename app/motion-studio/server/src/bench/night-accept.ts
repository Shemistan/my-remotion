// Правило приёмки итерации ночного цикла (спека 2026-10-23-night-quality-loop). Строже
// `--compare` из BENCH.md: изменение принимается только при росте explainer и без потерь по
// набору user, стоимости, времени и числу failed. Неполный прогон — не принят.
//
// Шум судьи и генерации ~0.5–1.0 на сцену (ревью ночи, I4), поэтому решение — парным тестом по
// сценам: средняя дельта, её стандартная ошибка SE = sd/√n и односторонняя граница
// mean ∓ t(0.9, n−1)·SE. Рост explainer засчитывается, только если средняя ≥ +0.1 и нижняя
// граница > 0. user отклоняется только при уверенном падении: средняя ниже −0.2 и верхняя
// граница < 0; правило «сцена упала > 1.0» действует для обоих наборов.
import { type Comparison, MEAN_DROP, SCENE_DROP, type Scores, compareRuns } from "./compare.js";
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
  /** Стандартная ошибка средней дельты по сценам. */
  se?: number;
  /** Нижняя (explainer) или верхняя (user) односторонняя граница средней дельты. */
  lower?: number;
  upper?: number;
}
export interface NightVerdict {
  accepted: boolean;
  reasons: string[];
  /**
   * Принято, но у порога: нижняя граница дельты explainer ниже порога роста (или −0.15 у
   * пункта «без регрессии»), либо нижняя граница user ниже −0.2. Такое «принято» нужно
   * подтверждать повторным прогоном.
   */
  borderline: boolean;
  /** Сравнение невозможно по причине инфраструктуры (разные судьи) — это сбой, не «не дало роста». */
  infra?: string;
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

/** Квантиль t-распределения 0.9 (односторонний 90 %) для df = 1…30; дальше — нормальный. */
const T90 = [3.078, 1.886, 1.638, 1.533, 1.476, 1.44, 1.415, 1.397, 1.383, 1.372, 1.363, 1.356, 1.35, 1.345, 1.341, 1.337, 1.333, 1.33, 1.328, 1.325, 1.323, 1.321, 1.319, 1.318, 1.316, 1.315, 1.314, 1.313, 1.311, 1.31];
const t90 = (df: number) => T90[df - 1] ?? 1.282;

/** Парная статистика дельт по сценам; при одной сцене SE бесконечна (вывода нет). */
export function pairedStats(d: readonly number[]): { mean: number; se: number; lower: number; upper: number } {
  const n = d.length;
  const m = mean(d);
  if (n < 2) return { mean: m, se: Number.POSITIVE_INFINITY, lower: Number.NEGATIVE_INFINITY, upper: Number.POSITIVE_INFINITY };
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1));
  const se = sd / Math.sqrt(n);
  const t = t90(n - 1);
  return { mean: m, se, lower: m - t * se, upper: m + t * se };
}

/**
 * Среднее двух прогонов одного коммита по сценам (подтверждающий повтор): overall и критерии —
 * среднее, если сцена оценена в обоих (иначе без оценки); задача — failed, если не дошла до
 * `completed` хоть в одном; время и стоимость — среднее.
 */
export function averageScores(a: BenchScores, b: BenchScores, run: string): BenchScores {
  const other = new Map(b.rows.map((r) => [canonicalSceneId(r.id), r]));
  const avg = (x: number | undefined, y: number | undefined) => (x === undefined ? y : y === undefined ? x : (x + y) / 2);
  const rows = a.rows.map((r): BenchRow => {
    const o = other.get(canonicalSceneId(r.id));
    const judge = r.judge && o?.judge
      ? { overall: (r.judge.overall + o.judge.overall) / 2, criteria: Object.fromEntries(CRITERIA.map((c) => [c, (r.judge!.criteria[c] + o.judge!.criteria[c]) / 2])) as Record<Criterion, number> }
      : null;
    const ga = genMs(r) ?? undefined;
    const gb = o ? (genMs(o) ?? undefined) : undefined;
    const ms = avg(ga, gb);
    const ok = r.gen?.job_status === "completed" && o?.gen?.job_status === "completed";
    const cost = avg(r.gen_cost_total_usd, o?.gen_cost_total_usd);
    return {
      id: r.id, judge,
      gen: { job_status: ok ? "completed" : "failed", ...(ms === undefined ? {} : { wall_ms: ms, stage_wall_ms: { total: ms } }) },
      ...(cost === undefined ? {} : { gen_cost_total_usd: cost }),
    };
  });
  return { summary: { ...a.summary, run }, rows };
}

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
    // сцена без записанной стоимости не считается бесплатной (L7): её просто нет в выборке
    p90_cost_usd: percentile([...cand.explainer.rows, ...cand.user.rows].flatMap((r) => (typeof r.gen_cost_total_usd === "number" ? [r.gen_cost_total_usd] : [])), 0.9),
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
  if (reasons.length) return { accepted: false, reasons, metrics, borderline: false };

  const requireGain = opts.requireGain !== false;
  let borderline = false;
  let infra: string | undefined;
  try {
    const cx = compareRuns(base.explainer, cand.explainer);
    const cu = compareRuns(base.user, cand.user);
    const se = pairedStats(cx.scenes.map((s) => s.delta));
    const su = pairedStats(cu.scenes.map((s) => s.delta));
    metrics.compare = cx;
    metrics.explainer = { before: r2(cx.meanBefore), after: r2(cx.meanAfter), delta: r2(cx.meanDelta), se: r2(se.se), lower: r2(se.lower) };
    metrics.explainer_criteria = Object.fromEntries(CRITERIA.map((k) => [k, mean(cx.scenes.map((s) => s.criteria[k]))]));
    if (requireGain && cx.meanDelta < NIGHT_RULE.explainerGain - 1e-9) reasons.push(`explainer ${cx.meanDelta >= 0 ? "+" : ""}${cx.meanDelta.toFixed(2)} (нужно ≥ +${NIGHT_RULE.explainerGain.toFixed(2)})`);
    else if (requireGain && !(se.lower > 0)) reasons.push(`explainer +${cx.meanDelta.toFixed(2)} в шуме: нижняя граница ${se.lower.toFixed(2)} ≤ 0 (SE ${se.se.toFixed(2)}, ${cx.scenes.length} сцен)`);
    if (!cx.accepted) reasons.push(`--compare explainer «отклонить»: ${cx.reasons.join("; ")}`);
    metrics.user = { before: r2(cu.meanBefore), after: r2(cu.meanAfter), delta: r2(cu.meanDelta), se: r2(su.se), upper: r2(su.upper) };
    if (cu.meanDelta < -NIGHT_RULE.userDrop - 1e-9 && su.upper < 0) reasons.push(`user упал на ${(-cu.meanDelta).toFixed(2)} (допустимо ${NIGHT_RULE.userDrop}; верхняя граница ${su.upper.toFixed(2)} < 0)`);
    const userScenes = cu.scenes.filter((s) => s.delta < -SCENE_DROP);
    if (userScenes.length) reasons.push(`user: ${userScenes.map((s) => `${s.id} упала на ${(-s.delta).toFixed(1)}`).join(", ")} (> ${SCENE_DROP})`);
    borderline = se.lower < (requireGain ? NIGHT_RULE.explainerGain : -MEAN_DROP) || su.lower < -NIGHT_RULE.userDrop;
  } catch (e) {
    infra = (e as Error).message;
    reasons.push(infra);
  }
  if (metrics.failed.after > metrics.failed.before) reasons.push(`failed: ${metrics.failed.before} → ${metrics.failed.after}`);
  if (metrics.p90_cost_usd !== null && metrics.p90_cost_usd > NIGHT_RULE.p90CostUsd + 1e-9) {
    reasons.push(`p90 стоимости сцены $${metrics.p90_cost_usd.toFixed(2)} (> $${NIGHT_RULE.p90CostUsd})`);
  }
  const { before, after } = metrics.median_gen_ms;
  if (before && after !== null && after > before * (1 + NIGHT_RULE.medianTimeGrowth) + 1e-6) {
    reasons.push(`медиана времени explainer +${Math.round((after / before - 1) * 100)} % (допустимо +${NIGHT_RULE.medianTimeGrowth * 100} %)`);
  }
  const accepted = reasons.length === 0;
  return { accepted, reasons, metrics, borderline: accepted && borderline, ...(infra ? { infra } : {}) };
}
