// Task 26: сегменты транскрипта по паузам и концам предложений.
import { readFileSync } from "node:fs";
import type { TranscriptWord } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { toTranscriptWords } from "../../src/media/asr-contract.js";
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

  // ревью Task 26, I1: whisper внутри фразы даёт паузы 0,0 — деление не должно отщипывать по слову
  const lens = (ws: TranscriptWord[]) => buildSegments(ws, SEGMENT_DEFAULTS).map((s) => s.end_us - s.start_us);

  it("нулевые паузы на 60 с: куски ≤ 12 с и ≥ 3 с, граница — ближе к середине", () => {
    n = 0;
    const ws = Array.from({ length: 200 }, (_, i) => w("x", i * 300_000, (i + 1) * 300_000));
    const segs = buildSegments(ws, SEGMENT_DEFAULTS);
    expect(segs.flatMap((s) => s.word_ids)).toEqual(ws.map((x) => x.id));
    for (const d of lens(ws)) {
      expect(d).toBeLessThanOrEqual(12_000_000);
      expect(d).toBeGreaterThanOrEqual(3_000_000);
    }
    // 60 → 30 + 30 → по 15 → по 7,5 с
    expect(segs.map((s) => s.word_ids.length)).toEqual(Array(8).fill(25));
  });

  it("реальный вывод воркера с паузами, сжатыми до 0,1 с: куски ≤ 12 с и ≥ 3 с", () => {
    const real = toTranscriptWords(JSON.parse(readFileSync(new URL("../fixtures/asr/words-real-ru.json", import.meta.url), "utf8")));
    let shift = 0;
    const fast = real.map((x, i) => {
      if (i > 0) {
        const gap = x.start_us - real[i - 1]!.end_us;
        if (gap > 100_000) shift += gap - 100_000;
      }
      return { ...x, start_us: x.start_us - shift, end_us: x.end_us - shift };
    });
    expect(fast.at(-1)!.end_us - fast[0]!.start_us).toBeGreaterThan(12_000_000);
    const segs = buildSegments(fast, SEGMENT_DEFAULTS);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    for (const d of lens(fast)) {
      expect(d).toBeLessThanOrEqual(12_000_000);
      expect(d).toBeGreaterThanOrEqual(3_000_000);
    }
  });

  it("20 000 слов без пауз — без переполнения стека, каждое слово в одном куске", () => {
    n = 0;
    const ws = Array.from({ length: 20_000 }, (_, i) => w("x", i * 300_000, (i + 1) * 300_000));
    const segs = buildSegments(ws, SEGMENT_DEFAULTS);
    expect(segs.flatMap((s) => s.word_ids)).toEqual(ws.map((x) => x.id));
    for (const s of segs) expect(s.end_us - s.start_us).toBeLessThanOrEqual(12_000_000);
    expect(Math.min(...segs.map((s) => s.end_us - s.start_us))).toBeGreaterThanOrEqual(3_000_000);
  });

  it("наибольшая пауза у края куска не даёт обрезка короче maxUs/4, если есть другая граница", () => {
    n = 0;
    // 20 с, пауза 0,3 с после первого слова, остальные 0,05 с
    const ws = Array.from({ length: 40 }, (_, i) => w("x", i * 500_000 + (i >= 1 ? 250_000 : 0), i * 500_000 + 450_000 + (i >= 1 ? 250_000 : 0)));
    for (const d of lens(ws)) expect(d).toBeGreaterThanOrEqual(3_000_000);
  });
});

