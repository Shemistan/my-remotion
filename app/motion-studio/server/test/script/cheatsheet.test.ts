// S7: шпаргалка «сцена ↔ фраза» (спека §9 п.4, контракт C8): md по блокам, csv UTF-8 BOM «;», txt.
import { describe, expect, it } from "vitest";
import { type CheatRow, CHEAT_COLUMNS, CHEAT_NOTE_CHARS, CHEAT_NOTES_MAX, cheatNotes, cheatsheet, mss, shortNote } from "../../src/script/cheatsheet.js";

function row(over: Partial<CheatRow> = {}): CheatRow {
  return {
    n: 1, nn: "01", mp4: "01_raz.mp4", alpha: "01_raz_alpha.mov", block: "Блок 1", at_s: 0, quote: "Раз два три", technique: "hero-number",
    total_s: 3, lead_s: 0.5, tail_s: 1, notes: [], ...over,
  };
}

describe("cheatsheet", () => {
  const rows = [row({ n: 1, quote: "Раз; два \"три\"", at_s: 72.4, total_s: 7.9 })];

  it("csv: BOM, «;», шапка по спеке, кавычки вокруг полей с ; и \"", () => {
    const csv = cheatsheet(rows, "csv");
    expect(csv.startsWith("\uFEFF№;файл (фон);")).toBe(true);
    expect(csv.split("\r\n")[0]).toBe(`\uFEFF${CHEAT_COLUMNS.join(";")}`);
    expect(csv).toContain("\"Раз; два \"\"три\"\"\"");
    expect(csv).toContain(";1:12;");
    expect(csv).toContain(";7,9;0,5;1,0;");
  });

  it("csv: ячейки, начинающиеся с = + - @, не становятся формулой (префикс ')", () => {
    const csv = cheatsheet([row({ quote: "=1+2", block: "+7 приёмов", notes: ["-5 % за раз", "@всем"] })], "csv");
    const cells = csv.split("\r\n")[1]!.split(";");
    expect(cells[3]).toBe("'+7 приёмов");
    expect(cells[5]).toBe("'=1+2");
    expect(csv).toContain(";\"'-5 % за раз; @всем\"");
    // обычные ячейки и числа не трогаются
    expect(cells[0]).toBe("01");
    expect(cheatsheet([row({ quote: "=1+2" })], "md")).toContain("| =1+2 |");
  });

  it("txt: строка «NN · м:сс · «фраза» · длительность (запас)»", () => {
    expect(cheatsheet(rows, "txt")).toBe("01 · 1:12 · «Раз; два \"три\"» · 7,9 с (запас 0,5 / 1,0)\n");
  });

  it("md: «## блок», одна GFM-таблица на блок, | экранирован, переводы строк — пробел", () => {
    const md = cheatsheet([
      row({ quote: "a | b\nc" }),
      row({ n: 2, nn: "02", block: "Блок 2", alpha: null, notes: ["альфа-версия невозможна: сцена закрывает кадр"] }),
    ], "md");
    expect(md).toMatch(/^## Блок 1/m);
    expect(md).toMatch(/^## Блок 2/m);
    const lines = md.split("\n");
    const tables = lines.filter((l) => l.startsWith("|"));
    expect(tables.every((l) => l.endsWith("|"))).toBe(true);
    expect(lines.filter((l) => /^\|(?:\s*-+\s*\|)+$/.test(l))).toHaveLength(2);
    expect(md).toContain("a \\| b c");
    expect(md).toContain("| — |"); // альфы нет
    // без пустых строк внутри таблицы: за шапкой — разделитель, за ним строки
    const i = lines.findIndex((l) => l.startsWith("| №"));
    expect(lines[i + 1]).toMatch(/^\|(?:\s*-+\s*\|)+$/);
    expect(lines[i + 2]!.startsWith("| 01 |")).toBe(true);
    expect(md).not.toMatch(/<[a-z]/i);
  });

  it("сцена без файлов: «нет сцены» и причина в замечаниях; приём — по-русски", () => {
    const r = row({ n: 3, nn: "03", mp4: null, alpha: null, notes: ["нет сцены: нет готовой версии"] });
    expect(cheatsheet([r], "txt")).toBe("03 · 0:00 · «Раз два три» · нет сцены: нет готовой версии\n");
    expect(cheatsheet([r], "csv")).toContain("нет сцены: нет готовой версии");
    expect(cheatsheet([r], "md")).toContain("одно ключевое число, счёт");
  });

  it("F8: замечания — одна короткая русская фраза на код, повторы склеены, не больше трёх", () => {
    expect(cheatNotes([], ["no_hero", "composition", "no_hero"])).toEqual(["нет главного героя", "композиция неровная"]);
    expect(cheatNotes(["альфа-версия невозможна: сцена закрывает кадр"], ["no_hero", "rhythm", "frozen", "dead_air"])).toEqual([
      "альфа-версия невозможна: сцена закрывает кадр", "нет главного героя", "рваный ритм",
    ]);
    // неизвестный код — общая русская фраза, не латиница
    expect(shortNote("brand_new_check")).toBe("есть замечание проверки");
    expect(cheatNotes([], ["a_x", "b_y"])).toEqual(["есть замечание проверки"]);
    // длинная фраза обрезается по слову
    const long = cheatNotes(["нет сцены: экспорт не удался из-за очень длинной причины, которую никто не дочитает до конца строки"], []);
    expect(long[0]!.length).toBeLessThanOrEqual(CHEAT_NOTE_CHARS);
    expect(long[0]!.endsWith("…")).toBe(true);
    const codes = ["accent_conflict", "clipping", "composition", "contrast", "dead_air", "empty_open", "frame0_coverage", "hierarchy", "no_hero", "rhythm", "semantic", "scene_signature_repeat", "fragment_unsupported", "overlay_haze"];
    for (const c of codes) {
      const n = shortNote(c);
      expect(n.length, c).toBeLessThanOrEqual(CHEAT_NOTE_CHARS);
      expect(n, c).toMatch(/^[а-яё ,-]+$/iu);
    }
    expect(cheatNotes([], codes)).toHaveLength(CHEAT_NOTES_MAX);
  });

  it("м:сс", () => {
    expect(mss(0)).toBe("0:00");
    expect(mss(59.6)).toBe("1:00");
    expect(mss(605)).toBe("10:05");
  });
});
