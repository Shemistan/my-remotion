// lineChartHead: один источник движения для графика и привязанного к нему счётчика.
import { describe, expect, it } from "vitest";
import { lineChartHead } from "../../src/motion-kit/components/LineChart.js";

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
