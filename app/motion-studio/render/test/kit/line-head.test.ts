// lineChartHead: один источник движения для графика и привязанного к нему счётчика.
import { describe, expect, it } from "vitest";
import { lineChartHead, xLabelIndices } from "../../src/motion-kit/components/LineChart.js";

const POINTS = [
  { label: "a", value: 10_000 },
  { label: "b", value: 50_000 },
  { label: "c", value: 200_000 },
  { label: "d", value: 1_000_000 },
];
const BEAT = { start_frame: 20, end_frame: 120 };

describe("lineChartHead", () => {
  it("до прорисовки — первая точка, после — последняя; endFrame — конец окна 80 %", () => {
    expect(lineChartHead(POINTS, BEAT, 0)).toEqual({ progress: 0, value: 10_000, endFrame: 100 });
    expect(lineChartHead(POINTS, BEAT, 110)).toMatchObject({ progress: 1, value: 1_000_000 });
  });
  it("значение под головой растёт монотонно и остаётся в диапазоне", () => {
    let prev = -Infinity;
    for (let f = 20; f <= 120; f++) {
      const { value } = lineChartHead(POINTS, BEAT, f, { width: 900, height: 500 });
      expect(value).toBeGreaterThanOrEqual(prev);
      expect(value).toBeGreaterThanOrEqual(10_000);
      expect(value).toBeLessThanOrEqual(1_000_000);
      prev = value;
    }
  });
});

describe("xLabelIndices: подписи X не налезают друг на друга", () => {
  it("помещаются — все", () => {
    expect(xLabelIndices(["янв", "мар", "май", "июл", "сен", "ноя"], 120, 32)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it("тесно — через одну, первая и последняя всегда видны", () => {
    const labels = ["янв 22", "июл 22", "янв 23", "июл 23", "янв 24", "июл 24", "янв 25"];
    expect(xLabelIndices(labels, 100, 32)).toEqual([0, 2, 4, 6]);
  });
  it("последняя слишком близко к предыдущей видимой — предыдущая скрывается", () => {
    const labels = ["a 2020", "b 2021", "c 2022", "d 2023", "e 2024", "f 2025"];
    const shown = xLabelIndices(labels, 100, 32);
    expect(shown[0]).toBe(0);
    expect(shown.at(-1)).toBe(5);
    for (let i = 1; i < shown.length; i++) expect((shown[i]! - shown[i - 1]!) * 100).toBeGreaterThanOrEqual(6 * 0.56 * 32);
  });
});
