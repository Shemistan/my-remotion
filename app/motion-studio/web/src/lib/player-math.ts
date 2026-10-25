// Время <video> ↔ номер кадра. Seek ставит середину кадра: так браузер показывает ровно этот
// кадр, а не соседний из-за округления времени.
import type { Fps } from "@ms/contracts";

/** Середина кадра `frame`, секунды. */
export function frameToTime(frame: number, fps: Fps): number {
  return ((frame + 0.5) * fps.den) / fps.num;
}

/** Кадр, которому принадлежит момент `t`, секунды. */
export function timeToFrame(t: number, fps: Fps): number {
  return Math.floor((t * fps.num) / fps.den);
}

/** Кадр в пределах сцены [0, duration − 1]. */
export function clampFrame(frame: number, durationFrames: number): number {
  return Math.min(Math.max(0, Math.floor(frame)), Math.max(0, durationFrames - 1));
}

/** Длительность в секундах с одной цифрой после запятой (русская запись). */
export function formatDuration(frames: number, fps: Fps): string {
  return formatNumber((frames * fps.den) / fps.num, 1);
}

export function formatNumber(n: number, digits: number): string {
  return n.toFixed(digits).replace(".", ",");
}

/** FPS для подписи: целое без дроби, иначе до двух знаков (29,97). */
export function formatFps(fps: Fps): string {
  const v = fps.num / fps.den;
  return Number.isInteger(v) ? String(v) : formatNumber(v, 2);
}
