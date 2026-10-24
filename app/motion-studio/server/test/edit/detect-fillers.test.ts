// Task 28: детектор слов-паразитов.
import { describe, expect, it } from "vitest";
import { snapUsToFrame } from "@ms/contracts";
import { ROUGHCUT_DEFAULTS } from "../../src/config.js";
import { detectFillers, isFiller } from "../../src/edit/detect-fillers.js";
import { F30, w } from "./helpers.js";

const R = ROUGHCUT_DEFAULTS;

describe("detectFillers", () => {
  it("«э-э,» — вырезка слова с полями, но не дальше соседей", () => {
    expect(detectFillers([w("w_000001", "мы", 0, 1_000_000), w("w_000002", "э-э,", 1_150_000, 1_450_000), w("w_000003", "начали", 1_800_000, 2_200_000)], R, F30)[0])
      .toMatchObject({ reason: "filler", origin: "detector", source_start_us: 1_100_000, source_end_us: 1_500_000, confidence: 0.85, start_word_id: "w_000002", end_word_id: "w_000002" });
    // соседи вплотную — поля упираются в них
    expect(detectFillers([w("w_000001", "мы", 0, 1_150_000), w("w_000002", "эм", 1_150_000, 1_450_000), w("w_000003", "да", 1_460_000, 2_000_000)], R, F30)[0])
      .toMatchObject({ source_start_us: snap(1_150_000), source_end_us: snap(1_460_000) });
  });

  it("словари: звуки — да, слова со смыслом — нет", () => {
    for (const t of ["э", "Э-э-э…", "ээ,", "эм", "м-м", "мм.", "ам", "хм", "«Э»"]) expect(isFiller(t), t).toBe(true);
    for (const t of ["Ну", "типа", "вот", "как", "это", "мама", "эх", "эмоции", "м2"]) expect(isFiller(t), t).toBe(false);
    expect(detectFillers([w("w_000001", "Ну", 0, 200_000), w("w_000002", "давайте", 300_000, 700_000)], R, F30)).toEqual([]);
    // «5 м» — метры
    expect(detectFillers([w("w_000001", "5", 0, 200_000), w("w_000002", "м", 300_000, 500_000)], R, F30)).toEqual([]);
  });

  it("края записи и слово нулевой длины", () => {
    // первое слово: не раньше 0; последнее — не дальше конца исходника
    const d = detectFillers([w("w_000001", "э", 0, 300_000), w("w_000002", "текст", 600_000, 900_000), w("w_000003", "мм", 1_000_000, 1_190_000)], R, F30, { sourceDurationUs: 1_200_000 });
    expect(d[0]).toMatchObject({ source_start_us: 0, source_end_us: snap(350_000) });
    expect(d[1]).toMatchObject({ source_start_us: snap(950_000), source_end_us: 1_200_000 });
    // нулевая длина вплотную к соседям — пусто, пропуск
    expect(detectFillers([w("w_000001", "а", 0, 500_000), w("w_000002", "э", 500_000, 500_000), w("w_000003", "б", 500_000, 900_000)], R, F30)).toEqual([]);
  });
});

const snap = (us: number) => snapUsToFrame(us, F30);

describe("detectFillers: единицы после числа (ревью Task 28, M1)", () => {
  it("«5 мм», «10 м.», «3,5 ммм» — не паразит; «мм» после слова — паразит", () => {
    expect(detectFillers([w("w_000001", "толщина", 0, 300_000), w("w_000002", "5", 400_000, 600_000), w("w_000003", "мм", 700_000, 900_000), w("w_000004", "всего", 1_000_000, 1_300_000)], R, F30)).toEqual([]);
    expect(detectFillers([w("w_000001", "10", 0, 200_000), w("w_000002", "м.", 300_000, 500_000)], R, F30)).toEqual([]);
    expect(detectFillers([w("w_000001", "3,5", 0, 200_000), w("w_000002", "ммм", 300_000, 500_000)], R, F30)).toEqual([]);
    expect(detectFillers([w("w_000001", "думаю", 0, 200_000), w("w_000002", "мм", 300_000, 500_000), w("w_000003", "да", 600_000, 800_000)], R, F30)).toHaveLength(1);
  });
});
