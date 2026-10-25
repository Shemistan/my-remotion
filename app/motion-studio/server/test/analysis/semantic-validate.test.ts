// Task 31: проверка ответа Semantic Director кодом — цитаты через verifyQuote, якоря на вырезанных
// словах, покрытие глав без пересечений, акценты внутри якоря, связи на отклонённые якоря. Не
// прошедшее — отклоняется с кодом, а не «чинится».
import { describe, expect, it } from "vitest";
import { buildTimeline, mapWords } from "@ms/contracts";
import { numberMatchesQuote, validateSemantic } from "../../src/analysis/semantic-validate.js";
import { F30, w } from "../edit/helpers.js";
import { anchor, ch, id, map10, out, words10 } from "./semantic-helpers.js";

const all = ch("c1", id(1), id(10));

describe("validateSemantic: якоря и цитаты", () => {
  it("диапазон через вырезанное слово, цитата с вырезанным текстом → anchor_in_cut", () => {
    const v = validateSemantic(out({ chapters: [all], anchors: [anchor("a1", id(2), id(4), "мы эээ покажем")] }), words10, map10);
    expect(v.rejected).toContainEqual(expect.objectContaining({ kind: "anchor", id: "a1", code: "anchor_in_cut" }));
    expect(v.timeline.anchors).toEqual([]);
  });

  it("граничное слово вырезано целиком → anchor_in_cut (не unknown_word)", () => {
    for (const [s, e, q] of [[id(3), id(4), "эээ покажем"], [id(1), id(3), "Сегодня мы эээ"], [id(3), id(3), "эээ"]] as const) {
      const v = validateSemantic(out({ chapters: [all], anchors: [anchor("a1", s, e, q)] }), words10, map10);
      expect(v.rejected).toEqual([expect.objectContaining({ kind: "anchor", id: "a1", code: "anchor_in_cut" })]);
    }
  });

  it("якорь на границе вырезки: слово до вырезки и частично вырезанное (clipped) после — принят", () => {
    const v = validateSemantic(out({ chapters: [all], anchors: [anchor("a1", id(4), id(5), "покажем, как"), anchor("a2", id(1), id(2), "Сегодня мы")] }), words10, map10);
    expect(v.rejected).toEqual([]);
    expect(v.timeline.anchors.map((a) => a.id)).toEqual(["a1", "a2"]);
  });

  it("цитата того, что слышит зритель (через вырезку, без вырезанного слова), — принята", () => {
    const v = validateSemantic(out({ chapters: [all], anchors: [anchor("a1", id(2), id(4), "мы покажем")] }), words10, map10);
    expect(v.rejected).toEqual([]);
  });

  it("не та цитата → quote_mismatch; нет слова → unknown_word; обратный порядок → order", () => {
    const v = validateSemantic(out({
      chapters: [all],
      anchors: [anchor("a2", id(5), id(6), "не то"), anchor("a3", id(5), "w_000099", "как"), anchor("a4", id(6), id(5), "рост как")],
    }), words10, map10);
    expect(v.rejected.map((r) => [r.id, r.code])).toEqual([["a2", "quote_mismatch"], ["a3", "unknown_word"], ["a4", "order"]]);
  });

  it("акцент вне диапазона якоря → emphasis_out_of_range; внутри — принят", () => {
    const v = validateSemantic(out({
      chapters: [all],
      anchors: [anchor("a1", id(6), id(8), "рост составил 5%", { emphasis_word_ids: [id(8)] }), anchor("a2", id(6), id(7), "рост составил", { emphasis_word_ids: [id(9)] })],
    }), words10, map10);
    expect(v.rejected).toEqual([expect.objectContaining({ id: "a2", code: "emphasis_out_of_range" })]);
    expect(v.timeline.anchors.map((a) => a.id)).toEqual(["a1"]);
  });

  it("связь на отклонённый якорь → unknown_anchor; связь принятых — остаётся", () => {
    const v = validateSemantic(out({
      chapters: [all],
      anchors: [anchor("a1", id(6), id(8), "рост составил 5%"), anchor("a2", id(9), id(10), "за год"), anchor("a3", id(1), id(2), "вчера мы")],
      causal: [{ cause_anchor_id: "a1", effect_anchor_id: "a2" }, { cause_anchor_id: "a3", effect_anchor_id: "a1" }],
    }), words10, map10);
    expect(v.timeline.causal).toEqual([{ cause_anchor_id: "a1", effect_anchor_id: "a2" }]);
    expect(v.rejected.map((r) => [r.kind, r.code])).toEqual([["anchor", "quote_mismatch"], ["causal", "unknown_anchor"]]);
  });
});

describe("validateSemantic: числа (Review Focus)", () => {
  const ws = ["Мы", "выросли", "до", "1", "000", "000", "пользователей,", "это", "5%", "рынка,", "а", "отток", "-3", "пункта."]
    .map((t, i) => w(id(i + 1), t, i * 500_000, i * 500_000 + 400_000));
  const map = mapWords(buildTimeline(7_000_000, [], F30), ws);
  const c = ch("c1", id(1), id(14));
  const num = (s: number, e: number, quote: string, value: number, unit?: string) =>
    ({ value, ...(unit ? { unit } : {}), start_word_id: id(s), end_word_id: id(e), quote, claim_type: "fact" as const });

  it("«1 000 000» — три слова ASR одной цитатой (и слитно), «5%», «-3» — приняты", () => {
    const v = validateSemantic(out({ chapters: [c], numbers: [num(4, 6, "1 000 000", 1_000_000), num(4, 7, "1000000 пользователей", 1_000_000, "пользователей"), num(9, 9, "5%", 5, "%"), num(13, 13, "-3", -3)] }), ws, map);
    expect(v.rejected).toEqual([]);
    expect(v.timeline.numbers).toHaveLength(4);
  });

  it("value сверяется с цифрами цитаты: 5000 при «5%» → value_mismatch; 1000000 при «1 000 000», -3 при «-3», 0,05 при «5%» — приняты", () => {
    const v = validateSemantic(out({ chapters: [c], numbers: [num(9, 9, "5%", 5000, "%"), num(4, 6, "1 000 000", 1_000_001), num(13, 13, "-3", -3), num(9, 9, "5%", 0.05)] }), ws, map);
    expect(v.rejected.map((r) => [r.kind, r.code])).toEqual([["number", "value_mismatch"], ["number", "value_mismatch"]]);
    expect(v.rejected[0]!.detail).toMatch(/5000/);
    expect(v.timeline.numbers.map((x) => x.value)).toEqual([-3, 0.05]);
  });

  it("«5» вместо «5%», «3» вместо «-3», «миллион» вместо «1 000 000» — quote_mismatch", () => {
    const v = validateSemantic(out({ chapters: [c], numbers: [num(9, 9, "5", 5), num(13, 13, "3", 3), num(4, 6, "миллион", 1_000_000)] }), ws, map);
    expect(v.rejected.map((r) => [r.kind, r.code])).toEqual([["number", "quote_mismatch"], ["number", "quote_mismatch"], ["number", "quote_mismatch"]]);
    expect(v.timeline.numbers).toEqual([]);
  });
});

describe("validateSemantic: главы", () => {
  it("одна глава на весь ролик (оставленные слова) — принята; вырезанное слово в главе — не разрыв", () => {
    expect(validateSemantic(out({ chapters: [all] }), words10, map10).rejected).toEqual([]);
    // глава от первого до последнего оставленного: вырезанное w_000003 внутри — не пропуск
    expect(validateSemantic(out({ chapters: [ch("c1", id(1), id(2)), ch("c2", id(4), id(10))] }), words10, map10).rejected).toEqual([]);
  });

  it("слова после главы не покрыты — глава принята и растянута до конца: chapter_extended (не chapter_gap)", () => {
    const v = validateSemantic(out({ chapters: [ch("c1", id(1), id(5))] }), words10, map10);
    expect(v.rejected).toEqual([expect.objectContaining({ kind: "chapter", id: "c1", code: "chapter_extended" })]);
    expect(v.timeline.chapters.map((x) => x.id)).toEqual(["c1"]);
  });

  it("пропуск в начале и между главами — главы приняты (границы — их начала): chapter_extended той, что растянута; пересечение → chapter_overlap (вторая отклонена)", () => {
    const gap = validateSemantic(out({ chapters: [ch("c1", id(2), id(5)), ch("c2", id(7), id(10))] }), words10, map10);
    expect(gap.rejected.map((r) => [r.id, r.code])).toEqual([["c1", "chapter_extended"], ["c1", "chapter_extended"]]);
    expect(gap.rejected[0]!.detail).toMatch(/начал/);
    expect(gap.timeline.chapters.map((x) => x.id)).toEqual(["c1", "c2"]);
    expect(validateSemantic(out(), words10, map10).rejected).toEqual([expect.objectContaining({ kind: "chapter", code: "chapter_gap" })]);
    const ov = validateSemantic(out({ chapters: [ch("c1", id(1), id(6)), ch("c2", id(5), id(10))] }), words10, map10);
    expect(ov.rejected.map((r) => [r.id, r.code])).toContainEqual(["c2", "chapter_overlap"]);
    expect(ov.timeline.chapters.map((x) => x.id)).toEqual(["c1"]);
  });

  it("граница главы на вырезанном слове → anchor_in_cut", () => {
    const v = validateSemantic(out({ chapters: [ch("c1", id(1), id(3)), ch("c2", id(4), id(10))] }), words10, map10);
    expect(v.rejected).toContainEqual(expect.objectContaining({ kind: "chapter", id: "c1", code: "anchor_in_cut" }));
  });

  it("всё вырезано / пустой транскрипт: пустой ответ — без отклонений; глава при пустом входе — unknown_word", () => {
    const none = mapWords(buildTimeline(10_000_000, [{ start_us: 0, end_us: 10_000_000 }], F30), words10);
    expect(validateSemantic(out(), words10, none)).toEqual({ timeline: out(), rejected: [] });
    expect(validateSemantic(out(), [], {})).toEqual({ timeline: out(), rejected: [] });
    expect(validateSemantic(out({ chapters: [ch("c1", id(1), id(2))] }), [], {}).rejected[0]!.code).toBe("unknown_word");
  });
});

describe("validateSemantic: сущности и спорное", () => {
  it("упоминание на вырезанном слове → anchor_in_cut; неизвестное → unknown_word; спорное — проверка диапазона", () => {
    const v = validateSemantic(out({
      chapters: [all],
      entities: [{ name: "рост", kind: "metric", mention_word_ids: [id(6)] }, { name: "эээ", kind: "x", mention_word_ids: [id(3)] }, { name: "нет", kind: "x", mention_word_ids: ["w_000077"] }],
      disputed: [{ start_word_id: id(6), end_word_id: id(8), why: "без источника" }, { start_word_id: id(8), end_word_id: id(6), why: "порядок" }],
    }), words10, map10);
    expect(v.timeline.entities.map((e) => e.name)).toEqual(["рост"]);
    expect(v.timeline.disputed).toHaveLength(1);
    expect(v.rejected.map((r) => [r.kind, r.code])).toEqual([["entity", "anchor_in_cut"], ["entity", "unknown_word"], ["disputed", "order"]]);
  });
});

describe("numberMatchesQuote", () => {
  it("цифры цитаты: разряды через пробел, дробь с запятой, проценты, минус, множители словами", () => {
    expect(numberMatchesQuote(1_000_000, "до 1 000 000 пользователей")).toBe(true);
    expect(numberMatchesQuote(3.5, "рост 3,5 раза")).toBe(true);
    expect(numberMatchesQuote(5, "5%")).toBe(true);
    expect(numberMatchesQuote(0.05, "5%")).toBe(true);
    expect(numberMatchesQuote(5000, "5%")).toBe(false);
    expect(numberMatchesQuote(-3, "отток -3 пункта")).toBe(true);
    expect(numberMatchesQuote(-3, "упал на 3 пункта")).toBe(true); // знак — из слов, не из цифр
    expect(numberMatchesQuote(1_500_000, "1,5 млн рублей")).toBe(true);
    expect(numberMatchesQuote(5000, "5 тысяч")).toBe(true);
    expect(numberMatchesQuote(2300, "в 2 300 городах")).toBe(true);
    expect(numberMatchesQuote(300, "в 2 300 городах")).toBe(true); // группа разрядов неоднозначна — любое прочтение
    expect(numberMatchesQuote(10, "на 10 клиентах")).toBe(true);
    expect(numberMatchesQuote(11, "на 10 клиентах")).toBe(false);
  });

  it("словесные числа (без цифр) — проверка пропускается", () => {
    expect(numberMatchesQuote(0.5, "за полгода")).toBeUndefined();
    expect(numberMatchesQuote(1_000_000, "до миллиона")).toBeUndefined();
  });
});
