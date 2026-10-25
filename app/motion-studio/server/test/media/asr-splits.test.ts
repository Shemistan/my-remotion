// Task 26: разрезы звука для воркера ASR (в тишине, кусок ≤ 290 с) и разбор silencedetect.
import { describe, expect, it } from "vitest";
import { chooseSplits, parseSilencedetect } from "../../src/media/asr-splits.js";

describe("chooseSplits", () => {
  it("середина самой поздней тишины во второй половине окна; нет тишины — равные куски; короткий звук — без разрезов", () => {
    expect(chooseSplits([{ start_s: 100, end_s: 101 }, { start_s: 280, end_s: 282 }, { start_s: 400, end_s: 400.5 }, { start_s: 560, end_s: 563 }], 700)).toEqual([281, 561.5]);
    // ревью Task 26 (m2): жёсткие разрезы — равными частями, не 290 + 290 + 120 (было [290, 580])
    expect(chooseSplits([], 700)).toEqual([233.333, 466.667]);
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
    expect(chooseSplits([{ start_s: 0, end_s: 0.6 }], 400)).toEqual([200]);
  });

  it("незавершённая тишина в конце и мусор не ломают выбор", () => {
    expect(chooseSplits([{ start_s: 250, end_s: Number.NaN }, { start_s: 200, end_s: 201 }], 400)).toEqual([200.5]);
  });
});

describe("chooseSplits: ревью Task 26 (m2)", () => {
  const chunks = (cuts: number[], d: number) => [0, ...cuts, d].slice(1).map((e, i, a) => e - (i ? a[i - 1]! : 0));
  /** Пауза каждые 4 с, как в живой речи. */
  const speech = (d: number) => Array.from({ length: Math.floor(d / 4) }, (_, i) => ({ start_s: i * 4 + 3.5, end_s: i * 4 + 4 }));

  it("тишина только в начале окна (0–3 с) на 400 с — не разрез на 1,5 с, а два равных куска", () => {
    expect(chooseSplits([{ start_s: 0, end_s: 3 }], 400)).toEqual([200]);
  });

  it("тишина ищется только во второй половине окна", () => {
    expect(chooseSplits([{ start_s: 100, end_s: 101 }], 400)).toEqual([200]);
    expect(chooseSplits([{ start_s: 150, end_s: 151 }], 400)).toEqual([150.5]);
  });

  for (const d of [290.6, 581, 580.4]) {
    it(`${d} с: хвост не короче 30 с — последний разрез сдвигается, два последних куска уравниваются`, () => {
      for (const sil of [speech(d), []]) {
        const c = chunks(chooseSplits(sil, d), d);
        expect(c.length).toBe(Math.ceil(d / 290));
        for (const x of c) {
          expect(x).toBeLessThanOrEqual(290);
          expect(x).toBeGreaterThanOrEqual(30);
        }
      }
    });
  }

  it("290,6 с с паузами: разрез в тишине около середины", () => {
    expect(chooseSplits(speech(290.6), 290.6)).toEqual([143.75]);
    expect(chooseSplits([], 290.6)).toEqual([145.3]);
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

  it("экспоненциальная запись времени (ffmpeg печатает 6.25e-05) — не 6,25", () => {
    expect(parseSilencedetect("silence_start: 6.25e-05\nsilence_end: 0.8 | silence_duration: 0.8\n")).toEqual([{ start_s: 6.25e-5, end_s: 0.8 }]);
  });
});
