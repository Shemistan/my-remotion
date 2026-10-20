import { describe, expect, it } from "vitest";
import { normalizeWord } from "../../src/knowledge/search.js";
import { stemEn, stemRu } from "../../src/knowledge/stem.js";

const same = (...ws: string[]) => expect(new Set(ws.map(normalizeWord)).size).toBe(1);

describe("русский стеммер", () => {
  it("рост: роста/росла/рост/растёт/выросло", () => same("роста", "росла", "рост", "растёт", "выросло", "расти"));
  it("линия/линейный", () => same("линия", "линии", "линейный", "линейная"));
  it("пользователей/пользователи", () => same("пользователей", "пользователи", "пользователя"));
  it("график/графика", () => same("график", "графика", "графики", "графиков"));
  it("не склеивает разные слова", () => {
    expect(normalizeWord("карта")).not.toBe(normalizeWord("карточка"));
    expect(stemRu("счётчик")).toBe("счетчик");
  });
});

describe("английский стеммер", () => {
  it("мн. число и -ing/-ed", () => {
    expect(stemEn("charts")).toBe(stemEn("chart"));
    expect(stemEn("users")).toBe(stemEn("user"));
    expect(stemEn("nodes")).toBe(stemEn("node"));
    expect(stemEn("counters")).toBe(stemEn("counter"));
    expect(stemEn("animated")).toBe(stemEn("animate"));
    expect(stemEn("animating")).toBe(stemEn("animate"));
    expect(stemEn("entries")).toBe(stemEn("entry"));
  });
});
