// Hold engine (0.5.0): чем живёт финал сцены — режим удержания фазы `hold` spec
// (`phases[].hold_mode`). Чистые функции кадра: их читают `hold`-пропсы FlowGraph,
// LineChart, LatencyRace, Timeline, Emphasis, Camera и хук `useHold` для своих слоёв.
//
// Гарантии kit:
// - движение видно между N−20 и N−1: циклы режима отсчитываются от последнего кадра сцены
//   (якорь), поэтому кадр N−1 всегда в середине цикла, при любой длине удержания;
// - вход в удержание плавный (`live` за ~0.5 с), циклы целые — блик или волна не
//   возникают посреди пути;
// - движение не спорит с итогом: потоки после удара не начинаются заново, кроме
//   `steady-flow` (там система работает дальше — тише, 60 % темпа).
import type { Beat, HoldMode, StyleBible } from "@ms/contracts";
import { EASE, frames } from "../easing.js";
import { clamp01, ramp } from "../internal.js";

export const HOLD_MODES = ["steady-flow", "repeat-result", "data-shimmer", "now-pulse", "settle-push"] as const satisfies readonly HoldMode[];

/** Режим удержания и бит `hold` из spec (`hold={{ mode, beat }}` у компонентов kit). */
export interface Hold {
  mode: HoldMode;
  beat: Pick<Beat, "start_frame" | "end_frame">;
}

/** steady-flow: доля темпа потока в удержании. */
export const HOLD_RATE = 0.6;
/** Окно проверки «финал живой» (QA frozen / accent_static): кадры N−20 и N−1. */
export const HOLD_PROBE = 20;

/** Длительности режимов, кадры (под fps и интенсивность стиля). */
export function holdTiming(s: StyleBible) {
  return {
    /** набор живости после начала удержания */
    live: frames(s, 18),
    /** data-shimmer: проход блика и пауза до следующего */
    sweep: frames(s, 42),
    rest: frames(s, 22),
    /** now-pulse: период волны и её длина */
    pulse: frames(s, 50),
    ripple: frames(s, 38),
    /** repeat-result: шаг тиков и жизнь подписи тика (меньше шага — подписи не налезают) */
    tick: frames(s, 44),
    label: frames(s, 38),
  };
}

/**
 * Старты циклов длины `period`, у которых кадр `last` приходится на `offset` кадров от
 * старта последнего цикла; только старты ≥ `from`. Если ни один не влез — один цикл
 * (начат до `from`): финал всё равно движется.
 */
export function anchoredStarts(from: number, last: number, period: number, offset: number): number[] {
  const out: number[] = [];
  const p = Math.max(1, period);
  for (let t = last - offset; t >= from; t -= p) out.push(t);
  if (out.length === 0) out.push(last - offset);
  return out.reverse();
}

/** Последний кадр сцены: `end` (длительность) или конец бита hold. */
const lastOf = (h: Hold, end?: number) => Math.max(h.beat.start_frame, (end ?? h.beat.end_frame) - 1);

/**
 * repeat-result: кадры тиков (приходов) удержания. `lead` — кадров от начала удержания до
 * первого тика (проход импульса к цели). Последний тик — за 8 кадров до N−1: подпись свежая.
 */
export function holdTicks(h: Hold, s: StyleBible, end?: number, lead = 0): number[] {
  const T = holdTiming(s);
  return anchoredStarts(h.beat.start_frame + lead, lastOf(h, end), T.tick, frames(s, 8));
}

/**
 * steady-flow: старты проходов импульса в удержании — темп ≈ 60 % (шаг pass / 0.6, при
 * `count` импульсах на пути — в count раз чаще). Ряд идёт от прошлого прохода `after`
 * (поток не замирает на стыке) и подогнан так, что в кадре N−1 импульс на середине пути:
 * шаг — в пределах 0.65…1.4 от 60 %; не подогнать — ровный шаг 60 % от `after`.
 */
export function steadyStarts(h: Hold, pass: number, s: StyleBible, end?: number, o: { count?: number; after?: number } = {}): number[] {
  const n = Math.max(1, Math.floor(o.count ?? 1));
  const step0 = pass / HOLD_RATE / n;
  const start = h.beat.start_frame;
  const last = lastOf(h, end);
  const prev = Math.max(o.after ?? -Infinity, start - step0);
  const target = last - pass * 0.5;
  const gap = target - prev;
  const k = Math.max(1, Math.round(gap / step0));
  const step = gap / k;
  const out: number[] = [];
  if (gap > 0 && step >= step0 * 0.65 && step <= step0 * 1.4) {
    for (let i = 1; i <= k; i++) out.push(prev + i * step);
  } else {
    for (let t = prev + step0; t <= last; t += step0) out.push(t);
  }
  return out.filter((t) => t >= start && t <= last);
}

export interface HoldFrame {
  mode: HoldMode;
  /** Удержание началось. */
  on: boolean;
  /** Кадров от начала удержания. */
  local: number;
  /** Набор живости 0..1: всё движение режима умножается на него. */
  live: number;
  /** data-shimmer: доля пути блика 0..1 (−1 — блика нет) и его сила 0..1. */
  sweep: number;
  sweepAlpha: number;
  /** now-pulse: волна от героя 0..1 (−1 — нет) и её сила в начале. */
  ripple: number;
  rippleAlpha: number;
  /** Дыхание −1..1 × live (пик — в момент волны / прихода блика). */
  breath: number;
  /** settle-push: доля наезда 0..1 (без остановки до последнего кадра). */
  push: number;
  /** repeat-result: последний тик — номер и возраст в кадрах (null — тиков ещё нет). */
  tick: { index: number; age: number } | null;
}

/** Плавный набор (smoothstep): наклон ≤ 1.5 — без рывка на входе в удержание. */
const smooth = (t: number) => t * t * (3 - 2 * t);

const REST_FRAME = (mode: HoldMode): HoldFrame => ({ mode, on: false, local: 0, live: 0, sweep: -1, sweepAlpha: 0, ripple: -1, rippleAlpha: 0, breath: 0, push: 0, tick: null });

/**
 * Наезд settle-push по доле удержания u: разгон в первой четверти, дальше — ровно, без
 * торможения в ноль (иначе последние кадры стоят).
 */
function pushCurve(u: number): number {
  const a = 0.25;
  const x = clamp01(u);
  const g = x < a ? (x * x) / (2 * a) : x - a / 2;
  return g / (1 - a / 2);
}

/** Кадр удержания `frame` (чистая функция). `end` — длительность сцены (по умолчанию конец бита). */
export function holdAt(frame: number, h: Hold, s: StyleBible, end?: number): HoldFrame {
  const start = h.beat.start_frame;
  if (frame < start) return REST_FRAME(h.mode);
  const T = holdTiming(s);
  const last = lastOf(h, end);
  const live = ramp(frame, start, start + T.live, smooth);
  const out: HoldFrame = { ...REST_FRAME(h.mode), on: true, local: frame - start, live };

  switch (h.mode) {
    case "data-shimmer": {
      // проход блика: N−1 — на 70 % пути; пауза между проходами
      const starts = anchoredStarts(start, last, T.sweep + T.rest, Math.round(T.sweep * 0.7));
      const t0 = [...starts].reverse().find((t) => t <= frame);
      if (t0 !== undefined && frame - t0 < T.sweep) {
        const u = (frame - t0) / T.sweep;
        out.sweep = EASE.inOutCubic(u) * 0.85 + u * 0.15;
        // блик зажигается и гаснет у концов пути, у цели вспыхивает
        out.sweepAlpha = live * Math.min(1, u / 0.12) * (u > 0.9 ? (1 - u) / 0.1 : 1);
      }
      // дыхание с пиком в приход блика к цели
      const arrive = starts.map((t) => t + T.sweep);
      out.breath = live * Math.cos((2 * Math.PI * (frame - (arrive.at(-1) ?? frame))) / (T.sweep + T.rest));
      break;
    }
    case "now-pulse":
    case "settle-push": {
      // волна от героя; N−1 — середина волны (settle-push — дыхание без волны)
      const starts = anchoredStarts(start, last, T.pulse, Math.round(T.ripple * 0.5));
      const r0 = [...starts].reverse().find((t) => t <= frame);
      if (h.mode === "now-pulse" && r0 !== undefined && frame - r0 < T.ripple) {
        out.ripple = (frame - r0) / T.ripple;
        out.rippleAlpha = live;
      }
      // пик дыхания — в последнем кадре: финальный кадр — в полную силу
      out.breath = live * Math.cos((2 * Math.PI * (frame - last)) / T.pulse);
      if (h.mode === "settle-push") out.push = pushCurve((frame - start) / Math.max(1, last - start));
      break;
    }
    case "repeat-result": {
      const ticks = holdTicks(h, s, end);
      let i = -1;
      for (let k = 0; k < ticks.length; k++) if (ticks[k]! <= frame) i = k;
      if (i >= 0) out.tick = { index: i, age: frame - ticks[i]! };
      out.breath = live * Math.cos((2 * Math.PI * (frame - (ticks.at(-1) ?? frame))) / T.tick);
      break;
    }
    case "steady-flow": {
      // темп и приходы — у потоков (steadyStarts); общее дыхание финала
      out.breath = live * Math.cos((2 * Math.PI * (frame - last)) / T.pulse);
      break;
    }
  }
  return out;
}

/**
 * Подпись тика repeat-result в возрасте `age` (кадров от прихода): проявление с лёгким
 * подъёмом 6 кадров, стоит, гаснет последние 10 кадров жизни; дрейф вверх ≤ 8 px — текст
 * читается. `{ opacity, dy, scale }`.
 */
export function tickLabel(age: number, s: StyleBible): { opacity: number; dy: number; scale: number } {
  const T = holdTiming(s);
  if (age < 0 || age >= T.label) return { opacity: 0, dy: 0, scale: 1 };
  const inn = ramp(age, 0, frames(s, 6), EASE.outCubic);
  const out = 1 - ramp(age, T.label - frames(s, 10), T.label, EASE.inOutCubic);
  return { opacity: inn * out, dy: -(4 * (1 - inn) + 8 * (age / T.label)), scale: 0.92 + 0.08 * inn };
}
