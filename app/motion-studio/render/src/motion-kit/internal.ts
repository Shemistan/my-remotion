// Мелкие помощники компонентов kit (не экспортируются из index).
import { useId } from "react";

/** Опции interpolate по кадру: всегда clamp (по умолчанию Remotion — extend). */
export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** id для SVG (градиенты, фильтры): useId без символов, ломающих url(#…). */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/**
 * Доля 0..1 окна [a, b] по кадру (clamp, необязательный easing). Окно нулевой или
 * обратной длины — ступенька в кадре a: interpolate на таком входе бросает.
 */
export function ramp(frame: number, a: number, b: number, easing?: (t: number) => number): number {
  if (!(b > a)) return frame >= a ? 1 : 0;
  const t = clamp01((frame - a) / (b - a));
  return easing ? easing(t) : t;
}

/**
 * Прорисовка штриха SVG по доле p (0..1) при `pathLength={1}`: штрих длины p и разрыв 2.
 * Рисуй элемент только при p > 0 — у штриха нулевой длины круглый торец даёт точку.
 */
export const drawDash = (p: number) => `${Math.max(0, Math.min(1, p)).toFixed(4)} 2`;
