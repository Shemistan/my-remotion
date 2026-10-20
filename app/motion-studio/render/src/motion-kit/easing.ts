// Кривые и пружины из StyleBible. Компонент не задаёт свои числа: он выбирает роль
// (enter / exit / emphasis, soft / snappy / bouncy), а значения даёт пресет.
import type { StyleBible } from "@ms/contracts";
import { Easing, spring } from "remotion";
import { intensityScale } from "./tokens.js";

export type EasingFn = (t: number) => number;
export type EasingRole = keyof StyleBible["motion"]["easing"];
export type SpringRole = "soft" | "snappy" | "bouncy";

/** Кривая роли из StyleBible. */
export function easingOf(s: StyleBible, role: EasingRole): EasingFn {
  const [a, b, c, d] = s.motion.easing[role];
  return Easing.bezier(a, b, c, d);
}

/** Именованные кривые на случай, когда роль не подходит. */
export const EASE = {
  /** Быстрый старт, долгое торможение — счётчики и рисование линий. */
  outExpo: Easing.bezier(0.16, 1, 0.3, 1),
  /** Счёт и рост: разгон, затем долгое торможение к итогу. */
  count: Easing.bezier(0.5, 0, 0.12, 1),
  /** Плавно в обе стороны — перемещение по пути. */
  inOutCubic: Easing.bezier(0.65, 0, 0.35, 1),
  /** Мягкий вход без перелёта. */
  outQuart: Easing.bezier(0.25, 1, 0.5, 1),
  linear: (t: number) => t,
} as const;

const FALLBACK: Record<SpringRole, { damping: number; stiffness: number; mass: number }> = {
  soft: { damping: 22, stiffness: 90, mass: 1 },
  snappy: { damping: 15, stiffness: 170, mass: 0.8 },
  bouncy: { damping: 10, stiffness: 140, mass: 0.9 },
};

/** Конфиг пружины роли; интенсивность меняет демпфирование (energetic — больше перелёт). */
export function springConfig(s: StyleBible, role: SpringRole) {
  const base = s.motion.spring[role] ?? FALLBACK[role];
  const { amplitude } = intensityScale(s.motion.intensity);
  return { ...base, damping: base.damping / amplitude };
}

/**
 * Пружина 0 → 1 (с перелётом, если роль его даёт), стартующая в кадре `start`.
 * Это не хук: можно звать в `.map()`.
 */
export function springAt(frame: number, fps: number, s: StyleBible, start: number, role: SpringRole = "snappy"): number {
  const { time } = intensityScale(s.motion.intensity);
  return spring({ frame: (frame - start) / time, fps, config: springConfig(s, role) });
}

/** Кадры с учётом интенсивности: calm длиннее, energetic короче. */
export function frames(s: StyleBible, n: number): number {
  return Math.max(1, Math.round(n * intensityScale(s.motion.intensity).time));
}
