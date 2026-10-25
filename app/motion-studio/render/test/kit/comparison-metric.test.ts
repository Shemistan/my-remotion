// ComparisonSplit 0.5.6 (S15a): графика стороны — мини-метр value / max (подготовка к one-hero).
import { describe, expect, it } from "vitest";
import { metricShare } from "../../src/motion-kit/components/ComparisonSplit.js";

describe("metricShare", () => {
  it("доля value / max в [0; 1]; max ≤ 0 и NaN — 0", () => {
    expect(metricShare({ value: 3, max: 4 })).toBe(0.75);
    expect(metricShare({ value: 9, max: 4 })).toBe(1);
    expect(metricShare({ value: -1, max: 4 })).toBe(0);
    expect(metricShare({ value: 1, max: 0 })).toBe(0);
    expect(metricShare({ value: Number.NaN, max: 4 })).toBe(0);
  });
});
