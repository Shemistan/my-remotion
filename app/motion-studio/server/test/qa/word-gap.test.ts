// Task 37′ fix I3: слипшиеся слова — фраза на двух соседних KineticText во flex с columnGap в em
// родителя (16 px) при кегле 88 px («не прерывая» + «соединения» → «прерываясоединения»).
// Раскладка — как у sp_009 смоука v37 (реестр kit: две строки `data-ms-layout="text"`).
import { describe, expect, it } from "vitest";
import { type LayoutFrame, WORD_GAP_EM, wordGapIssues } from "../../src/qa/layout.js";

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
});
