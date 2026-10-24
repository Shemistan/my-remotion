// `scripts/pick-test-video.mjs` (Task 34 Step 1): выбор ролика по критериям на синтетических
// ответах ffprobe и silencedetect — длительность 45–150 с, есть аудио, речь ≥ 50 %, порядок.
import { describe, expect, it } from "vitest";
import { type Ffprobe, CANDIDATES, evaluate, orientation, pick, silenceSeconds } from "../../../scripts/pick-test-video.mjs";

const probe = (duration: number, o: { audio?: boolean; w?: number; h?: number; rotation?: number } = {}): Ffprobe => ({
  format: { duration: String(duration) },
  streams: [
    { codec_type: "video", width: o.w ?? 2160, height: o.h ?? 3840, ...(o.rotation !== undefined ? { side_data_list: [{ rotation: o.rotation }] } : {}) },
    ...(o.audio === false ? [] : [{ codec_type: "audio" }]),
  ],
});
const silences = (...r: [number, number?][]) =>
  r.map(([s, e]) => `[silencedetect @ 0x1] silence_start: ${s}\n` + (e !== undefined ? `[silencedetect @ 0x1] silence_end: ${e} | silence_duration: ${e - s}\n` : "")).join("");

describe("pick-test-video", () => {
  it("кандидаты — 11 шортсов MyProtocol по порядку", () => {
    expect(CANDIDATES).toHaveLength(11);
    expect(CANDIDATES[0]).toMatch(/MyProtocol-shorts_1\.mov$/);
    expect(CANDIDATES[10]).toMatch(/MyProtocol-shorts_11\.mov$/);
  });

  it("тишина: закрытые интервалы и незакрытая до конца ролика", () => {
    expect(silenceSeconds(silences([0, 2], [10, 11.5]), 60)).toBeCloseTo(3.5, 6);
    expect(silenceSeconds(silences([50]), 60)).toBeCloseTo(10, 6);
    expect(silenceSeconds("", 60)).toBe(0);
  });

  it("ориентация учитывает поворот", () => {
    expect(orientation(2160, 3840)).toBe("portrait");
    expect(orientation(1920, 1080)).toBe("landscape");
    expect(orientation(1920, 1080, -90)).toBe("portrait");
    expect(orientation(1080, 1080)).toBe("square");
  });

  it("критерии: длительность, аудио, доля речи", () => {
    expect(evaluate(probe(60), silences([0, 5])).ok).toBe(true);
    expect(evaluate(probe(44.9), "").reasons[0]).toMatch(/длительность/);
    expect(evaluate(probe(150.1), "").ok).toBe(false);
    expect(evaluate(probe(45), "").ok).toBe(true);
    expect(evaluate(probe(60, { audio: false }), undefined).reasons).toContain("нет аудио");
    const quiet = evaluate(probe(60), silences([0, 31]));
    expect(quiet.ok).toBe(false);
    expect(quiet.speech_ratio).toBeCloseTo(29 / 60, 3);
    expect(quiet.reasons[0]).toMatch(/речь 48 %/);
    expect(evaluate(probe(60), silences([0, 30])).ok).toBe(true); // ровно 50 %
  });

  it("выбирается первый подходящий по порядку", () => {
    const list = [
      { path: "a", ...evaluate(probe(35), "") },
      { path: "b", ...evaluate(probe(60), silences([0, 40])) },
      { path: "c", ...evaluate(probe(90, { w: 1920, h: 1080 }), silences([0, 3])) },
      { path: "d", ...evaluate(probe(70), "") },
    ];
    const p = pick(list);
    expect(p?.path).toBe("c");
    expect(p?.orientation).toBe("landscape");
    expect(pick(list.slice(0, 2))).toBeUndefined();
  });
});
