// Склейка слов транскрипта для показа и русские множественные формы (ревью Task 33 V3, #5).
import { describe, expect, it } from "vitest";
import { gluesToPrevious, joinWords, ruPlural, verifyQuote } from "../src/index.js";

describe("joinWords", () => {
  it("токены с дефиса и пунктуация присоединяются без пробела", () => {
    expect(joinWords(["MAC", "-адреса"])).toBe("MAC-адреса");
    expect(joinWords(["что", "-то"])).toBe("что-то");
    expect(joinWords(["IP", "-шник", "отправителя", ",", "и", "получателя", "."])).toBe("IP-шник отправителя, и получателя.");
    expect(joinWords(["Привет", "!", "Как", "дела", "?"])).toBe("Привет! Как дела?");
  });

  it("пробелы ASR по краям слов не удваиваются; тире и минус числа — отдельные слова", () => {
    expect(joinWords([" это", " по", " сути "])).toBe("это по сути");
    expect(joinWords(["было", "—", "стало"])).toBe("было — стало");
    expect(joinWords(["было", "-", "стало"])).toBe("было - стало");
    expect(joinWords(["температура", "-5"])).toBe("температура -5");
    expect(joinWords([])).toBe("");
  });

  it("gluesToPrevious: какие токены пристыковываются к предыдущему", () => {
    expect(["-адреса", " -то", ",", ".", "…", "»", ")", "%", "?"].map(gluesToPrevious)).toEqual(Array(9).fill(true));
    expect(["слово", "—", "-", "-5", "«"].map(gluesToPrevious)).toEqual(Array(5).fill(false));
  });

  it("verifyQuote принимает цитату со склеенными словами («MAC-адреса»)", () => {
    const words = [{ id: "w1", text: "MAC" }, { id: "w2", text: "-адреса" }, { id: "w3", text: "получателя" }];
    expect(verifyQuote(words, "w1", "w3", "MAC-адреса получателя").ok).toBe(true);
    expect(verifyQuote(words, "w1", "w3", "MAC -адреса получателя").ok).toBe(true);
    expect(verifyQuote(words, "w1", "w3", "MAC-адреса отправителя").ok).toBe(false);
  });
});

describe("ruPlural", () => {
  it("формы one / few / many", () => {
    const f = (n: number) => `${n} ${ruPlural(n, "сцена", "сцены", "сцен")}`;
    expect([1, 2, 4, 5, 11, 12, 21, 22, 25, 0].map(f)).toEqual([
      "1 сцена", "2 сцены", "4 сцены", "5 сцен", "11 сцен", "12 сцен", "21 сцена", "22 сцены", "25 сцен", "0 сцен",
    ]);
  });
});
