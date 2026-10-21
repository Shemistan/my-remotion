// Метрики eval (quality-strategy §3, шаг 1): согласие судьи с оценками дизайнера (MAE,
// Spearman, порядок R1/R2 одной сцены), агрегация повторных прогонов судьи (медиана),
// дешёвые кадровые числа без LLM (содержимое кадров 0 и 4, движение в hold, пустые трети).
import { type Img, frameDelta } from "../qa/image.js";
import { EMPTY_REGION_SHARE, emptyRegionShares } from "../qa/programmatic.js";

/** Критерии рубрики судьи (`prompts/rubric-judge.md`). */
export const CRITERIA = ["meaning", "hierarchy", "composition", "entrance", "choreography", "hold", "legibility", "distinctiveness"] as const;
export type Criterion = (typeof CRITERIA)[number];

/** Оценки одного прогона судьи (или их медиана). */
export interface JudgeScores {
  overall: number;
  criteria: Record<Criterion, number>;
}

function nonEmpty(xs: readonly number[], what: string): void {
  if (xs.length === 0) throw new Error(`eval: ${what} пустой выборки`);
}

export function mean(xs: readonly number[]): number {
  nonEmpty(xs, "mean");
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function median(xs: readonly number[]): number {
  nonEmpty(xs, "median");
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Ранги 1..n; равные значения получают средний ранг. */
export function ranks(xs: readonly number[]): number[] {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(xs.length);
  for (let k = 0; k < order.length; ) {
    let j = k;
    while (j + 1 < order.length && order[j + 1]!.v === order[k]!.v) j++;
    const r = (k + j) / 2 + 1;
    for (let t = k; t <= j; t++) out[order[t]!.i] = r;
    k = j + 1;
  }
  return out;
}

function sameLength(a: readonly number[], b: readonly number[]): void {
  if (a.length !== b.length) throw new Error(`eval: длины выборок различны: ${a.length} и ${b.length}`);
  nonEmpty(a, "сравнение");
}

export function mae(pred: readonly number[], ref: readonly number[]): number {
  sameLength(pred, ref);
  return mean(pred.map((p, i) => Math.abs(p - ref[i]!)));
}

function pearson(a: readonly number[], b: readonly number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (a[i]! - ma) * (b[i]! - mb);
    va += (a[i]! - ma) ** 2;
    vb += (b[i]! - mb) ** 2;
  }
  // без разброса связи нет: 0, а не NaN (иначе таблица и приёмка сломаются)
  return va === 0 || vb === 0 ? 0 : cov / Math.sqrt(va * vb);
}

/** Spearman = Пирсон по рангам (со средними рангами для связей). */
export function spearman(a: readonly number[], b: readonly number[]): number {
  sameLength(a, b);
  return pearson(ranks(a), ranks(b));
}

export interface Agreement {
  n: number;
  mae: number;
  spearman: number;
  /** Среднее (судья − дизайнер): > 0 — судья щедрее. */
  bias: number;
  worst: { id: string; err: number };
}

export function agreement(rows: readonly { id: string; judge: number; ref: number }[]): Agreement {
  nonEmpty(rows.map((r) => r.judge), "agreement");
  const judge = rows.map((r) => r.judge);
  const ref = rows.map((r) => r.ref);
  const worst = rows.map((r) => ({ id: r.id, err: Math.abs(r.judge - r.ref) })).sort((x, y) => y.err - x.err)[0]!;
  return { n: rows.length, mae: mae(judge, ref), spearman: spearman(judge, ref), bias: mean(judge.map((j, i) => j - ref[i]!)), worst };
}

/**
 * Пары версий одной сцены (R1 → R2): судья прав, если знак разницы совпал с дизайнером.
 * Равенство у судьи — не угадал (он не отличил версии).
 */
export function pairOrder(pairs: readonly { id: string; judge: [number, number]; ref: [number, number] }[]): { correct: number; total: number; wrong: string[] } {
  const wrong = pairs.filter((p) => Math.sign(p.judge[1] - p.judge[0]) !== Math.sign(p.ref[1] - p.ref[0]) || p.judge[0] === p.judge[1]).map((p) => p.id);
  return { correct: pairs.length - wrong.length, total: pairs.length, wrong };
}

export interface Aggregate extends JudgeScores {
  /** Итог каждого прогона, по порядку. */
  runs: number[];
  /** max − min итога по прогонам. */
  spread: number;
}

/** Медиана прогонов судьи: итог и каждый критерий отдельно. */
export function aggregateRuns(runs: readonly JudgeScores[]): Aggregate {
  nonEmpty(runs.map((r) => r.overall), "aggregateRuns");
  const overalls = runs.map((r) => r.overall);
  const criteria = Object.fromEntries(CRITERIA.map((c) => [c, median(runs.map((r) => r.criteria[c]))])) as Record<Criterion, number>;
  return { overall: median(overalls), criteria, runs: overalls, spread: Math.max(...overalls) - Math.min(...overalls) };
}

/**
 * Кадры листов судьи — раскладка motion-review-2 для 180 кадров (0…48 / 60…120 / 125…150 /
 * 155…179); для другой длительности — пропорционально, последний кадр N−1.
 */
export function sheetFrames(n: number): { a: number[]; b: number[]; c: number[]; d: number[] } {
  const at = (f: number) => Math.min(n - 1, Math.round((f * n) / 180));
  const map = (fs: number[]) => fs.map(at);
  return {
    a: map([0, 8, 16, 24, 36, 48]),
    b: map([60, 72, 84, 96, 108, 120]),
    c: map([125, 130, 135, 140, 145, 150]),
    d: [...map([155, 160, 165, 170, 175]), n - 1],
  };
}

export interface FrameMetrics {
  /** Доля пикселей-содержимого на кадре 0 (0..1); фон с плавной авророй — не содержимое. */
  frame0Content: number | null;
  frame4Content: number | null;
  /** Средняя разница RGB кадров N−20 и N−1: 0 — застывший финал. */
  holdDelta: number | null;
  /** Доля кадров после открытия (≥ 10 % длины) с почти пустой третью или четвертью. */
  emptyThirdShare: number | null;
}

const contentShare = (img: Img) => {
  const r = emptyRegionShares(img);
  return (r["top-left"] + r["top-right"] + r["bottom-left"] + r["bottom-right"]) / 4;
};

/** Числа по кадрам `frames` (номер → кадр) сцены длиной `n`; нет нужного кадра — null. */
export function frameMetrics(frames: ReadonlyMap<number, Img>, n: number): FrameMetrics {
  const f0 = frames.get(0);
  const f4 = frames.get(4);
  const a = frames.get(n - 20);
  const b = frames.get(n - 1);
  const body = [...frames.entries()].filter(([f]) => f >= n * 0.1).map(([, img]) => img);
  const empty = body.filter((img) => Math.min(...Object.values(emptyRegionShares(img))) < EMPTY_REGION_SHARE).length;
  return {
    frame0Content: f0 ? contentShare(f0) : null,
    frame4Content: f4 ? contentShare(f4) : null,
    holdDelta: a && b ? frameDelta(a, b) : null,
    emptyThirdShare: body.length > 0 ? empty / body.length : null,
  };
}
