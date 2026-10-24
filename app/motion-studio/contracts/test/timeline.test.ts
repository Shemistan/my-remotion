import { describe, expect, it } from "vitest";
import {
  TimelineError, buildTimeline, checkHeardRange, editedToSource, frameToUs, mapRange, mapWords, rangeFromWords, sourceToEdited, usToFrame,
} from "../src/index.js";
import { F30, NTSC, w, words59 } from "./video-fixtures.js";

const tl = buildTimeline(10_000_000, [{ start_us: 7_000_000, end_us: 7_500_000 }, { start_us: 2_000_000, end_us: 3_500_000 }], F30);

describe("buildTimeline", () => {
  it("сортирует вырезки и строит клипы", () => {
    expect(tl.clips).toEqual([
      { idx: 0, source_start_us: 0, source_end_us: 2_000_000, edited_start_us: 0 },
      { idx: 1, source_start_us: 3_500_000, source_end_us: 7_000_000, edited_start_us: 2_000_000 },
      { idx: 2, source_start_us: 7_500_000, source_end_us: 10_000_000, edited_start_us: 5_500_000 }]);
    expect(tl.duration_us).toBe(8_000_000);
    expect(tl.source_duration_us).toBe(10_000_000);
    expect(tl.fps).toEqual(F30);
  });

  it("сливает пересечения и выравнивает по кадрам", () => {
    expect(buildTimeline(10_000_000, [{ start_us: 3_000_000, end_us: 4_000_000 }, { start_us: 3_500_000, end_us: 5_000_000 }], F30).clips[1]!.source_start_us).toBe(5_000_000);
    expect(buildTimeline(10_000_000, [{ start_us: 1_010_000, end_us: 1_990_000 }], F30).clips[1]!.source_start_us).toBe(2_000_000);
    // соприкасающиеся вырезки — одна
    expect(buildTimeline(10_000_000, [{ start_us: 1_000_000, end_us: 2_000_000 }, { start_us: 2_000_000, end_us: 3_000_000 }], F30).clips)
      .toEqual([
        { idx: 0, source_start_us: 0, source_end_us: 1_000_000, edited_start_us: 0 },
        { idx: 1, source_start_us: 3_000_000, source_end_us: 10_000_000, edited_start_us: 1_000_000 }]);
  });

  it("без вырезок и с пустыми вырезками — один клип на весь исходник", () => {
    const whole = [{ idx: 0, source_start_us: 0, source_end_us: 10_000_000, edited_start_us: 0 }];
    expect(buildTimeline(10_000_000, [], F30).clips).toEqual(whole);
    expect(buildTimeline(10_000_000, [{ start_us: 4_000_000, end_us: 4_000_000 }], F30).clips).toEqual(whole);
    // после выравнивания вырезка короче кадра схлопывается
    expect(buildTimeline(10_000_000, [{ start_us: 4_000_000, end_us: 4_010_000 }], F30).clips).toEqual(whole);
    expect(buildTimeline(10_000_000, [], F30).duration_us).toBe(10_000_000);
  });

  it("вырезка от 0 и до конца", () => {
    const t = buildTimeline(10_000_000, [{ start_us: 0, end_us: 1_000_000 }, { start_us: 9_000_000, end_us: 10_000_000 }], F30);
    expect(t.clips).toEqual([{ idx: 0, source_start_us: 1_000_000, source_end_us: 9_000_000, edited_start_us: 0 }]);
    expect(t.duration_us).toBe(8_000_000);
    // конец исходника не на кадре: вырезка «до конца» после выравнивания не выходит за исходник
    const odd = buildTimeline(10_012_345, [{ start_us: 9_990_000, end_us: 10_012_345 }], F30);
    expect(odd.clips).toEqual([{ idx: 0, source_start_us: 0, source_end_us: 10_000_000, edited_start_us: 0 }]);
    const all = buildTimeline(10_000_000, [{ start_us: 0, end_us: 10_000_000 }], F30);
    expect(all.clips).toEqual([]);
    expect(all.duration_us).toBe(0);
  });

  it("NTSC: границы на кадрах 30000/1001", () => {
    const t = buildTimeline(60_000_000, [{ start_us: 10_000_000, end_us: 12_000_000 }], NTSC);
    for (const c of t.clips) {
      for (const us of [c.source_start_us, c.edited_start_us]) expect(frameToUs(usToFrame(us, NTSC), NTSC)).toBe(us);
    }
    expect(t.clips[0]!.source_end_us).toBe(10_010_000); // кадр 300
    expect(t.clips[1]!.source_start_us).toBe(12_012_000); // кадр 360
    expect(t.duration_us).toBe(60_000_000 - 2_002_000);
  });

  it("отвергает неверные входы", () => {
    expect(() => buildTimeline(10_000_000, [{ start_us: 5, end_us: 4 }], F30)).toThrow(RangeError);
    expect(() => buildTimeline(-1, [], F30)).toThrow(RangeError);
    expect(() => buildTimeline(10, [{ start_us: -1, end_us: 4 }], F30)).toThrow(RangeError);
  });
});

describe("source ↔ edited", () => {
  it("точки в клипах и в вырезках", () => {
    expect(sourceToEdited(tl, 4_000_000)).toEqual({ inCut: false, us: 2_500_000 });
    expect(sourceToEdited(tl, 3_000_000)).toEqual({ inCut: true, us: 2_000_000 });
    expect(sourceToEdited(tl, 2_000_000)).toEqual({ inCut: true, us: 2_000_000 });
    expect(sourceToEdited(tl, 3_500_000)).toEqual({ inCut: false, us: 2_000_000 });
    expect(sourceToEdited(tl, 10_000_000)).toEqual({ inCut: false, us: 8_000_000 });
    expect(editedToSource(tl, 5_500_000)).toBe(7_500_000);
    expect(editedToSource(tl, 1_999_999)).toBe(1_999_999);
    expect(editedToSource(tl, 2_000_000)).toBe(3_500_000);
    expect(editedToSource(tl, 8_000_000)).toBe(10_000_000);
    expect(() => sourceToEdited(tl, 10_000_001)).toThrow(RangeError);
    expect(() => editedToSource(tl, 8_000_001)).toThrow(RangeError);
  });

  it("туда и обратно без потерь для оставленных точек", () => {
    for (const us of [0, 1_234_567, 3_500_000, 6_999_999, 9_999_999]) {
      expect(editedToSource(tl, (sourceToEdited(tl, us) as { us: number }).us)).toBe(us);
    }
    for (let us = 0; us < 8_000_000; us += 33_333) expect((sourceToEdited(tl, editedToSource(tl, us))).us).toBe(us);
  });

  it("вырезка от 0: начало исходника — в склейке на 0", () => {
    const t = buildTimeline(10_000_000, [{ start_us: 0, end_us: 1_000_000 }], F30);
    expect(sourceToEdited(t, 0)).toEqual({ inCut: true, us: 0 });
    expect(sourceToEdited(t, 999_999)).toEqual({ inCut: true, us: 0 });
    expect(editedToSource(t, 0)).toBe(1_000_000);
  });

  it("вырезка до конца: склейка — конец edited", () => {
    const t = buildTimeline(10_000_000, [{ start_us: 9_000_000, end_us: 10_000_000 }], F30);
    expect(sourceToEdited(t, 9_500_000)).toEqual({ inCut: true, us: 9_000_000 });
    expect(sourceToEdited(t, 10_000_000)).toEqual({ inCut: true, us: 9_000_000 });
    expect(editedToSource(t, 9_000_000)).toBe(9_000_000);
  });

  it("всё вырезано", () => {
    const t = buildTimeline(10_000_000, [{ start_us: 0, end_us: 10_000_000 }], F30);
    expect(sourceToEdited(t, 5_000_000)).toEqual({ inCut: true, us: 0 });
    expect(mapRange(t, { start_us: 1, end_us: 2 })).toBeNull();
  });
});

describe("mapRange / mapWords", () => {
  it("слова: целиком, частично, вырезаны", () => {
    expect(mapWords(tl, [w("w3", 3_400_000, 3_700_000), w("w4", 2_100_000, 2_400_000)])).toEqual({
      w3: { state: "clipped", edited_start_us: 2_000_000, edited_end_us: 2_200_000 }, w4: { state: "removed" } });
    expect(mapWords(tl, [w("w1", 500_000, 800_000)])).toEqual({ w1: { state: "kept", edited_start_us: 500_000, edited_end_us: 800_000 } });
  });

  it("слова на границе склейки", () => {
    const m = mapWords(tl, [
      w("a", 1_700_000, 2_000_000), // кончается ровно на начале вырезки — целиком оставлено
      w("b", 3_500_000, 3_800_000), // начинается ровно на конце вырезки — целиком оставлено
      w("c", 1_900_000, 2_100_000), // заходит в вырезку
      w("d", 2_000_000, 3_500_000), // совпадает с вырезкой
      w("e", 6_700_000, 7_800_000), // вырезка внутри слова: осталось 0,6 из 1,1 с
    ]);
    expect(m.a).toEqual({ state: "kept", edited_start_us: 1_700_000, edited_end_us: 2_000_000 });
    expect(m.b).toEqual({ state: "kept", edited_start_us: 2_000_000, edited_end_us: 2_300_000 });
    expect(m.c).toEqual({ state: "clipped", edited_start_us: 1_900_000, edited_end_us: 2_000_000 });
    expect(m.d).toEqual({ state: "removed" });
    expect(m.e).toEqual({ state: "clipped", edited_start_us: 5_200_000, edited_end_us: 5_800_000 });
  });

  it("слово целиком за концом исходника — removed", () => {
    expect(mapWords(tl, [w("x", 10_100_000, 10_300_000), w("e", 10_000_000, 10_200_000), w("p", 10_500_000, 10_500_000)])).toEqual({
      x: { state: "removed" }, e: { state: "removed" }, p: { state: "removed" } });
    expect(mapRange(tl, { start_us: 10_100_000, end_us: 10_300_000 })).toBeNull();
    expect(mapWords(tl, [w("z", 10_000_000, 10_000_000)])).toEqual({ z: { state: "kept", edited_start_us: 8_000_000, edited_end_us: 8_000_000 } });
  });

  it("остаток слова меньше половины его длины или не длиннее кадра — removed", () => {
    // вырезка 2,0–3,5 с, кадр 30 fps = 33 333 мкс
    expect(mapWords(tl, [
      w("strip", 1_980_000, 2_300_000), // остаток 20 мс ≤ кадра
      w("frame", 1_966_667, 2_100_000), // остаток ровно кадр
      w("half", 1_850_000, 2_200_000), // остаток 150 из 350 мс < половины
      w("tail", 3_480_000, 3_520_000), // остаток 20 мс из 40 (= половина), но ≤ кадра
      w("short", 1_990_000, 2_000_000), // целиком оставлено, хоть и короче кадра — kept
    ])).toEqual({
      strip: { state: "removed" }, frame: { state: "removed" }, half: { state: "removed" }, tail: { state: "removed" },
      short: { state: "kept", edited_start_us: 1_990_000, edited_end_us: 2_000_000 } });
    // половина ровно и больше кадра — clipped
    expect(mapWords(tl, [w("h", 1_800_000, 2_200_000)])).toEqual({ h: { state: "clipped", edited_start_us: 1_800_000, edited_end_us: 2_000_000 } });
  });

  it("слово нулевой длительности", () => {
    expect(mapWords(tl, [w("z", 1_000_000, 1_000_000), w("y", 3_000_000, 3_000_000)])).toEqual({
      z: { state: "kept", edited_start_us: 1_000_000, edited_end_us: 1_000_000 }, y: { state: "removed" } });
  });

  it("mapRange через вырезку и за концом исходника", () => {
    expect(mapRange(tl, { start_us: 1_000_000, end_us: 4_000_000 })).toEqual({ start_us: 1_000_000, end_us: 2_500_000 });
    expect(mapRange(tl, { start_us: 2_100_000, end_us: 3_400_000 })).toBeNull();
    expect(mapRange(tl, { start_us: 9_900_000, end_us: 10_050_000 })).toEqual({ start_us: 7_900_000, end_us: 8_000_000 });
    expect(() => mapRange(tl, { start_us: 5, end_us: 4 })).toThrow(RangeError);
  });

  it("восстановление вырезки: таймлайн байт-в-байт как до неё", () => {
    const before = buildTimeline(10_000_000, [{ start_us: 7_000_000, end_us: 7_500_000 }], F30);
    const cut = buildTimeline(10_000_000, [{ start_us: 7_000_000, end_us: 7_500_000 }, { start_us: 2_000_000, end_us: 3_500_000 }], F30);
    const restored = buildTimeline(10_000_000, [{ start_us: 7_000_000, end_us: 7_500_000 }], F30);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(before));
    expect(JSON.stringify(cut)).not.toBe(JSON.stringify(before));
  });
});

describe("rangeFromWords", () => {
  it("диапазон по словам с полями: edited, source, кадры", () => {
    const r = rangeFromWords(tl, words59(), "w5", "w9", { preUs: 200_000, postUs: 300_000 });
    expect(r).toEqual({ edited: { start_us: 2_300_000, end_us: 4_800_000 }, source: { start_us: 3_800_000, end_us: 6_300_000 }, frames: { start: 69, end: 144 } });
  });

  it("поля не выходят за начало и конец edited", () => {
    const words = [w("a", 100_000, 400_000), w("b", 9_700_000, 9_900_000)];
    const r = rangeFromWords(tl, words, "a", "b", { preUs: 500_000, postUs: 500_000 });
    expect(r.edited).toEqual({ start_us: 0, end_us: 8_000_000 });
    expect(r.source).toEqual({ start_us: 0, end_us: 10_000_000 });
    expect(r.frames).toEqual({ start: 0, end: 240 });
  });

  it("конец слова ровно на склейке — конец предыдущего клипа, не начало следующего", () => {
    const r = rangeFromWords(tl, [w("a", 6_500_000, 7_000_000)], "a", "a", { preUs: 0, postUs: 0 });
    expect(r.source).toEqual({ start_us: 6_500_000, end_us: 7_000_000 });
    expect(r.edited).toEqual({ start_us: 5_000_000, end_us: 5_500_000 });
  });

  it("ошибки: неизвестное слово, порядок, якорь в вырезке", () => {
    const words = [w("a", 500_000, 800_000), w("cut", 2_500_000, 2_800_000), w("b", 4_000_000, 4_300_000)];
    const code = (f: () => unknown): string | undefined => {
      try { f(); } catch (e) { return e instanceof TimelineError ? e.code : "other"; }
      return undefined;
    };
    const pad = { preUs: 0, postUs: 0 };
    expect(code(() => rangeFromWords(tl, words, "x", "b", pad))).toBe("unknown_word");
    expect(code(() => rangeFromWords(tl, words, "b", "a", pad))).toBe("order");
    // порядок в массиве верный, но конец раньше начала — тоже order, не TypeError
    const swapped = [w("p", 5_000_000, 5_300_000), w("q", 1_000_000, 1_200_000)];
    expect(code(() => rangeFromWords(tl, swapped, "p", "q", pad))).toBe("order");
    expect(code(() => rangeFromWords(tl, words, "cut", "b", pad))).toBe("anchor_in_cut");
    expect(code(() => rangeFromWords(tl, words, "a", "cut", pad))).toBe("anchor_in_cut");
    // вырезанное слово в середине диапазона — допустимо
    expect(rangeFromWords(tl, words, "a", "b", pad).edited).toEqual({ start_us: 500_000, end_us: 2_800_000 });
  });

  it("NTSC: кадры диапазона покрывают edited", () => {
    const t = buildTimeline(60_000_000, [{ start_us: 10_000_000, end_us: 12_000_000 }], NTSC);
    const r = rangeFromWords(t, [w("a", 12_500_000, 13_000_000)], "a", "a", { preUs: 0, postUs: 0 });
    expect(frameToUs(r.frames.start, NTSC)).toBeLessThanOrEqual(r.edited.start_us);
    expect(frameToUs(r.frames.end, NTSC)).toBeGreaterThanOrEqual(r.edited.end_us);
    expect(r.frames.end - r.frames.start).toBeGreaterThanOrEqual(15);
  });
});

describe("checkHeardRange: цитата = то, что слышит зритель", () => {
  // 5 слов по 1 с; вырезка 2,0–3,4 с: «эээ» (2,0–2,9) — целиком, «покажем,» (3,0–3,9) — частично (0,5 из 0,9 с)
  const ws5 = ["Сегодня", "мы", "эээ", "покажем,", "рост"].map((t, i) => w(`w${i + 1}`, i * 1_000_000, i * 1_000_000 + 900_000, t));
  const map = mapWords(buildTimeline(5_000_000, [{ start_us: 2_000_000, end_us: 3_400_000 }], F30), ws5);

  it("оставленные слова диапазона — ok; вырезанное внутри диапазона без цитаты его — ok", () => {
    expect(checkHeardRange(ws5, map, "w1", "w2", "Сегодня мы")).toEqual({ ok: true });
    expect(checkHeardRange(ws5, map, "w2", "w4", "мы покажем")).toEqual({ ok: true });
    expect(checkHeardRange(ws5, map, "w4", "w5", "покажем рост")).toEqual({ ok: true }); // clipped — обычное слово
  });

  it("цитата с вырезанным словом → anchor_in_cut; граничное слово вырезано → anchor_in_cut", () => {
    expect(checkHeardRange(ws5, map, "w2", "w4", "мы эээ покажем")).toMatchObject({ ok: false, code: "anchor_in_cut" });
    expect(checkHeardRange(ws5, map, "w3", "w4", "эээ покажем")).toMatchObject({ ok: false, code: "anchor_in_cut" });
    expect(checkHeardRange(ws5, map, "w1", "w3", "Сегодня мы")).toMatchObject({ ok: false, code: "anchor_in_cut" });
  });

  it("не та цитата → quote_mismatch; нет слова → unknown_word; обратный порядок → order; слова нет в wordMap — вырезано", () => {
    expect(checkHeardRange(ws5, map, "w1", "w2", "вчера мы")).toMatchObject({ ok: false, code: "quote_mismatch" });
    expect(checkHeardRange(ws5, map, "w1", "w9", "Сегодня")).toMatchObject({ ok: false, code: "unknown_word" });
    expect(checkHeardRange(ws5, map, "w2", "w1", "мы Сегодня")).toMatchObject({ ok: false, code: "order" });
    expect(checkHeardRange(ws5, { ...map, w1: undefined }, "w1", "w2", "Сегодня мы")).toMatchObject({ ok: false, code: "anchor_in_cut" });
  });

  it("без цитаты — только диапазон (главы, спорное)", () => {
    expect(checkHeardRange(ws5, map, "w1", "w5")).toEqual({ ok: true });
    expect(checkHeardRange(ws5, map, "w3", "w5")).toMatchObject({ ok: false, code: "anchor_in_cut" });
  });
});
