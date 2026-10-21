// Единый акцент kit: удар в начале бита и дыхание удержания одной кривой. Его читают
// <Emphasis>, конечная точка LineChart и вспышки узлов FlowGraph — у всех акцентов сцены
// один характер. Размах — из интенсивности стиля (amplitude), темп — frames().
// Чистая функция кадра: можно звать в .map() и в SVG.
import type { Beat, StyleBible } from "@ms/contracts";
import { EASE, frames } from "../easing.js";
import { ramp } from "../internal.js";
import { amplitudeOf } from "../style/intensity.js";

export interface AccentPulseOptions {
  /** Окно акцента: удар в `start_frame`, удержание до `end_frame`. */
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Дышать и после конца бита — до конца сцены (по умолчанию да); иначе акцент гаснет. */
  loop?: boolean;
  /** Множитель размаха масштаба (по умолчанию 1). */
  strength?: number;
}

export interface AccentPulse {
  /** Сила свечения 0..1: удар ≈ 1, удержание дышит около 0.66 ± 0.26 × амплитуда. */
  level: number;
  /** Масштаб цели: удар + дыхание ±1.8 % × амплитуда (на четверть цикла позже свечения). */
  scale: number;
  /** Доля удара 0..1 (атака за несколько кадров, затем экспоненциальный спад). */
  strike: number;
  /** Доля удержания 0..1 (набирается после удара, гаснет после бита без loop). */
  hold: number;
  /** Кольцо, расходящееся от цели: 0 → 1, −1 — кольца нет. Удар и по кольцу на цикл дыхания. */
  ripple: number;
  /** Непрозрачность кольца в начале (удар — 1, дыхание — тише). */
  rippleAlpha: number;
}

/** Середина дыхания удержания; размах ± DEPTH × амплитуда (balanced: 0.4..0.92) — во
 *  впадине свечение не гаснет, финал не выглядит «умирающим». */
const REST = 0.66;
const DEPTH = 0.26;
/** Размах масштаба удержания × амплитуда (balanced: ±1.8 %). */
const SWELL = 0.018;

export function accentPulse(frame: number, s: StyleBible, o: AccentPulseOptions): AccentPulse {
  const { start_frame: b0, end_frame: b1 } = o.beat;
  const loop = o.loop ?? true;
  const k = o.strength ?? 1;
  const t = frame - b0;
  if (t < 0) return { level: 0, scale: 1, strike: 0, hold: 0, ripple: -1, rippleAlpha: 0 };
  const amp = amplitudeOf(s);
  const attack = frames(s, 5);
  const decay = frames(s, 16);
  const period = frames(s, 72);
  const rippleLen = frames(s, 26);

  // без loop после конца бита акцент плавно гаснет
  const fade = loop ? 1 : 1 - ramp(frame, Math.max(b0, b1), Math.max(b0, b1) + frames(s, 14), EASE.inOutCubic);
  const strike = (t < attack ? Math.sin((Math.PI / 2) * (t / attack)) : Math.exp(-(t - attack) / decay)) * fade;
  const holdIn = ramp(t, attack, attack + frames(s, 20), EASE.inOutCubic) * fade;
  const u = Math.max(0, t - attack) / period;
  // вдох свечения −1..1; масштаб идёт за светом с отставанием в четверть цикла — два кадра
  // удержания (кроме кратных периоду) всегда различаются хотя бы одним из двух
  const glowWave = -Math.cos(2 * Math.PI * u);
  const swellWave = -Math.sin(2 * Math.PI * u);
  const depth = DEPTH * Math.min(1.25, amp);
  const holdLevel = holdIn * (REST + depth * glowWave);
  const level = strike + (1 - strike) * holdLevel;
  const scale = 1 + k * amp * (0.06 * strike + SWELL * holdIn * swellWave);

  // кольцо удара; в удержании — по кольцу на пике каждого вдоха
  let ripple = -1;
  let rippleAlpha = 0;
  if (t < rippleLen && fade > 0) {
    ripple = t / rippleLen;
    rippleAlpha = fade;
  } else if (holdIn > 0 && u >= 0.5) {
    const into = ((u - 0.5) % 1) * period;
    if (into < rippleLen) {
      ripple = into / rippleLen;
      rippleAlpha = 0.45 * holdIn;
    }
  }
  return { level, scale, strike, hold: holdIn, ripple, rippleAlpha };
}
