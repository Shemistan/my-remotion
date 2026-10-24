// Task 27: выравнивание старых слов и нового текста (LCS по normalizeToken).
import { describe, expect, it } from "vitest";
import { alignTokens, tokenizeEdit } from "../../src/edit/align.js";
import { w } from "./helpers.js";

const words = [w("w_000001", "привет", 0, 400_000), w("w_000002", "мир", 500_000, 900_000), w("w_000003", "как", 1_000_000, 1_200_000)];

describe("tokenizeEdit", () => {
  it("пунктуация отдельным токеном — к предыдущему слову, в начале — к следующему", () => {
    expect(tokenizeEdit("Привет , мир —  да")).toEqual({ tokens: ["Привет ,", "мир —", "да"], punctuation: "" });
    expect(tokenizeEdit("« Привет»")).toEqual({ tokens: ["« Привет»"], punctuation: "" });
  });

  it("пустой текст и одна пунктуация — без слов; управляющие и невидимые символы убраны", () => {
    expect(tokenizeEdit("   ")).toEqual({ tokens: [], punctuation: "" });
    expect(tokenizeEdit(" ! ")).toEqual({ tokens: [], punctuation: "!" });
    expect(tokenizeEdit("при​вет\tмир да")).toEqual({ tokens: ["привет", "мир", "да"], punctuation: "" });
  });

  it("числовые знаки — слова: %, +, минус перед цифрой", () => {
    expect(tokenizeEdit("рост +5 % и −3")).toEqual({ tokens: ["рост", "+5", "%", "и", "−3"], punctuation: "" });
  });
});

describe("alignTokens", () => {
  it("совпавшие по normalizeToken токены сохраняют id, текст — новый", () => {
    expect(alignTokens(words, "Привет, МИР! Как")).toEqual({
      kept: [{ word_id: "w_000001", text: "Привет," }, { word_id: "w_000002", text: "МИР!" }, { word_id: "w_000003", text: "Как" }],
      inserted: [], removed: [],
    });
  });

  it("вставка в середину, в начало и в конец", () => {
    expect(alignTokens(words.slice(0, 2), "привет большой мир")).toEqual({
      kept: [{ word_id: "w_000001", text: "привет" }, { word_id: "w_000002", text: "мир" }],
      inserted: [{ after_word_id: "w_000001", text: "большой" }], removed: [],
    });
    expect(alignTokens(words.slice(0, 2), "ну привет мир")).toMatchObject({ inserted: [{ after_word_id: null, text: "ну" }] });
    expect(alignTokens(words.slice(0, 2), "привет мир всем")).toMatchObject({ inserted: [{ after_word_id: "w_000002", text: "всем" }] });
  });

  it("удаление и пустой текст", () => {
    expect(alignTokens(words, "привет как")).toEqual({
      kept: [{ word_id: "w_000001", text: "привет" }, { word_id: "w_000003", text: "как" }], inserted: [], removed: ["w_000002"],
    });
    expect(alignTokens(words, "")).toEqual({ kept: [], inserted: [], removed: ["w_000001", "w_000002", "w_000003"] });
  });

  it("замена равным числом слов между якорями — то же слово с новым текстом (время ASR сохраняется)", () => {
    expect(alignTokens(words, "привет Remotion как")).toEqual({
      kept: [{ word_id: "w_000001", text: "привет" }, { word_id: "w_000002", text: "Remotion" }, { word_id: "w_000003", text: "как" }],
      inserted: [], removed: [],
    });
  });

  it("замена другим числом слов — удаление и вставка", () => {
    expect(alignTokens(words, "привет Claude Code как")).toEqual({
      kept: [{ word_id: "w_000001", text: "привет" }, { word_id: "w_000003", text: "как" }],
      inserted: [{ after_word_id: "w_000001", text: "Claude" }, { after_word_id: "w_000001", text: "Code" }],
      removed: ["w_000002"],
    });
  });

  it("ё/е, регистр, ударение и юникод-нормализация не мешают совпадению", () => {
    const ws = [w("w_000001", "ещё", 0, 1), w("w_000002", "кафе", 2, 3)];
    expect(alignTokens(ws, "Еще́ кафе́").removed).toEqual([]);
    expect(alignTokens(ws, "Еще́ кафе́").inserted).toEqual([]);
    expect(alignTokens(ws, "ещё café".normalize("NFD")).kept.map((k) => k.word_id)).toEqual(["w_000001", "w_000002"]);
  });

  it("повтор слов: лишний повтор удаляется, остальные id сохраняются", () => {
    const ws = [w("w_000001", "да", 0, 1), w("w_000002", "да", 2, 3), w("w_000003", "да", 4, 5)];
    const r = alignTokens(ws, "да да");
    expect(r.kept).toHaveLength(2);
    expect(r.removed).toHaveLength(1);
    expect(r.inserted).toEqual([]);
  });

  it("слишком большой участок без общего начала и конца — span_too_large, а не O(n·m) на минуты", () => {
    const ws = Array.from({ length: 3000 }, (_, i) => w(`w_${String(i + 1).padStart(6, "0")}`, `а${i}`, i, i));
    const text = Array.from({ length: 3000 }, (_, i) => `б${i}`).join(" ");
    expect(() => alignTokens(ws, text)).toThrow(/span_too_large/);
  });
});
