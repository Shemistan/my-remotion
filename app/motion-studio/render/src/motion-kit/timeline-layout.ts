// Раскладка таймлайна: вехи равномерно по оси, от края до края rect.
import type { Point } from "./geometry.js";
import type { Rect } from "./choreo/safe-area.js";

/**
 * n вех: `h` — слева направо по середине высоты rect, `v` — сверху вниз по середине
 * ширины. Первая и последняя — на краях rect, одна веха — в центре.
 */
export function timelineLayout(n: number, rect: Rect, orientation: "h" | "v"): Point[] {
  const count = Math.max(0, Math.floor(n));
  const at = (i: number) => (count === 1 ? 0.5 : i / (count - 1));
  return Array.from({ length: count }, (_, i) =>
    orientation === "h" ? { x: rect.x + rect.w * at(i), y: rect.y + rect.h / 2 } : { x: rect.x + rect.w / 2, y: rect.y + rect.h * at(i) },
  );
}
