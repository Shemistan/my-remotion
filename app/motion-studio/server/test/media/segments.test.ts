// Task 26: сегменты транскрипта по паузам и концам предложений.
import type { TranscriptWord } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { SEGMENT_DEFAULTS, buildSegments } from "../../src/media/segments.js";

let n = 0;
const w = (text: string, start_us: number, end_us: number): TranscriptWord => ({
  id: `w_${String(++n).padStart(6, "0")}`, text, start_us, end_us, timing: "asr", confidence: null,
});

describe("buildSegments", () => {
  it("разрыв по паузе ≥ 700 мс или после [.?!…] при паузе ≥ 250 мс", () => {
    n = 0;
    const segs = buildSegments([w("a", 0, 300_000), w("конец.", 400_000, 800_000), w("c", 1_100_000, 1_400_000), w("d", 2_500_000, 2_900_000)], SEGMENT_DEFAULTS);
    expect(segs.map((s) => s.word_ids.length)).toEqual([2, 1, 1]);
    expect(segs[0]).toEqual({ id: "seg_0001", word_ids: ["w_000001", "w_000002"], start_us: 0, end_us: 800_000 });
    expect(segs.map((s) => s.id)).toEqual(["seg_0001", "seg_0002", "seg_0003"]);
  });

  it("точка без паузы и короткая пауза без точки — без разрыва; «…», «?» и кавычка после точки — разрыв", () => {
    n = 0;
    const segs = buildSegments([
      w("т.е.", 0, 200_000), w("дальше", 250_000, 500_000), w("так", 700_000, 900_000), w("ли?»", 950_000, 1_200_000), w("да…", 1_500_000, 1_800_000), w("ну", 2_100_000, 2_300_000),
    ], SEGMENT_DEFAULTS);
    expect(segs.map((s) => s.word_ids.length)).toEqual([4, 1, 1]);
  });

  it("сегмент длиннее maxUs делится по наибольшей паузе внутри (рекурсивно)", () => {
    n = 0;
    const words = Array.from({ length: 40 }, (_, i) => w(`с${i}`, i * 600_000 + (i >= 25 ? 200_000 : 0) + (i >= 10 ? 100_000 : 0), i * 600_000 + (i >= 25 ? 200_000 : 0) + (i >= 10 ? 100_000 : 0) + 500_000));
    const segs = buildSegments(words, SEGMENT_DEFAULTS);
    for (const s of segs) expect(s.end_us - s.start_us).toBeLessThanOrEqual(12_000_000);
    expect(segs.flatMap((s) => s.word_ids)).toEqual(words.map((x) => x.id));
    // 24 с: сначала наибольшая пауза (перед 25-м словом), левая часть 15 с — ещё раз (перед 10-м)
    expect(segs.map((s) => s.word_ids.length)).toEqual([10, 15, 15]);
  });

  it("одно длинное слово и пустой список", () => {
    n = 0;
    expect(buildSegments([w("ааа", 0, 20_000_000)], SEGMENT_DEFAULTS)).toHaveLength(1);
    expect(buildSegments([], SEGMENT_DEFAULTS)).toEqual([]);
  });
});
