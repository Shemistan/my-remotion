// S11 (находка e2e S5, ss_004): момент слова ключевого числа и термина в кадрах сцены — его
// считает код по формуле §5.2; бриф называет его Director, проверка `key_term_early` сверяет.
import { DEFAULT_READING, type Fps, type ScriptRevisionDoc, type ScriptSceneItem, readingFrames, tokenizeScript } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { buildSceneBrief, keyMoments } from "../../src/script/brief.js";

const F30: Fps = { num: 30, den: 1 };
const TEXT = "С Go 1.24 — а он вышел уже в феврале 2025 года. Карта стала быстрее в целом.";
const doc: ScriptRevisionDoc = { schema_version: 1, script_id: "scr_1", revision: 1, ...tokenizeScript([{ title: "Блок", text: TEXT }]), author: "user" };
const frameAfter = (n: number) => 15 + readingFrames(n, DEFAULT_READING, F30).speech;

function item(over: Partial<ScriptSceneItem> = {}): ScriptSceneItem {
  return {
    id: "ss_001", status: "accepted", origin: "agent", start_word_id: "w_000001", end_word_id: "w_000016", quote: TEXT, block_id: "b1",
    words: 16, at_s: 0, frames: { lead: 15, speech: 192, tail: 30, total: 237 }, technique: "hero-number", pattern: "quantities",
    purpose: "п", idea: "и", key_terms: [{ text: "Карта", word_id: "w_000012" }], data: [{ label: "год", value: 2025, quote: "феврале 2025 года" }, { label: "версия", value: 1.24, quote: "Go 1.24" }],
    importance: 2, anchor_ids: [], ...over,
  };
}

describe("keyMoments", () => {
  // S11-fix M4: момент числа — слово с цифрами (или числительное) внутри цитаты, а не её первое слово
  it("кадр слова: lead + речь слов до него; числа — по слову числа в цитате, термины — по word_id; по времени", () => {
    expect(keyMoments(item(), doc, DEFAULT_READING, F30)).toEqual([
      { text: "1,24", value: 1.24, frame: frameAfter(2) },
      { text: "2025", value: 2025, frame: frameAfter(9) },
      { text: "Карта", frame: frameAfter(11) },
    ]);
  });

  it("цитаты нет во фрагменте, слово вне сцены — момента нет; первое слово — кадр lead", () => {
    const m = keyMoments(item({ key_terms: [{ text: "С", word_id: "w_000001" }, { text: "вне", word_id: "w_000099" }], data: [{ label: "x", value: 7, quote: "семь раз" }] }), doc, DEFAULT_READING, F30);
    expect(m).toEqual([{ text: "С", frame: 15 }]);
  });
});

describe("keyMoments: числительное словами", () => {
  it("цитата «уже в феврале» без цифр, но с числительным — по слову числительного", () => {
    const T = "Карта стала быстрее ровно в восемь раз за год.";
    const d: ScriptRevisionDoc = { schema_version: 1, script_id: "scr_1", revision: 1, ...tokenizeScript([{ title: "Блок", text: T }]), author: "user" };
    const it2 = item({ end_word_id: "w_000009", quote: T, key_terms: [], data: [{ label: "раз", value: 8, quote: "ровно в восемь раз" }] });
    expect(keyMoments(it2, d, DEFAULT_READING, F30)).toEqual([{ text: "8", value: 8, frame: frameAfter(5) }]);
  });
});

describe("бриф: моменты слов", () => {
  it("строка «Моменты слов» с кадрами и правилом «не раньше слова»", () => {
    const moments = keyMoments(item(), doc, DEFAULT_READING, F30);
    const b = buildSceneBrief({ item: item(), index: 1, total: 3, projectTitle: "Go map", fps: F30, windows: [], moments });
    expect(b).toContain(`Моменты слов (кадр, когда звучит): «1,24» — ${frameAfter(2)}; «2025» — ${frameAfter(9)}; «Карта» — ${frameAfter(11)}`);
    expect(b).toMatch(/не раньше его кадра/);
    // без моментов строки нет
    expect(buildSceneBrief({ item: item(), index: 1, total: 3, projectTitle: "Go map", fps: F30, windows: [] })).not.toContain("Моменты слов");
  });
});
