// Расписание импульсов PulseAlongPath без remotion и React: им пользуются kit (pulse.ts,
// FlowGraph) и сервер (QA accent_conflict — кадр прихода импульса). Один расчёт — кадры
// сервера и рендера совпадают.
import type { StyleBible } from "@ms/contracts";
import { frames } from "../style/frames.js";

/** Скорость импульса: ~420 px/с при 30 fps (с поправкой на интенсивность стиля). */
export const PULSE_PX_PER_S = 420;
/** Проход не короче 0.6 с. */
export const PULSE_MIN_S = 0.6;

// Кубическая Безье для easing — порт remotion `Easing.bezier` (react-native Animated
// bezier.js) один в один: та же таблица Float32Array, Ньютон и деление пополам, поэтому
// значения совпадают с remotion побитно (тест pulse-timing.test.ts).
const NEWTON_ITERATIONS = 4;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 0.0000001;
const SUBDIVISION_MAX_ITERATIONS = 10;
const kSplineTableSize = 11;
const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0);
const A = (a1: number, a2: number) => 1.0 - 3.0 * a2 + 3.0 * a1;
const B = (a1: number, a2: number) => 3.0 * a2 - 6.0 * a1;
const C = (a1: number) => 3.0 * a1;
const calcBezier = (t: number, a1: number, a2: number) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
const getSlope = (t: number, a1: number, a2: number) => 3.0 * A(a1, a2) * t * t + 2.0 * B(a1, a2) * t + C(a1);

/** Кривая cubic-bezier(x1, y1, x2, y2): доля времени 0..1 → доля пути. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  if (!(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1)) throw new Error("bezier x values must be in [0, 1] range");
  const linear = x1 === y1 && x2 === y2;
  const samples = new Float32Array(kSplineTableSize);
  if (!linear) for (let i = 0; i < kSplineTableSize; ++i) samples[i] = calcBezier(i * kSampleStepSize, x1, x2);
  const tForX = (x: number): number => {
    let intervalStart = 0.0;
    let cur = 1;
    const last = kSplineTableSize - 1;
    for (; cur !== last && samples[cur]! <= x; ++cur) intervalStart += kSampleStepSize;
    --cur;
    const dist = (x - samples[cur]!) / (samples[cur + 1]! - samples[cur]!);
    let t = intervalStart + dist * kSampleStepSize;
    const slope = getSlope(t, x1, x2);
    if (slope >= NEWTON_MIN_SLOPE) {
      for (let i = 0; i < NEWTON_ITERATIONS; ++i) {
        const s = getSlope(t, x1, x2);
        if (s === 0.0) return t;
        t -= (calcBezier(t, x1, x2) - x) / s;
      }
      return t;
    }
    if (slope === 0.0) return t;
    let a = intervalStart;
    let b = intervalStart + kSampleStepSize;
    let cx: number;
    let i = 0;
    do {
      t = a + (b - a) / 2.0;
      cx = calcBezier(t, x1, x2) - x;
      if (cx > 0.0) b = t;
      else a = t;
    } while (Math.abs(cx) > SUBDIVISION_PRECISION && ++i < SUBDIVISION_MAX_ITERATIONS);
    return t;
  };
  return (x: number) => {
    const cx = Math.min(1, Math.max(0, x));
    if (linear) return cx;
    if (cx === 0) return 0;
    if (cx === 1) return 1;
    return calcBezier(tForX(cx), y1, y2);
  };
}

/** Кривая прохода импульса по пути (доля прохода → доля длины). */
export const EASE_PASS = cubicBezier(0.45, 0.05, 0.4, 1);

/** Кадров на проход: `travel` или ~420 px/с с поправкой на интенсивность, не короче 0.6 с. */
export function pulsePass(len: number, travel: number | undefined, fps: number, s: StyleBible): number {
  return Math.max(1, travel ?? Math.max(Math.round(fps * PULSE_MIN_S), frames(s, (len / PULSE_PX_PER_S) * 30)));
}

/**
 * Старты проходов: k-й импульс из `count` сдвинут на pass·k/count, проходы повторяются,
 * пока старт раньше `end` (при `repeat`, по умолчанию — да); начатый проход доигрывается.
 */
export function pulseStarts(o: { start: number; end: number; pass: number; count?: number; repeat?: boolean }): number[] {
  const n = Math.max(1, Math.floor(o.count ?? 1));
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    for (let c = 0; ; c++) {
      const t0 = o.start + (k * o.pass) / n + c * o.pass;
      if (t0 >= o.end || (c > 0 && o.repeat === false)) break;
      out.push(t0);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Голова ближе этого расстояния к концу пути — импульс «пришёл»: яркое ядро головы
 * касается кромки узла (дальше голова тормозит и гаснет — узел её «поглощает»).
 */
export const ARRIVAL_PX = 10;

/**
 * Кадр прихода импульса в проходе со стартом `t0`: первый кадр, когда голова ближе
 * ARRIVAL_PX к концу пути (дробный, по кривой EASE_PASS). Короткий путь — сам старт.
 */
export function arrivalInPass(t0: number, pass: number, len: number): number {
  const target = Math.max(0, 1 - ARRIVAL_PX / Math.max(1, len));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (EASE_PASS(mid) < target) lo = mid;
    else hi = mid;
  }
  return t0 + hi * pass;
}
