// Task 44: кадры сравнения двух экспортов (без ffmpeg).
import { describe, expect, it } from "vitest";
import { evenFrames } from "../../src/final/compare.js";

describe("evenFrames", () => {
  it("12 середин равных долей; короткий ролик — все кадры", () => {
    expect(evenFrames(240)).toEqual([10, 30, 50, 70, 90, 110, 130, 150, 170, 190, 210, 230]);
    expect(evenFrames(3)).toEqual([0, 1, 2]);
    expect(evenFrames(0)).toEqual([]);
  });
});
