// Раскладка столбчатой диаграммы: слот на столбец, общая базовая линия по низу rect.
import type { Rect } from "./choreo/safe-area.js";

/**
 * Столбцы в `rect`: каждому — слот `rect.w / n`, зазор — доля `gapRatio` слота (поровну
 * по краям). Высота ∝ значению: `max` (по умолчанию наибольшее значение) — полная высота
 * rect; нулевые и отрицательные — высота 0. Низ всех столбцов — низ rect.
 */
export function barLayout(values: number[], rect: Rect, gapRatio: number, opts: { max?: number } = {}): Rect[] {
  const n = values.length;
  if (n === 0) return [];
  const slot = rect.w / n;
  const gap = slot * Math.max(0, Math.min(0.95, gapRatio));
  const top = opts.max ?? Math.max(0, ...values);
  const base = rect.y + rect.h;
  return values.map((v, i) => {
    const h = top > 0 ? (Math.max(0, v) / top) * rect.h : 0;
    return { x: rect.x + i * slot + gap / 2, y: base - h, w: slot - gap, h };
  });
}
