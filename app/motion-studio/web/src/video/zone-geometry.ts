// Геометрия зон поверх плеера (Task 33): видимая область видео внутри контейнера при
// `object-fit: contain` (полосы letterbox/pillarbox) и прямоугольник в долях кадра → CSS-пиксели
// этой области. Прямоугольники анализа — в долях кадра отображения (display), начало слева сверху.
import type { NormRect } from "@ms/contracts";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Видимая область видео с соотношением `aspect` (ширина / высота) в контейнере: вписано и по центру. */
export function containBox(container: { width: number; height: number }, aspect: number): Box {
  const { width: cw, height: ch } = container;
  if (!(cw > 0) || !(ch > 0) || !(aspect > 0)) return { left: 0, top: 0, width: 0, height: 0 };
  if (cw / ch > aspect) {
    const width = ch * aspect;
    return { left: r6((cw - width) / 2), top: 0, width: r6(width), height: ch };
  }
  const height = cw / aspect;
  return { left: 0, top: r6((ch - height) / 2), width: cw, height: r6(height) };
}

/** Прямоугольник в долях кадра → пиксели внутри видимой области `box`. */
export function rectToCss(rect: NormRect, box: Box): Box {
  return {
    left: r6(box.left + rect.x * box.width),
    top: r6(box.top + rect.y * box.height),
    width: r6(rect.w * box.width),
    height: r6(rect.h * box.height),
  };
}
