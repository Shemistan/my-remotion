// Task 26: разрезы звука для воркера ASR (в тишине, кусок ≤ 290 с) и разбор silencedetect.
import { describe, expect, it } from "vitest";
import { chooseSplits, parseSilencedetect } from "../../src/media/asr-splits.js";

describe("chooseSplits", () => {
  it("середина самой поздней тишины в окне; нет тишины — жёсткий разрез; короткий звук — без разрезов", () => {
    expect(chooseSplits([{ start_s: 100, end_s: 101 }, { start_s: 280, end_s: 282 }, { start_s: 400, end_s: 400.5 }, { start_s: 560, end_s: 563 }], 700)).toEqual([281, 561.5]);
    expect(chooseSplits([], 700)).toEqual([290, 580]);
    expect(chooseSplits([], 120)).toEqual([]);
    expect(chooseSplits([], 290)).toEqual([]);
  });

  it("каждый кусок ≤ maxChunkS; тишина у самого начала окна не даёт пустых кусков", () => {
    const sil = Array.from({ length: 50 }, (_, i) => ({ start_s: i * 37, end_s: i * 37 + 0.5 }));
    const cuts = chooseSplits(sil, 1800);
    const edges = [0, ...cuts, 1800];
    for (let i = 1; i < edges.length; i++) {
      expect(edges[i]! - edges[i - 1]!).toBeLessThanOrEqual(290);
      expect(edges[i]! - edges[i - 1]!).toBeGreaterThan(1);
    }
    expect(chooseSplits([{ start_s: 0, end_s: 0.6 }], 400)).toEqual([290]);
  });

  it("незавершённая тишина в конце и мусор не ломают выбор", () => {
    expect(chooseSplits([{ start_s: 250, end_s: Number.NaN }, { start_s: 200, end_s: 201 }], 400)).toEqual([200.5]);
  });
});

describe("parseSilencedetect", () => {
  it("пары silence_start / silence_end из stderr ffmpeg; незакрытая тишина — до конца не дописывается", () => {
    const err = [
      "[silencedetect @ 0x6000] silence_start: 1.234",
      "[silencedetect @ 0x6000] silence_end: 2.5 | silence_duration: 1.266",
      "size=N/A time=00:00:05.00 bitrate=N/A speed= 500x",
      "[silencedetect @ 0x6000] silence_start: -0.01",
      "[silencedetect @ 0x6000] silence_end: 0.6 | silence_duration: 0.61",
      "[silencedetect @ 0x6000] silence_start: 4.9",
    ].join("\n");
    expect(parseSilencedetect(err)).toEqual([{ start_s: 1.234, end_s: 2.5 }, { start_s: 0, end_s: 0.6 }]);
  });
});
