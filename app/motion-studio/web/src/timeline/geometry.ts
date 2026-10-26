// Геометрия таймлайна видеопроекта (Task 45): кадр ↔ пиксель дорожки. `zoom` — пикселей на кадр,
// `scroll` — прокрутка дорожки в пикселях. На целых кадрах перевод обратим:
// `xToFrame(frameToX(f, z, s), z, s) === f` (округление до ближайшего кадра).

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 16;

export function frameToX(frame: number, zoom: number, scroll = 0): number {
  return frame * zoom - scroll;
}

export function xToFrame(x: number, zoom: number, scroll = 0): number {
  return Math.round((x + scroll) / zoom);
}

/** Масштаб «весь ролик в ширину `widthPx`» в пределах [MIN_ZOOM, MAX_ZOOM]. */
export function fitZoom(widthPx: number, frames: number): number {
  if (frames <= 0 || widthPx <= 0) return 1;
  return clampZoom(widthPx / frames);
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Шаг делений линейки в кадрах: ближайший «круглый» шаг не уже `minPx` пикселей. */
export function rulerStep(zoom: number, fps: number, minPx = 80): number {
  const steps = [1, 5, 10].concat([1, 2, 5, 10, 15, 30, 60, 120, 300, 600].map((s) => Math.round(s * fps)));
  return steps.find((s) => s * zoom >= minPx) ?? steps.at(-1)!;
}
