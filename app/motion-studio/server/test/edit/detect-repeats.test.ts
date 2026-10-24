// Task 28: детектор повторов.
import { describe, expect, it } from "vitest";
import { detectRepeats } from "../../src/edit/detect-repeats.js";
import { F30, w } from "./helpers.js";

/** Слова через пробел по 300 мс с паузой 100 мс: `w1`…`wN` (id формата транскрипта). */
function ws4(text: string): ReturnType<typeof w>[] {
  return text.split(" ").map((t, i) => w(`w_00000${i + 1}`, t, i * 400_000, i * 400_000 + 300_000));
}

describe("detectRepeats", () => {
  it("подряд одно слово и n-грамма: вырезано первое вхождение до начала второго", () => {
    expect(detectRepeats([w("w_000001", "я", 0, 200_000), w("w_000002", "я", 300_000, 500_000), w("w_000003", "думаю", 600_000, 1_000_000)], F30)[0])
      .toMatchObject({ reason: "repeat", source_start_us: 0, source_end_us: 300_000, start_word_id: "w_000001", end_word_id: "w_000001", confidence: 0.8 });
    expect(detectRepeats(ws4("мы сделали мы сделали это"), F30)[0]).toMatchObject({ start_word_id: "w_000001", end_word_id: "w_000002", source_start_us: 0, source_end_us: 800_000 });
    // регистр и пунктуация не важны
    expect(detectRepeats(ws4("Мы, мы решили"), F30)).toHaveLength(1);
  });

  it("серия: одна вырезка до последнего вхождения", () => {
    const d = detectRepeats(ws4("да да да да хорошо"), F30);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ start_word_id: "w_000001", end_word_id: "w_000003", source_start_us: 0, source_end_us: 1_200_000 });
  });

  it("числа и знаки — не повторы; не подряд — не повтор", () => {
    expect(detectRepeats(ws4("до 1 000 000 пользователей"), F30)).toEqual([]);
    expect(detectRepeats(ws4("мы — — сделали"), F30)).toEqual([]);
    expect(detectRepeats(ws4("я думаю я знаю"), F30)).toEqual([]);
  });
});
