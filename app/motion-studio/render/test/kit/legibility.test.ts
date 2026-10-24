// 0.4.0: предел кегля (22 px при 1080) и не больше 4 делений оси по умолчанию.
import { describe, expect, it } from "vitest";
import { flowLabelSizes } from "../../src/motion-kit/components/FlowGraph.js";
import { chartFont, chartGeometry } from "../../src/motion-kit/components/LineChart.js";
import { presets } from "../../src/motion-kit/presets.js";
import { MIN_TEXT_PX, minTextPx, sizePx } from "../../src/motion-kit/style/type-scale.js";
import { axisTicks } from "../../src/motion-kit/ticks.js";

const s = presets["dark-premium"];

describe("предел кегля", () => {
  it("22 px при 1080, 11 px при 540, растёт с высотой кадра", () => {
    expect(MIN_TEXT_PX).toBe(22);
    expect(minTextPx(1080)).toBe(22);
    expect(minTextPx(540)).toBe(11);
    expect(minTextPx(1920)).toBe(39);
  });
  it("sizePx не мельче предела: px, шаг 0 и уровень", () => {
    expect(sizePx(s, 10, 1080)).toBe(22);
    expect(sizePx(s, 0, 1080)).toBe(22);
    expect(sizePx(s, 40, 1080)).toBe(40);
    expect(sizePx(s, "caption", 1080)).toBe(32);
  });
  it("подписи осей и узлов графа — не мельче предела", () => {
    expect(chartFont(1080)).toBeGreaterThanOrEqual(22);
    const tight = flowLabelSizes([{ id: "a", label: "Очень длинная подпись узла схемы", w: 160, size: "caption" }], s, 1080).get("a")!;
    expect(tight.label).toBeGreaterThanOrEqual(22);
    expect(tight.caption).toBeGreaterThanOrEqual(22);
  });
});

describe("деления оси", () => {
  it("axisTicks: не больше max делений, шаг остаётся круглым", () => {
    expect(axisTicks(0, 1_000_000, 4)).toEqual([0, 500_000, 1_000_000]);
    expect(axisTicks(0, 87, 4)).toEqual([0, 50, 100]);
    expect(axisTicks(0, 7, 4)).toEqual([0, 5, 10]);
    for (const max of [3, 12, 68, 999, 12_345]) expect(axisTicks(0, max, 4).length).toBeLessThanOrEqual(4);
  });
  it("график по умолчанию (yTicks 4) — не больше 4 подписей оси", () => {
    const g = chartGeometry([{ value: 10_000 }, { value: 1_000_000 }], 1100, 560, 4);
    expect(g.ticks.length).toBeLessThanOrEqual(4);
  });
});
