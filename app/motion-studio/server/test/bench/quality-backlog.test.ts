// Бэклог ночного цикла `docs/quality-backlog.md`: разбор, следующий открытый пункт, пометка с
// историей; не принятый пункт уходит вниз списка.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { markItem, nextItem, parseBacklog } from "../../src/bench/quality-backlog.js";

const MD = `# Бэклог качества

Вводный текст.

## Q01 — Первый пункт
статус: открыт

Что делать: раз.
Второй абзац.

## Q02 — Второй пункт
статус: принято (ночь 2026-10-20)

Текст два.

история:
- 2026-10-20: принято (ночь 2026-10-20)

## Q03 — Третий пункт
статус: открыт

Текст три.
`;

describe("parseBacklog", () => {
  it("пункты по порядку: id, заголовок, статус, текст, история; вводный текст отдельно", () => {
    const b = parseBacklog(MD);
    expect(b.preamble).toBe("# Бэклог качества\n\nВводный текст.");
    expect(b.items.map((i) => [i.id, i.title, i.status])).toEqual([
      ["Q01", "Первый пункт", "открыт"],
      ["Q02", "Второй пункт", "принято (ночь 2026-10-20)"],
      ["Q03", "Третий пункт", "открыт"],
    ]);
    expect(b.items[0]!.body).toBe("Что делать: раз.\nВторой абзац.");
    expect(b.items[1]!.history).toEqual(["2026-10-20: принято (ночь 2026-10-20)"]);
  });

  it("пункт без строки статуса или с повтором id — ошибка с номером пункта", () => {
    expect(() => parseBacklog("## Q01 — a\nтекст\n")).toThrow(/Q01.*статус/);
    expect(() => parseBacklog("## Q01 — a\nстатус: открыт\n\n## Q01 — b\nстатус: открыт\n")).toThrow(/Q01.*повтор/);
  });

  it("строка «приёмка: без регрессии» в тексте пункта — режим приёмки без требования роста", () => {
    const b = parseBacklog("## Q01 — a\nстатус: открыт\n\nТекст.\nприёмка: без регрессии\n\n## Q02 — b\nстатус: открыт\n\nТекст.\n");
    expect(b.items.map((i) => i.acceptance)).toEqual(["без регрессии", "рост"]);
  });

  it("настоящий docs/quality-backlog.md разбирается: ≥ 10 открытых пунктов с текстом", () => {
    const md = readFileSync(new URL("../../../../../docs/quality-backlog.md", import.meta.url), "utf8");
    const open = parseBacklog(md).items.filter((i) => i.status === "открыт");
    expect(open.length).toBeGreaterThanOrEqual(10);
    expect(open.every((i) => i.body.length > 0)).toBe(true);
  });
});

describe("nextItem", () => {
  it("верхний открытый; с выбранным id — он, если открыт", () => {
    const b = parseBacklog(MD);
    expect(nextItem(b)?.id).toBe("Q01");
    expect(nextItem(b, "Q03")?.id).toBe("Q03");
    expect(() => nextItem(b, "Q02")).toThrow(/Q02.*не открыт/);
    expect(() => nextItem(b, "Q09")).toThrow(/Q09.*нет/);
  });
  it("открытых нет — undefined", () => {
    expect(nextItem(parseBacklog("## Q01 — a\nстатус: принято (ночь 2026-10-20)\n"))).toBeUndefined();
  });
});

describe("markItem", () => {
  it("принято: статус и строка истории, место в списке то же", () => {
    const md = markItem(MD, "Q01", "принято (ночь 2026-10-24)", { date: "2026-10-24" });
    const b = parseBacklog(md);
    expect(b.items.map((i) => i.id)).toEqual(["Q01", "Q02", "Q03"]);
    expect(b.items[0]!.status).toBe("принято (ночь 2026-10-24)");
    expect(b.items[0]!.history).toEqual(["2026-10-24: принято (ночь 2026-10-24)"]);
    expect(b.items[0]!.body).toBe("Что делать: раз.\nВторой абзац.");
  });

  it("не дало роста: пункт уходит вниз, следующий открытый — Q03; история копится", () => {
    let md = markItem(MD, "Q01", "не дало роста (ночь 2026-10-24): explainer +0.05", { date: "2026-10-24", toEnd: true });
    let b = parseBacklog(md);
    expect(b.items.map((i) => i.id)).toEqual(["Q02", "Q03", "Q01"]);
    expect(nextItem(b)?.id).toBe("Q03");
    md = markItem(md, "Q02", "открыт", { date: "2026-10-25" });
    b = parseBacklog(md);
    expect(b.items[0]!.history).toEqual(["2026-10-20: принято (ночь 2026-10-20)", "2026-10-25: открыт"]);
    // вводный текст и прочие пункты — без изменений
    expect(b.preamble).toBe("# Бэклог качества\n\nВводный текст.");
    expect(parseBacklog(md).items.find((i) => i.id === "Q03")!.body).toBe("Текст три.");
  });

  it("неизвестный id — ошибка", () => {
    expect(() => markItem(MD, "Q09", "открыт", { date: "2026-10-24" })).toThrow(/Q09/);
  });
});
