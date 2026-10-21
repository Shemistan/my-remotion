// barLayout: столбцы на общей базовой линии, высота пропорциональна значению.
import { describe, expect, it } from "vitest";
import { barLayout } from "../../src/motion-kit/bars.js";

describe("barLayout", () => {
  it("высота ∝ значению, базовая линия общая", () => {
    const bars = barLayout([10, 40, 100], { x: 0, y: 0, w: 300, h: 100 }, 0.25);
    expect(bars.map((b) => b.h)).toEqual([10, 40, 100]);
    expect(new Set(bars.map((b) => b.y + b.h)).size).toBe(1);
  });
  it("ширина: слот на столбец, зазор — доля слота, столбцы внутри rect и не пересекаются", () => {
    const rect = { x: 50, y: 20, w: 400, h: 200 };
    const bars = barLayout([1, 2, 3, 4], rect, 0.25);
    expect(bars.map((b) => b.w)).toEqual([75, 75, 75, 75]);
    expect(bars.map((b) => b.x)).toEqual([62.5, 162.5, 262.5, 362.5]);
    for (const b of bars) {
      expect(b.x).toBeGreaterThanOrEqual(rect.x);
      expect(b.x + b.w).toBeLessThanOrEqual(rect.x + rect.w);
      expect(b.y + b.h).toBe(rect.y + rect.h);
    }
  });
  it("max задаёт шкалу (верх оси), отрицательное и нулевое — столбец высоты 0", () => {
    const bars = barLayout([50, 0, -5], { x: 0, y: 0, w: 300, h: 100 }, 0.2, { max: 200 });
    expect(bars.map((b) => b.h)).toEqual([25, 0, 0]);
    expect(barLayout([], { x: 0, y: 0, w: 100, h: 100 }, 0.2)).toEqual([]);
    expect(barLayout([0, 0], { x: 0, y: 0, w: 100, h: 100 }, 0.2).map((b) => b.h)).toEqual([0, 0]);
  });
});
