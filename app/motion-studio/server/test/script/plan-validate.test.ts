// S3: проверка ответа Script Director кодом (`validateScriptPlan`, спека §6.1, Р21).
import { DEFAULT_READING, quoteOf, readingFrames, tokenizeScript } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { itemIssues, validateScriptPlan } from "../../src/script/plan-validate.js";
import { DOC as doc, cleanScenes, docOf, out, scene, w } from "./plan-fixtures.js";

const F30 = { num: 30, den: 1 };
const R = DEFAULT_READING;
type V = ReturnType<typeof validateScriptPlan>;
const rejectedCodes = (v: V) => v.rejected.map((x) => x.code);
const issueCodes = (v: V) => v.issues.map((x) => x.code);
const issueSeverity = (v: V, code: string) => v.issues.find((x) => x.code === code)?.severity;
const longDoc = docOf([{ title: "", text: `${Array.from({ length: 70 }, (_, i) => `слово${i}`).join(" ")}.` }]);

describe("validateScriptPlan", () => {
  it("сцена принята: id по порядку, цитата и кадры — из слов", () => {
    const ok = validateScriptPlan(out(doc, [scene(doc, w(1), w(12), { technique: "hero-number", data: [{ label: "версия", value: 1.24, quote: "Go 1.24" }] })]), doc, R, F30);
    expect(ok.rejected).toEqual([]);
    expect(ok.items[0]).toMatchObject({
      id: "ss_001", status: "accepted", origin: "agent", block_id: "b1", words: 12, at_s: 0,
      quote: quoteOf(doc, w(1), w(12)), frames: readingFrames(12, DEFAULT_READING, F30),
    });
  });

  it("отказы: выдуманная цитата, value_mismatch, пересечение, через границу блоков", () => {
    expect(rejectedCodes(validateScriptPlan(out(doc, [scene(doc, w(1), w(5), { quote: "выдуманная цитата" })]), doc, R, F30))).toEqual(["quote_mismatch"]);
    expect(rejectedCodes(validateScriptPlan(out(doc, [scene(doc, w(1), w(12), { data: [{ label: "x", value: 1.25, quote: "Go 1.24" }] })]), doc, R, F30))).toEqual(["value_mismatch"]);
    expect(rejectedCodes(validateScriptPlan(out(doc, [scene(doc, w(1), w(10)), scene(doc, w(8), w(20))]), doc, R, F30))).toEqual(["scene_overlap"]);
    const two = docOf([{ title: "A", text: "Раз два три четыре." }, { title: "Б", text: "Пять шесть семь восемь." }]);
    expect(rejectedCodes(validateScriptPlan(out(two, [scene(two, w(3), w(6))]), two, R, F30))).toEqual(["cross_block"]);
    expect(rejectedCodes(validateScriptPlan(out(doc, [scene(doc, w(5), w(2), { quote: "x" })]), doc, R, F30))).toEqual(["order"]);
    expect(rejectedCodes(validateScriptPlan(out(doc, [scene(doc, w(1), w(99), { quote: "x" })]), doc, R, F30))).toEqual(["unknown_word"]);
  });

  it("цитата числа не из фрагмента — отказ (числа не из цитаты отклоняются кодом)", () => {
    const v = validateScriptPlan(out(doc, [scene(doc, w(1), w(12), { data: [{ label: "слоты", value: 8, quote: "восемь слотов" }] })]), doc, R, F30);
    expect(rejectedCodes(v)).toEqual(["quote_mismatch"]);
  });

  it("отклонённое и пропуски агента — в skipped с причиной", () => {
    const v = validateScriptPlan(out(doc, [
      scene(doc, w(1), w(5), { quote: "выдуманная цитата" }),
      scene(doc, w(15), w(28), { decision: "skip", skip_reason: "переход без данных", technique: undefined, pattern: undefined }),
    ]), doc, R, F30);
    expect(v.items).toEqual([]);
    expect(v.skipped).toEqual([
      { start_word_id: w(1), end_word_id: w(5), quote: quoteOf(doc, w(1), w(5)), reason: expect.stringMatching(/^отклонено проверкой \(quote_mismatch\)/) },
      { start_word_id: w(15), end_word_id: w(28), quote: quoteOf(doc, w(15), w(28)), reason: "переход без данных" },
    ]);
  });

  it("длительность: > 20 с — blocking, > 12 с — warning", () => {
    expect(issueCodes(validateScriptPlan(out(longDoc, [scene(longDoc, w(1), w(60))]), longDoc, R, F30))).toContain("scene_too_long"); // 60 слов = 24 с
    expect(issueSeverity(validateScriptPlan(out(longDoc, [scene(longDoc, w(1), w(60))]), longDoc, R, F30), "scene_too_long")).toBe("blocking");
    expect(issueSeverity(validateScriptPlan(out(longDoc, [scene(longDoc, w(1), w(35))]), longDoc, R, F30), "scene_long")).toBe("warning"); // 35 слов = 14 с
    expect(issueSeverity(validateScriptPlan(out(longDoc, [scene(longDoc, w(1), w(5))]), longDoc, R, F30), "scene_too_short")).toBe("warning"); // 2 с
  });

  it("соседние одинаковые приёмы — blocking", () => {
    const v = validateScriptPlan(out(doc, [scene(doc, w(1), w(14), { technique: "race" }), scene(doc, w(15), w(28), { technique: "race" })]), doc, R, F30);
    expect(issueSeverity(v, "adjacent_technique_repeat")).toBe("blocking");
  });

  it("числа словами (Р21): распознанное значение принимается, иное — value_mismatch, нераспознанное — value_unverified", () => {
    // фраза из tmp/script-mvp/block-2.txt (13 слов)
    const b2 = tokenizeScript([{ title: "", text: "Случайное совпадение по такому байту бывает с вероятностью один к двумстам пятидесяти шести." }]);
    const d2 = { schema_version: 1 as const, script_id: "scr_b2", revision: 1, ...b2, author: "user" as const };
    const v = validateScriptPlan(out(d2, [scene(d2, w(1), w(13), { data: [{ label: "вероятность", value: 256, quote: "один к двумстам пятидесяти шести" }] })]), d2, R, F30);
    expect(v.rejected).toEqual([]);
    expect(issueCodes(v)).not.toContain("value_unverified");
    expect(rejectedCodes(validateScriptPlan(out(d2, [scene(d2, w(1), w(13), { data: [{ label: "x", value: 300, quote: "один к двумстам пятидесяти шести" }] })]), d2, R, F30))).toEqual(["value_mismatch"]);
    const u = validateScriptPlan(out(doc, [scene(doc, w(15), w(28), { data: [{ label: "x", value: 3, quote: "пара бакетов" }] })]), doc, R, F30);
    expect(u.rejected).toEqual([]);
    expect(u.issues).toContainEqual(expect.objectContaining({ code: "value_unverified", severity: "warning", item_id: "ss_001" }));
    const half = validateScriptPlan(out(doc, [scene(doc, w(29), w(40), { data: [{ label: "записей", value: 6.5, quote: "шесть с половиной записей" }] })]), doc, R, F30);
    expect(half.rejected).toEqual([]);
  });

  it("покрытие текста сценами: < 30 % и > 90 % — warning", () => {
    expect(issueCodes(validateScriptPlan(out(doc, [scene(doc, w(1), w(10))]), doc, R, F30))).toContain("coverage_low");
    const full = validateScriptPlan(out(doc, cleanScenes()), doc, R, F30);
    expect(issueCodes(full)).toContain("coverage_high");
    expect(full.issues.filter((x) => x.severity === "blocking")).toEqual([]);
  });

  it("разбор: главы и числа проверяются по словам; ключевые слова вне сцены отброшены, якоря — только принятые", () => {
    const bad = out(doc, [scene(doc, w(1), w(14), { key_terms: [{ text: "Swiss", word_id: w(13) }, { text: "старая", word_id: w(15) }], anchor_ids: ["a_1", "a_x"] })], {
      anchors: [{ id: "a_1", kind: "concept", start_word_id: w(13), end_word_id: w(14), quote: "Swiss Table", claim_type: "fact", importance: 2, emphasis_word_ids: [] }],
      numbers: [
        { value: 1.24, start_word_id: w(2), end_word_id: w(3), quote: "Go 1.24", claim_type: "fact" },
        { value: 9, start_word_id: w(22), end_word_id: w(23), quote: "восемь слотов", claim_type: "fact" },
      ],
    });
    const v = validateScriptPlan(bad, doc, R, F30);
    expect(v.analysis.numbers.map((x) => x.value)).toEqual([1.24]);
    expect(v.analysis.chapters).toHaveLength(1);
    expect(v.items[0]!.key_terms).toEqual([{ text: "Swiss", word_id: w(13) }]);
    expect(v.items[0]!.anchor_ids).toEqual(["a_1"]);
  });

  it("itemIssues — только длительности принятых сцен", () => {
    const v = validateScriptPlan(out(longDoc, [scene(longDoc, w(1), w(60))]), longDoc, R, F30);
    expect(itemIssues(v.items, R, F30).map((x) => x.code)).toEqual(["scene_too_long"]);
    expect(itemIssues(v.items.map((x) => ({ ...x, status: "rejected" as const })), R, F30)).toEqual([]);
  });
});
