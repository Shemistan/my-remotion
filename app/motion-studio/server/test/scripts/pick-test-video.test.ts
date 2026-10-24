// `scripts/pick-test-video.mjs` (Task 34 Step 1): выбор ролика по критериям на синтетических
// ответах ffprobe, silencedetect и vision-detect — длительность 45–150 с, есть аудио, речь ≥ 50 %,
// лицо на ≥ 90 % кадров, порядок; поиск talking-head отрезка 45–90 с в длинном ролике по скану.
import { describe, expect, it } from "vitest";
import { type Ffprobe, CANDIDATES, LONG_CANDIDATE, evaluate, faceShare, findTalkingHead, hasFace, longestFaceGap, orientation, parseCuts, pick, silenceSeconds } from "../../../scripts/pick-test-video.mjs";

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
    expect(evaluate(probe(60), silences([0, 5]), 1).ok).toBe(true);
    expect(evaluate(probe(44.9), "").reasons[0]).toMatch(/длительность/);
    expect(evaluate(probe(150.1), "").ok).toBe(false);
    expect(evaluate(probe(45), "", 1).ok).toBe(true);
    expect(evaluate(probe(60, { audio: false }), undefined).reasons).toContain("нет аудио");
    const quiet = evaluate(probe(60), silences([0, 31]));
    expect(quiet.ok).toBe(false);
    expect(quiet.speech_ratio).toBeCloseTo(29 / 60, 3);
    expect(quiet.reasons[0]).toMatch(/речь 48 %/);
    expect(evaluate(probe(60), silences([0, 30]), 1).ok).toBe(true); // ровно 50 %
  });

  it("выбирается первый подходящий по порядку", () => {
    const list = [
      { path: "a", ...evaluate(probe(35), "") },
      { path: "b", ...evaluate(probe(60), silences([0, 40])) },
      { path: "c", ...evaluate(probe(90, { w: 1920, h: 1080 }), silences([0, 3]), 0.95) },
      { path: "d", ...evaluate(probe(70), "", 0.5) },
    ];
    const p = pick(list);
    expect(p?.path).toBe("c");
    expect(p?.orientation).toBe("landscape");
    expect(pick(list.slice(0, 2))).toBeUndefined();
  });

  it("лицо (Vision) на ≥ 90 % кадров; мелкое лицо (запись экрана с камерой в углу) не считается", () => {
    const big = { faces: [{ x: 0.4, y: 0.3, w: 0.2, h: 0.25 }] };
    const corner = { faces: [{ x: 0.9, y: 0.05, w: 0.05, h: 0.08 }] }; // 0,4 % кадра
    expect(hasFace(big)).toBe(true);
    expect(hasFace(corner)).toBe(false);
    expect(hasFace({ faces: [], error: "не изображение" })).toBe(false);
    expect(faceShare([...Array(9).fill(big), {}])).toBeCloseTo(0.9, 9);
    expect(faceShare([])).toBe(0);
    expect(evaluate(probe(60), silences([0, 5]), 0.9).ok).toBe(true);
    const inserts = evaluate(probe(60), silences([0, 5]), 0.7); // шортс со вставками B-roll
    expect(inserts.ok).toBe(false);
    expect(inserts.reasons).toContain("лицо на 70 % кадров < 90 %");
    expect(evaluate(probe(60), silences([0, 5])).reasons).toContain("лицо не проверено");
    // 90 % лица, но 3 с подряд без лица — полноэкранная вставка (реальный shorts_3)
    const withInsert = [...Array(10).fill(big), {}, {}, {}, ...Array(17).fill(big)];
    expect(faceShare(withInsert)).toBeCloseTo(0.9, 9);
    expect(longestFaceGap(withInsert)).toBe(3);
    expect(longestFaceGap([big, {}, big, {}, big])).toBe(1);
    expect(evaluate(probe(60), silences([0, 5]), 0.9, 3).reasons).toContain("без лица 3 с подряд > 1 с (вставка)");
    expect(evaluate(probe(60), silences([0, 5]), 0.95, 1).ok).toBe(true);
  });

  it("длинный ролик: первый чистый talking-head отрезок 45–90 с внутри шота (скан раз в секунду + склейки)", () => {
    expect(LONG_CANDIDATE).toMatch(/MyProtocol\.mov$/);
    const scan = (face: (t: number) => boolean, n = 600) => Array.from({ length: n }, (_, t) => ({ t, face: face(t) }));
    const cuts = [299.333, 354.333];
    // шот 1: лицо 0–30 с (короче 45) и 280–299; шот 2: лицо всё время, одиночный пропуск на 320 с
    const a = scan((t) => t <= 30 || (t >= 280 && t !== 320 && t <= 420));
    expect(findTalkingHead(a, cuts, 600)).toEqual({ start_s: 299.833, end_s: 353.5 });
    // два пропуска подряд рвут отрезок: шот 2 распадается на 30 + 22 с → берётся шот 3
    const b = scan((t) => t <= 30 || (t >= 280 && t !== 330 && t !== 331 && t <= 420));
    expect(findTalkingHead(b, cuts, 600)).toEqual({ start_s: 354.833, end_s: 420.5 });
    // длинный чистый шот обрезается до 90 с; лица нет — отрезка нет
    expect(findTalkingHead(scan(() => true, 200), [], 200)).toEqual({ start_s: 0, end_s: 90 });
    expect(findTalkingHead(scan(() => false), cuts, 600)).toBeUndefined();
    expect(parseCuts("[Parsed_metadata_2 @ 0x1] lavfi.scd.time=299.333\nfoo\n[Parsed_metadata_2 @ 0x1] lavfi.scd.time=354.333\n")).toEqual([299.333, 354.333]);
  });
});
