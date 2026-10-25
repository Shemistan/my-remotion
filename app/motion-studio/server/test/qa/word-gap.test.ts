// Task 37′ fix I3: слипшиеся слова — фраза на двух соседних KineticText во flex с columnGap в em
// родителя (16 px) при кегле 88 px («не прерывая» + «соединения» → «прерываясоединения»).
// Раскладка — как у sp_009 смоука v37 (реестр kit: две строки `data-ms-layout="text"`).
import { describe, expect, it } from "vitest";
import { type LayoutFrame, WORD_GAP_EM, wordGapIssues } from "../../src/qa/layout.js";
import { FIX_ONCE } from "../../src/qa/report.js";

const FONT = 88;
const text = (id: string, t: string, x: number, w: number, y = 470) => ({ id, role: "text", text: t, rect: { x, y, w, h: 106 }, fontPx: FONT, opacity: 1 });
const frame = (items: LayoutFrame["items"], f = 92): LayoutFrame => ({ frame: f, height: 1080, items, ghosts: [] });

describe("wordGapIssues", () => {
  it("sp_009: «не прерывая» + «соединения» с зазором 0,28 em от 16 px (4,5 px) — word_gap blocking", () => {
    const issues = wordGapIssues([frame([text("text::0", "не прерывая", 420, 560), text("text::1", "соединения", 984.5, 520)]), frame([text("text::0", "не прерывая", 420, 560), text("text::1", "соединения", 984.5, 520)], 120)]);
    expect(issues).toEqual([expect.objectContaining({ code: "word_gap", severity: "blocking", frame: 92 })]);
    expect(issues[0]!.description).toContain("«не прерывая» и «соединения»");
    expect(issues[0]!.fix_hint).toContain("highlight");
  });

  it("зазор в единицах кегля (0,3 × 88 px) — без замечаний; граница — 0,2 кегля", () => {
    expect(wordGapIssues([frame([text("a", "не прерывая", 420, 560), text("b", "соединения", 980 + 0.3 * FONT, 520)])])).toEqual([]);
    expect(wordGapIssues([frame([text("a", "не прерывая", 420, 560), text("b", "соединения", 980 + WORD_GAP_EM * FONT - 1, 520)])])).toHaveLength(1);
  });

  it("одна фраза одним KineticText (акцент — highlight) — один элемент, проверять нечего", () => {
    expect(wordGapIssues([frame([text("a", "не прерывая соединения", 300, 1100)])])).toEqual([]);
  });

  it("тексты на разных строках, подписи не-text и наложение (text_overlap) — не word_gap", () => {
    expect(wordGapIssues([frame([text("a", "не прерывая", 420, 560, 300), text("b", "соединения", 984, 520, 450)])])).toEqual([]);
    expect(wordGapIssues([frame([{ ...text("a", "A", 420, 560), role: "label" }, { ...text("b", "B", 984, 520), role: "label" }])])).toEqual([]);
    expect(wordGapIssues([frame([text("a", "один", 420, 560), text("b", "другой", 500, 520)])])).toEqual([]);
  });

  // --- fix round 2: ложные blocking ---
  const L = "не прерывая";
  const R = "соединения";
  const pair = (f: number, o = 1, font = FONT) => frame([{ ...text("a", L, 420, 560), opacity: o, fontPx: font }, { ...text("b", R, 984.5, 520), opacity: o, fontPx: font }], f);

  it("вход/уход (прозрачность < 0,9) — warning; один стабильный кадр не на удержании — warning; на удержании — blocking", () => {
    expect(wordGapIssues([pair(10, 0.5), frame([], 170)])[0]).toMatchObject({ severity: "warning" });
    expect(wordGapIssues([pair(60), frame([], 170)])[0]).toMatchObject({ severity: "warning" });
    expect(wordGapIssues([frame([], 60), pair(170)])[0]).toMatchObject({ severity: "blocking" });
    expect(wordGapIssues([pair(60), pair(90), frame([], 170)])[0]).toMatchObject({ severity: "blocking" });
  });

  it("мелкий текст (кегль < 0,04 высоты кадра) — warning", () => {
    expect(wordGapIssues([pair(60, 1, 36), pair(170, 1, 36)])[0]).toMatchObject({ severity: "warning" });
  });

  it("стык не букв/цифр (пунктуация, «%», эмодзи) и кегли больше чем в 1,5 раза — не word_gap; текст + число — проверяется", () => {
    const two = (a: string, b: string, fb = FONT, rb = "text") => wordGapIssues([frame([text("a", a, 420, 560), { ...text("b", b, 984.5, 520), fontPx: fb, role: rb }], 170)]);
    expect(two("рост:", "40")).toEqual([]);
    expect(two("рост", "%")).toEqual([]);
    expect(two("рост", "🚀")).toEqual([]);
    expect(two("рост", "40", 160, "number")).toEqual([]);
    expect(two("рост", "40", 100, "number")).toHaveLength(1);
  });

  it("многострочные: сравниваются строки (части пробы), а не охват владельца; абзац > 2 строк — warning", () => {
    // левый абзац в 2 строки кончается на второй строке; правый текст — на первой строке справа от первой строки левого с зазором
    const line = (t: string, x: number, y: number, w: number) => ({ text: t, rect: { x, y, w, h: 106 }, fontPx: FONT, opacity: 1 });
    const left = { ...text("a", "первая строка вторая", 100, 900, 300), rect: { x: 100, y: 300, w: 900, h: 212 }, lines: [line("первая строка", 100, 300, 600), line("вторая", 100, 406, 900)] };
    const right = { ...text("b", "справа", 1005, 400, 300), lines: [line("справа", 1005, 300, 400)] };
    expect(wordGapIssues([frame([left, right], 170)])).toEqual([]);
    // та же раскладка по охвату (старая проба без lines) дала бы стык 5 px
    expect(wordGapIssues([frame([{ ...left, lines: undefined } as never, { ...right, lines: undefined } as never], 170)])).toHaveLength(1);
    const para = { ...left, lines: [line("раз", 100, 300, 600), line("два", 100, 406, 600), line("три слова", 100, 512, 900)] };
    const near = { ...right, lines: [line("справа", 1002, 512, 400)] };
    expect(wordGapIssues([frame([para, near], 90), frame([para, near], 170)])[0]).toMatchObject({ severity: "warning" });
  });

  it("word_gap исправляется не больше одного раза (FIX_ONCE)", () => {
    expect(FIX_ONCE.has("word_gap")).toBe(true);
  });
});
