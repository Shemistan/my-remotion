import { describe, expect, it } from "vitest";
import { TranscriptOpSchema, TranscriptRevisionDocSchema, TranscriptWordSchema, normalizeToken, verifyQuote } from "../src/index.js";
import { SHA, ws } from "./video-fixtures.js";

function doc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1, transcript_id: "tr_1", revision: 1, media_sha256: SHA, language: "ru", author: "asr",
    asr: { model: "whisper-large-v3-turbo", worker_sha256: SHA, ai_platform_commit: "0456395", elapsed_s: 12.5 },
    words: [
      { id: "w_000001", text: "Привет", start_us: 0, end_us: 400_000, timing: "asr", confidence: null },
      { id: "w_000001.1", text: "всем", start_us: 400_000, end_us: 600_000, timing: "interpolated", confidence: null },
    ],
    segments: [{ id: "seg_0001", word_ids: ["w_000001", "w_000001.1"], start_us: 0, end_us: 600_000 }],
    removed_word_ids: [],
    ...over,
  };
}

describe("transcript", () => {
  it("normalizeToken", () => {
    expect(normalizeToken("Ещё,")).toBe("еще");
    expect(normalizeToken("«Привет!»")).toBe("привет");
    expect(normalizeToken("—")).toBe("");
    expect(normalizeToken("ЁЛКА")).toBe("елка");
    expect(normalizeToken("ёж")).toBe("еж"); // ё в разложенной форме
    // знаки, меняющие смысл числа, сохраняются
    expect(normalizeToken("5%")).toBe("5%");
    expect(normalizeToken("+5,")).toBe("+5");
    expect(normalizeToken("-5")).toBe("-5");
    expect(normalizeToken("\u22125")).toBe("-5"); // знак минус U+2212
    // дефис внутри слова и тире — пунктуация: «кто-то» = «ктото» с обеих сторон
    expect(normalizeToken("кто-то")).toBe("ктото");
    expect(normalizeToken("— да")).toBe("да");
  });

  it("verifyQuote: проценты и знак числа значимы", () => {
    expect(verifyQuote(ws("рост", "на", "5%"), "w1", "w3", "рост на 5")).toMatchObject({ ok: false, code: "quote_mismatch" });
    expect(verifyQuote(ws("рост", "на", "5%"), "w1", "w3", "рост на 5%")).toEqual({ ok: true });
    expect(verifyQuote(ws("было", "-5"), "w1", "w2", "было 5")).toMatchObject({ ok: false, code: "quote_mismatch" });
    expect(verifyQuote(ws("было", "-5"), "w1", "w2", "было \u22125")).toEqual({ ok: true });
    expect(verifyQuote(ws("кто-то", "пришёл"), "w1", "w2", "Кто-то пришел")).toEqual({ ok: true });
  });

  it("verifyQuote: совпадение по нормализованным словам", () => {
    expect(verifyQuote(ws("Мы", "выросли", "до", "1", "000", "000", "пользователей."), "w1", "w7", "мы выросли до 1 000 000 пользователей")).toEqual({ ok: true });
    expect(verifyQuote(ws("Мы", "выросли", "до", "миллиона."), "w1", "w4", "мы выросли до ста")).toMatchObject({ ok: false, code: "quote_mismatch" });
    expect(verifyQuote(ws("Мы", "выросли", "до", "миллиона."), "w2", "w3", "Выросли — до")).toEqual({ ok: true });
    // цитата короче диапазона или длиннее — несовпадение
    expect(verifyQuote(ws("Мы", "выросли", "до"), "w1", "w3", "мы выросли")).toMatchObject({ ok: false, code: "quote_mismatch" });
    expect(verifyQuote(ws("Мы", "выросли"), "w1", "w2", "мы выросли до")).toMatchObject({ ok: false, code: "quote_mismatch" });
    expect(verifyQuote(ws("Мы"), "w1", "w1", "")).toMatchObject({ ok: false, code: "quote_mismatch" });
  });

  it("verifyQuote: неизвестные слова и порядок", () => {
    expect(verifyQuote(ws("Мы", "выросли"), "w1", "w9", "мы выросли")).toMatchObject({ ok: false, code: "unknown_word" });
    expect(verifyQuote(ws("Мы", "выросли"), "w2", "w1", "выросли мы")).toMatchObject({ ok: false, code: "order" });
  });

  it("TranscriptWord: id и время", () => {
    const word = { id: "w_000001", text: "а", start_us: 0, end_us: 1, timing: "asr", confidence: null };
    expect(TranscriptWordSchema.safeParse(word).success).toBe(true);
    expect(TranscriptWordSchema.safeParse({ ...word, id: "w_000001.2" }).success).toBe(true);
    expect(TranscriptWordSchema.safeParse({ ...word, id: "w1" }).success).toBe(false);
    expect(TranscriptWordSchema.safeParse({ ...word, start_us: 5, end_us: 4 }).success).toBe(false);
    expect(TranscriptWordSchema.safeParse({ ...word, confidence: 0.9 }).success).toBe(false);
    expect(TranscriptWordSchema.safeParse({ ...word, start_us: 0.5 }).success).toBe(false);
  });

  it("TranscriptRevisionDoc", () => {
    expect(TranscriptRevisionDocSchema.safeParse(doc()).success).toBe(true);
    expect(TranscriptRevisionDocSchema.safeParse(doc({
      revision: 2, parent_revision: 1, author: "user", asr: undefined, ops: [{ op: "replace_text", word_id: "w_000001", text: "Здравствуйте" }],
    })).success).toBe(true);
    // ссылки сегментов и удалённых слов — только на существующие слова; id уникальны
    expect(TranscriptRevisionDocSchema.safeParse(doc({ segments: [{ id: "seg_0001", word_ids: ["w_000009"], start_us: 0, end_us: 1 }] })).success).toBe(false);
    const d = doc();
    const words = d.words as Array<Record<string, unknown>>;
    expect(TranscriptRevisionDocSchema.safeParse({ ...d, words: [words[0], words[0]] }).success).toBe(false);
  });

  it("TranscriptRevisionDoc: удалённые слова — вне words (пример Task 27)", () => {
    const word = (id: string, s: number): Record<string, unknown> => ({ id, text: id, start_us: s, end_us: s + 300_000, timing: "asr", confidence: null });
    const del = doc({
      revision: 2, parent_revision: 1, author: "user", asr: undefined,
      words: [word("w_000001", 0), word("w_000003", 600_000)],
      segments: [{ id: "seg_0001", word_ids: ["w_000001", "w_000003"], start_us: 0, end_us: 900_000 }],
      removed_word_ids: ["w_000002"],
    });
    expect(TranscriptRevisionDocSchema.safeParse(del).success).toBe(true);
    // удалённое слово не может оставаться в words; повтор в removed_word_ids — ошибка
    expect(TranscriptRevisionDocSchema.safeParse({ ...del, removed_word_ids: ["w_000003"] }).success).toBe(false);
    expect(TranscriptRevisionDocSchema.safeParse({ ...del, removed_word_ids: ["w_000002", "w_000002"] }).success).toBe(false);
  });

  it("TranscriptRevisionDoc: start_us слов не убывает", () => {
    const d = doc();
    const [a, b] = d.words as Array<Record<string, unknown>>;
    expect(TranscriptRevisionDocSchema.safeParse({ ...d, words: [b, a] }).success).toBe(false);
    // вставленное слово нулевой длины на стыке — допустимо
    const z = { ...b, id: "w_000001.2", start_us: 600_000, end_us: 600_000, timing: "interpolated" };
    expect(TranscriptRevisionDocSchema.safeParse({ ...d, words: [a, b, z] }).success).toBe(true);
  });

  it("TranscriptOp", () => {
    expect(TranscriptOpSchema.safeParse({ op: "replace_span", start_word_id: "w_000001", end_word_id: "w_000002", text: "x y" }).success).toBe(true);
    expect(TranscriptOpSchema.safeParse({ op: "delete", word_id: "w_000001" }).success).toBe(false);
  });
});
