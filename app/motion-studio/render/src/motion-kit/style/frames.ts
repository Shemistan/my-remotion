// Пересчёт констант компонентов (кадры при 30 fps) под fps и интенсивность стиля — без
// remotion: им пользуются и компоненты kit (через easing.ts), и чистые расчёты для сервера.
import type { StyleBible } from "@ms/contracts";
import { intensityScale } from "./intensity.js";
import { fpsScaleOf } from "./resolve.js";

/**
 * Свои длительности компонента (константы в кадрах при 30 fps) под fps и интенсивность
 * стиля: на 60 fps вдвое больше кадров, calm длиннее, energetic короче. Токены
 * `style.motion.*_frames` из useStyle() уже пересчитаны resolveStyle — их не оборачивать.
 */
export function frames(s: StyleBible, n: number): number {
  return Math.max(1, Math.round(n * intensityScale(s.motion.intensity).time * fpsScaleOf(s)));
}

/** Константа в кадрах при 30 fps → кадры при fps стиля (без интенсивности): ритмы вроде мигания. */
export function fpsFrames(s: StyleBible, n: number): number {
  return Math.max(1, Math.round(n * fpsScaleOf(s)));
}
