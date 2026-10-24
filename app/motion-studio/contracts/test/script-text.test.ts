// S1 «сценарий → моушн»: чистые функции текста — слова, предложения, время чтения, цитаты (§5.1–§5.2).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_READING, ScriptRevisionDocSchema, SceneFramesSchema, atSeconds, quoteOf, readingFrames, tokenizeScript, wordsBetween } from "../src/index.js";

const F30 = { num: 30, den: 1 };

describe("tokenizeScript", () => {
  it("слова: числа с точкой и запятой, дефис — одно слово; тире и пунктуация — не слова", () => {
    const t = tokenizeScript([{ title: "Блок 1", text: "С Go 1.24 — а он вышел в феврале 2025 года — кто-то, 6,5 бакета; один к 256." }]);
    expect(t.words.map((w) => w.text)).toEqual(["С", "Go", "1.24", "а", "он", "вышел", "в", "феврале", "2025", "года", "кто-то", "6,5", "бакета", "один", "к", "256"]);
    expect(t.words[0]).toMatchObject({ id: "w_000001", block_id: "b1", start: 0, end: 1, sentence: 0 });
    expect(t.words[2]).toMatchObject({ start: 5, end: 9 });
    expect(t.blocks).toEqual([{ id: "b1", title: "Блок 1", text: "С Go 1.24 — а он вышел в феврале 2025 года — кто-то, 6,5 бакета; один к 256." }]);
  });

  it("предложения по блоку, id слов сквозные; документ проходит схему", () => {
    const two = tokenizeScript([{ title: "", text: "Раз. Два три!" }, { title: "", text: "Четыре" }]);
    expect(two.words.map((w) => [w.id, w.block_id, w.sentence])).toEqual([["w_000001", "b1", 0], ["w_000002", "b1", 1], ["w_000003", "b1", 1], ["w_000004", "b2", 0]]);
    expect(ScriptRevisionDocSchema.safeParse({ schema_version: 1, script_id: "scr_1", revision: 1, ...two, author: "user" }).success).toBe(true);
    // точка внутри числа и строчная буква после точки — не граница
    expect(tokenizeScript([{ title: "", text: "Версия 1.24 вышла. и дальше" }]).words.map((w) => w.sentence)).toEqual([0, 0, 0, 0, 0]);
  });

  const file = new URL("../../../../tmp/script-mvp/block-1.txt", import.meta.url);
  it.skipIf(!existsSync(file))("текст человека: block-1 без строки заголовка → 205 слов", () => {
    const text = readFileSync(file, "utf8").split("\n").slice(1).join("\n").trim();
    expect(tokenizeScript([{ title: "", text }]).words).toHaveLength(205);
  });
});

describe("readingFrames", () => {
  it("формулы §5.2 в целых: хвост = total − lead − speech", () => {
    expect(readingFrames(16, DEFAULT_READING, F30)).toEqual({ lead: 15, speech: 192, tail: 30, total: 237 }); // 16 / 2,5 = 6,4 с
    expect(readingFrames(3, DEFAULT_READING, F30)).toEqual({ lead: 15, speech: 36, tail: 39, total: 90 }); // минимум 3 с
    expect(readingFrames(10, { wps: 2, lead_s: 0, tail_s: 0 }, { num: 30000, den: 1001 }).speech).toBe(150); // ceil(5 · 29,97)
    expect(readingFrames(25, { wps: 3, lead_s: 0.5, tail_s: 1 }, F30).speech).toBe(250); // без ошибки плавающей точки
    for (const n of [1, 7, 33, 120]) expect(SceneFramesSchema.safeParse(readingFrames(n, DEFAULT_READING, { num: 24000, den: 1001 })).success, String(n)).toBe(true);
  });

  it("atSeconds: слов до фрагмента / wps, до 0,1 с", () => {
    expect(atSeconds(25, DEFAULT_READING)).toBe(10);
    expect(atSeconds(7, { wps: 3, lead_s: 0, tail_s: 0 })).toBe(2.3);
  });
});

describe("цитаты", () => {
  const doc = tokenizeScript([{ title: "", text: "Раз, два — три." }]);
  it("wordsBetween и quoteOf", () => {
    expect(wordsBetween(doc, "w_000001", "w_000002").map((w) => w.text)).toEqual(["Раз", "два"]);
    expect(quoteOf(doc, "w_000001", "w_000003")).toBe("Раз два три");
    expect(wordsBetween(doc, "w_000003", "w_000001")).toEqual([]);
    expect(quoteOf(doc, "w_000001", "w_000009")).toBe("");
  });
});
