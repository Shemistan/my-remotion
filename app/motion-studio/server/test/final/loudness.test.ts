// Task 44: разбор сводок ebur128 и astats (без ffmpeg).
import { describe, expect, it } from "vitest";
import { SILENCE_DB, parseLoudness } from "../../src/final/loudness.js";

const out = (i: string, peak: string) => `[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         ${i} LUFS\n    Threshold: -39.8 LUFS\n` +
  `[Parsed_astats_1 @ 0x2] Overall\n[Parsed_astats_1 @ 0x2] Peak level dB: ${peak}\n`;

describe("parseLoudness", () => {
  it("I и пик", () => {
    expect(parseLoudness(out("-29.8", "-14.050144"))).toEqual({ lufs: -29.8, peak_db: -14.05 });
  });
  it("тишина — конечное число", () => {
    expect(parseLoudness(out("-70.0", "-inf"))).toEqual({ lufs: -70, peak_db: SILENCE_DB });
  });
  it("нет сводки — ошибка", () => {
    expect(() => parseLoudness("ничего")).toThrow(/loudness/);
  });
});
