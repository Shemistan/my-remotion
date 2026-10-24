// Ритм компонентов в кадрах: всё под fps и интенсивность стиля (токены уже пересчитаны,
// свои константы — через frames()). Чистые функции: их проверяют юнит-тесты на 30 и 60 fps.
import type { StyleBible } from "@ms/contracts";
import { fpsFrames, frames } from "../easing.js";

/** FlowGraph: задержка прорисовки ребра после входа его узлов (расчёт — graph-timing.ts). */
export { edgeDelay } from "./graph-timing.js";

/**
 * KineticText: шаг между частями (словами или буквами). `stagger` из props — константа
 * при 30 fps; по умолчанию — токен стиля (буквам — половина). Разбег ≤ 60 % бита.
 */
export function kineticStep(s: StyleBible, o: { mode: "words" | "letters"; units: number; len: number; stagger?: number }): number {
  const base = o.stagger !== undefined ? frames(s, o.stagger) : o.mode === "letters" ? Math.max(1, s.motion.stagger_frames * 0.5) : s.motion.stagger_frames;
  return Math.min(base, o.units > 1 ? (o.len * 0.6) / (o.units - 1) : base);
}

/** KineticText enter="type": кадров на букву (≤ 70 % бита на весь текст) и полупериод мигания каретки. */
export function typeRhythm(s: StyleBible, o: { chars: number; len: number; stagger?: number }): { perChar: number; blink: number } {
  const base = o.stagger !== undefined ? frames(s, o.stagger) : Math.max(1, s.motion.stagger_frames * 0.5);
  return { perChar: Math.max(0.5, Math.min(base, (o.len * 0.7) / Math.max(1, o.chars))), blink: fpsFrames(s, 8) };
}
