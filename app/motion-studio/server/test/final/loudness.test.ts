// Task 44: разбор сводки ebur128 — интегральная громкость и true peak (без ffmpeg).
import { describe, expect, it } from "vitest";
import { SILENCE_DB, parseLoudness } from "../../src/final/loudness.js";

const out = (i: string, peak: string) => `[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         ${i} LUFS\n    Threshold: -39.8 LUFS\n\n` +
  `  Loudness range:\n    LRA:         0.6 LU\n\n  True peak:\n    Peak:      ${peak} dBFS\n`;

describe("parseLoudness", () => {
  it("I и true peak", () => {
    expect(parseLoudness(out("-29.8", "-13.9"))).toEqual({ lufs: -29.8, peak_db: -13.9 });
    expect(parseLoudness(out("-12.0", "0.4"))).toEqual({ lufs: -12, peak_db: 0.4 });
  });
  it("тишина — конечное число", () => {
    expect(parseLoudness(out("-70.0", "-inf"))).toEqual({ lufs: -70, peak_db: SILENCE_DB });
  });
  it("нет сводки true peak — ошибка", () => {
    expect(() => parseLoudness("ничего")).toThrow(/loudness/);
    expect(() => parseLoudness("    I:         -23.0 LUFS\n")).toThrow(/loudness/);
  });
});
