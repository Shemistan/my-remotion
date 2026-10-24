// Task 28: детектор пауз.
import { describe, expect, it } from "vitest";
import { snapUsToFrame } from "@ms/contracts";
import { ROUGHCUT_DEFAULTS } from "../../src/config.js";
import { detectPauses, loudIn } from "../../src/edit/detect-pauses.js";
import { F30, w } from "./helpers.js";

const R = ROUGHCUT_DEFAULTS;
const NTSC = { num: 30000, den: 1001 };

/** Тихая waveform на `us` (вёдра по 10 мс). */
const quiet = (us = 3_000_000) => new Int8Array(2 * Math.ceil(us / 10_000));
/** Громко (≈ −6 dBFS) в `[a, b)`. */
function loudBetween(a: number, b: number, us = 3_000_000): Int8Array {
  const p = quiet(us);
  for (let k = Math.floor(a / 10_000); k < Math.ceil(b / 10_000); k++) {
    p[2 * k] = -64;
    p[2 * k + 1] = 64;
  }
  return p;
}

describe("detectPauses", () => {
  it("пауза между словами: поля после слова и перед следующим, уверенность по длине", () => {
    expect(detectPauses([w("w_000001", "текст", 0, 1_000_000), w("w_000002", "дальше", 2_600_000, 3_000_000)], quiet(), R, F30)[0])
      .toMatchObject({ reason: "pause", origin: "detector", status: "proposed", source_start_us: 1_100_000, source_end_us: 2_500_000, confidence: 0.9, explanation: "пауза 1,6 с между словами" });
    // конец предложения — поле больше
    expect(detectPauses([w("w_000001", "текст.", 0, 1_000_000), w("w_000002", "дальше", 2_600_000, 3_000_000)], quiet(), R, F30)[0])
      .toMatchObject({ source_start_us: 1_300_000, source_end_us: 2_500_000 });
    // короче pauseMinUs — не пауза
    expect(detectPauses([w("w_000001", "x", 0, 1_000_000), w("w_000002", "y", 1_700_000, 2_000_000)], quiet(2_000_000), R, F30)).toEqual([]);
    // 0,8…1,5 с — уверенность 0.7
    expect(detectPauses([w("w_000001", "x", 0, 1_000_000), w("w_000002", "y", 2_000_000, 2_300_000)], quiet(2_300_000), R, F30)[0]?.confidence).toBe(0.7);
  });

  it("звук громче порога дольше 200 мс — не резать; короткий щелчок — резать", () => {
    const words = [w("w_000001", "текст", 0, 1_000_000), w("w_000002", "дальше", 2_600_000, 3_000_000)];
    expect(detectPauses(words, loudBetween(1_200_000, 1_600_000), R, F30)).toEqual([]);
    expect(detectPauses(words, loudBetween(1_500_000, 1_600_000), R, F30)).toHaveLength(1);
    expect(loudIn(loudBetween(0, 190_000), 0, 1_000_000, -30)).toBe(false);
    expect(loudIn(loudBetween(0, 210_000), 0, 1_000_000, -30)).toBe(true);
  });

  it("нулевые паузы whisper, перекрытия и слова нулевой длины не дают вырезок", () => {
    const words = [
      w("w_000001", "а", 0, 500_000), w("w_000002", "б", 500_000, 900_000), // нулевая пауза
      w("w_000003", "в", 800_000, 1_000_000), // перекрытие
      w("w_000004", "г", 1_000_000, 1_000_000), // нулевая длина
      w("w_000005", "д", 1_000_000, 1_400_000),
    ];
    expect(detectPauses(words, quiet(1_400_000), R, F30, { sourceDurationUs: 1_400_000 })).toEqual([]);
  });

  it("слово внутри предыдущего не сдвигает конец речи назад", () => {
    const words = [w("w_000001", "долгое", 0, 2_000_000), w("w_000002", "вложенное", 500_000, 700_000), w("w_000003", "дальше", 2_200_000, 2_500_000)];
    expect(detectPauses(words, quiet(2_500_000), R, F30, { sourceDurationUs: 2_500_000 })).toEqual([]);
  });

  it("края записи: тишина до первого слова и после последнего — вырезки от 0 и до конца исходника", () => {
    const words = [w("w_000001", "начало", 2_000_000, 2_500_000), w("w_000002", "конец.", 2_600_000, 3_000_000)];
    const p = detectPauses(words, quiet(5_010_000), R, F30, { sourceDurationUs: 5_010_000 });
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ source_start_us: 0, source_end_us: 1_900_000 });
    // конец исходника не на кадре — не выравнивается, доходит до конца
    expect(p[1]).toMatchObject({ source_start_us: 3_300_000, source_end_us: 5_010_000 });
    // без слов — ничего
    expect(detectPauses([], quiet(), R, F30)).toEqual([]);
    // короткие края не режутся
    expect(detectPauses([w("w_000001", "x", 300_000, 900_000)], quiet(1_200_000), R, F30, { sourceDurationUs: 1_200_000 })).toEqual([]);
  });

  it("границы — на кадрах (NTSC), id уникальны", () => {
    const words = [w("w_000001", "a", 0, 1_000_000), w("w_000002", "b", 2_600_000, 3_000_000), w("w_000003", "c", 5_000_000, 5_300_000)];
    const p = detectPauses(words, quiet(5_300_000), R, NTSC, { sourceDurationUs: 5_300_000, idPrefix: "pau_r1_" });
    expect(p.map((x) => x.id)).toEqual(["pau_r1_1", "pau_r1_2"]);
    for (const x of p) {
      expect(snapUsToFrame(x.source_start_us, NTSC)).toBe(x.source_start_us);
      expect(snapUsToFrame(x.source_end_us, NTSC)).toBe(x.source_end_us);
    }
  });
});

describe("detectPauses: звук во всём промежутке (ревью Task 28, M2)", () => {
  it("звук 1,0–1,25 с у края паузы (вне вырезки 1,1…) — промежуток не тих, не резать", () => {
    const words = [w("w_000001", "a", 0, 1_000_000), w("w_000002", "b", 3_000_000, 3_300_000)];
    expect(detectPauses(words, loudBetween(1_000_000, 1_250_000, 3_400_000), R, F30, { sourceDurationUs: 3_400_000 })).toEqual([]);
    // у правого края — так же
    expect(detectPauses(words, loudBetween(2_750_000, 3_000_000, 3_400_000), R, F30, { sourceDurationUs: 3_400_000 })).toEqual([]);
    // короче 200 мс у края — режется
    expect(detectPauses(words, loudBetween(1_000_000, 1_150_000, 3_400_000), R, F30, { sourceDurationUs: 3_400_000 })).toHaveLength(1);
  });
});
