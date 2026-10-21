import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance } from "../../src/motion-kit/style/contrast.js";

describe("контраст WCAG 2.x", () => {
  it("чёрное на белом — 21, #777 на белом — 4.48 (бриф)", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
  });

  it("симметричен, одинаковые цвета — 1, короткий hex понимается", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#123456", "#abcdef")).toBeCloseTo(contrastRatio("#abcdef", "#123456"), 10);
    expect(contrastRatio("#8b7cff", "#8b7cff")).toBe(1);
  });

  it("relativeLuminance: 0 у чёрного, 1 у белого; не hex — ошибка", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBe(1);
    expect(() => relativeLuminance("tomato")).toThrow(/tomato/);
  });
});
