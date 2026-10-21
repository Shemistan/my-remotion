// Геометрия путей: кубические Безье, таблица длин (LUT) и точка на заданной длине.
// Чистые функции без DOM: getPointAtLength браузера не нужен, результат одинаков
// в Node и в Chrome рендера.

export interface Point {
  x: number;
  y: number;
}
/** Кубический сегмент: начало, две контрольные точки, конец. */
export type CubicSegment = readonly [Point, Point, Point, Point];

export interface PathLUT {
  /** Точки пути по порядку; `points[i]` лежит на длине `lengths[i]`. */
  points: Point[];
  /** Накопленная длина от начала, возрастает от 0 до полной длины. */
  lengths: number[];
}

export function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** LUT пути: `samples` отрезков на каждый сегмент. */
export function pathLUT(segments: readonly CubicSegment[], samples: number): PathLUT {
  const n = Math.max(1, Math.floor(samples));
  const points: Point[] = [];
  const lengths: number[] = [];
  let total = 0;
  for (const [si, seg] of segments.entries()) {
    for (let i = si === 0 ? 0 : 1; i <= n; i++) {
      const p = cubicPoint(seg[0], seg[1], seg[2], seg[3], i / n);
      const prev = points.at(-1);
      if (prev) total += Math.hypot(p.x - prev.x, p.y - prev.y);
      points.push(p);
      lengths.push(total);
    }
  }
  return { points, lengths };
}

/** Полная длина пути по LUT. */
export function lutLength(lut: PathLUT): number {
  return lut.lengths.at(-1) ?? 0;
}

/** Точка на длине `s` от начала (линейно между отсчётами LUT); за пределами — концы пути. */
export function pointAtLength(lut: PathLUT, s: number): Point {
  const { points, lengths } = lut;
  if (points.length === 0) return { x: 0, y: 0 };
  if (s <= 0) return points[0]!;
  const total = lengths.at(-1)!;
  if (s >= total) return points.at(-1)!;
  let lo = 0;
  let hi = lengths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lengths[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const l0 = lengths[lo]!;
  const l1 = lengths[hi]!;
  const t = l1 > l0 ? (s - l0) / (l1 - l0) : 0;
  const a = points[lo]!;
  const b = points[hi]!;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Точки пути между длинами s0..s1 (для хвоста импульса): концы + отсчёты LUT внутри. */
export function pointsBetween(lut: PathLUT, s0: number, s1: number): Point[] {
  const a = Math.max(0, Math.min(s0, s1));
  const b = Math.min(lutLength(lut), Math.max(s0, s1));
  const out: Point[] = [pointAtLength(lut, a)];
  lut.lengths.forEach((l, i) => {
    if (l > a && l < b) out.push(lut.points[i]!);
  });
  out.push(pointAtLength(lut, b));
  return out;
}

const num = (v: number) => String(Number(v.toFixed(2)));

/** SVG `d` из сегментов; разрыв между сегментами начинает новый `M`. */
export function pathD(segments: readonly CubicSegment[]): string {
  let d = "";
  let last: Point | undefined;
  for (const [p0, p1, p2, p3] of segments) {
    if (!last || last.x !== p0.x || last.y !== p0.y) d += `${d ? " " : ""}M${num(p0.x)} ${num(p0.y)}`;
    d += ` C${num(p1.x)} ${num(p1.y)} ${num(p2.x)} ${num(p2.y)} ${num(p3.x)} ${num(p3.y)}`;
    last = p3;
  }
  return d;
}

/** Ломаная из точек как SVG `d`. */
export function polylineD(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${num(p.x)} ${num(p.y)}`).join(" ");
}

/**
 * Гладкая кривая через точки (монотонная кубическая интерполяция Фритча — Карлсона):
 * проходит через каждую точку и не даёт ложных выбросов между ними — график не уходит
 * ниже нуля и не рисует горб, которого нет в данных. Точки — по возрастанию x.
 */
export function smoothSegments(points: readonly Point[]): CubicSegment[] {
  const n = points.length;
  if (n < 2) return [];
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = points[i + 1]!.x - points[i]!.x;
    dx.push(h);
    slope.push(h === 0 ? 0 : (points[i + 1]!.y - points[i]!.y) / h);
  }
  const m: number[] = new Array<number>(n);
  m[0] = slope[0]!;
  m[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1]!;
    const b = slope[i]!;
    m[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    const s = slope[i]!;
    if (s === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / s;
    const b = m[i + 1]! / s;
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * s;
      m[i + 1] = t * b * s;
    }
  }
  const segs: CubicSegment[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i]!;
    const p3 = points[i + 1]!;
    const h = dx[i]! / 3;
    segs.push([p0, { x: p0.x + h, y: p0.y + m[i]! * h }, { x: p3.x - h, y: p3.y - m[i + 1]! * h }, p3]);
  }
  return segs;
}

/**
 * Ребро графа: S-кривая между портами. `h` — выход и вход горизонтальные (слева направо),
 * `v` — вертикальные (сверху вниз).
 */
export function edgeSegment(a: Point, b: Point, orientation: "h" | "v" = "h"): CubicSegment {
  if (orientation === "h") {
    const k = Math.max(Math.abs(b.x - a.x) * 0.5, 24);
    const dir = b.x >= a.x ? 1 : -1;
    return [a, { x: a.x + k * dir, y: a.y }, { x: b.x - k * dir, y: b.y }, b];
  }
  const k = Math.max(Math.abs(b.y - a.y) * 0.5, 24);
  const dir = b.y >= a.y ? 1 : -1;
  return [a, { x: a.x, y: a.y + k * dir }, { x: b.x, y: b.y - k * dir }, b];
}

/** Деления оси — в ticks.ts; реэкспорт для совместимости v0.1. */
export { niceTicks } from "./ticks.js";
