// timelineLayout: вехи равномерно по оси от края до края rect.
import { describe, expect, it } from "vitest";
import { timelineLayout } from "../../src/motion-kit/timeline-layout.js";

describe("timelineLayout", () => {
  it("горизонталь: от левого края до правого, по середине высоты", () => {
    const pts = timelineLayout(3, { x: 0, y: 0, w: 1000, h: 100 }, "h");
    expect(pts.map((p) => p.x)).toEqual([0, 500, 1000]);
    expect(pts.map((p) => p.y)).toEqual([50, 50, 50]);
  });
  it("вертикаль: сверху вниз, по середине ширины", () => {
    expect(timelineLayout(4, { x: 10, y: 100, w: 200, h: 300 }, "v")).toEqual([
      { x: 110, y: 100 },
      { x: 110, y: 200 },
      { x: 110, y: 300 },
      { x: 110, y: 400 },
    ]);
  });
  it("одна веха — в центре, ноль — пусто", () => {
    expect(timelineLayout(1, { x: 0, y: 0, w: 1000, h: 100 }, "h")).toEqual([{ x: 500, y: 50 }]);
    expect(timelineLayout(0, { x: 0, y: 0, w: 1000, h: 100 }, "h")).toEqual([]);
  });
});
