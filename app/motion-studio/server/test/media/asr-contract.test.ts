// Task 26: контракт вывода воркера ASR ai-platform (Review Focus 7): нарушение — отказ, не «починка».
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AsrContractError, AsrWorkerOutputSchema, parseAsrOutput, toTranscriptWords, trimToDuration } from "../../src/media/asr-contract.js";

const raw = (name: string): string => readFileSync(new URL(`../fixtures/asr/${name}`, import.meta.url), "utf8");
const fx = (name: string): unknown => JSON.parse(raw(name));
const out = (words: unknown[], extra: Record<string, unknown> = {}) => JSON.stringify({ language: "ru", duration: 5, elapsed_s: 1, words, ...extra });
const reject = (text: string, audioS = 5) => {
  try {
    parseAsrOutput(text, { audioDurationS: audioS });
  } catch (e) {
    expect(e).toBeInstanceOf(AsrContractError);
    return (e as Error).message;
  }
  throw new Error("вывод принят, а должен быть отклонён");
};

describe("AsrWorkerOutputSchema", () => {
  it("фикстуры: годный вывод проходит, s > e и лишнее поле — нет", () => {
    expect(AsrWorkerOutputSchema.safeParse(fx("words-ok.json")).success).toBe(true);
    expect(AsrWorkerOutputSchema.safeParse(fx("words-bad-order.json")).success).toBe(false);
    expect(AsrWorkerOutputSchema.safeParse(fx("words-extra-field.json")).success).toBe(false);
  });

  it("начала слов не убывают; лишнее поле верхнего уровня — нарушение", () => {
    expect(AsrWorkerOutputSchema.safeParse(JSON.parse(out([{ w: "a", s: 1, e: 1.2 }, { w: "b", s: 0.5, e: 0.7 }]))).success).toBe(false);
    expect(AsrWorkerOutputSchema.safeParse(JSON.parse(out([], { segments: [] }))).success).toBe(false);
  });
});

describe("parseAsrOutput", () => {
  it("годный вывод: слова и длительность", () => {
    const o = parseAsrOutput(raw("words-ok.json"), { audioDurationS: 5.04 });
    expect(o.words).toHaveLength(6);
    expect(o.duration).toBe(5);
  });

  it("длительность воркера расходится со звуком > 0,1 с → нарушение", () => {
    expect(reject(out([{ w: "a", s: 0, e: 1 }]), 5.2)).toMatch(/длительност/);
    expect(() => parseAsrOutput(out([{ w: "a", s: 0, e: 1 }]), { audioDurationS: 5.1 })).not.toThrow();
  });

  it("пустой вывод, не JSON, обрезанный JSON → нарушение", () => {
    expect(reject("")).toMatch(/пуст/);
    expect(reject("   \n")).toMatch(/пуст/);
    expect(reject("loading weights…\n")).toMatch(/JSON/);
    expect(reject(out([{ w: "a", s: 0, e: 1 }]).slice(0, 40))).toMatch(/JSON/);
  });

  it("NaN, Infinity, отрицательные и нечисловые времена → нарушение", () => {
    expect(reject('{"language":"ru","duration":5,"elapsed_s":1,"words":[{"w":"a","s":NaN,"e":1}]}')).toMatch(/JSON/);
    expect(reject('{"language":"ru","duration":Infinity,"elapsed_s":1,"words":[]}')).toMatch(/JSON/);
    expect(reject(out([{ w: "a", s: -0.5, e: 1 }]))).toMatch(/контракт/);
    expect(reject(out([{ w: "a", s: "0.5", e: 1 }]))).toMatch(/контракт/);
    expect(reject(JSON.stringify({ language: "ru", duration: Infinity, elapsed_s: 1, words: [] }))).toMatch(/JSON|контракт/);
  });

  it("слово за пределами длительности → нарушение; на границе (округление до мс) — нет", () => {
    expect(reject(out([{ w: "a", s: 4.5, e: 5.3 }]))).toMatch(/за пределами/);
    expect(reject(out([{ w: "a", s: 6, e: 6.2 }]))).toMatch(/за пределами/);
    expect(() => parseAsrOutput(out([{ w: "a", s: 4.5, e: 5.0 }]), { audioDurationS: 5 })).not.toThrow();
  });

  it("сообщение несёт начало вывода (для журнала задачи)", () => {
    const e = (() => {
      try {
        parseAsrOutput("oops, not json", { audioDurationS: 5 });
      } catch (x) {
        return x as AsrContractError;
      }
    })()!;
    expect(e.code).toBe("asr_contract_violation");
    expect(e.head).toBe("oops, not json");
  });
});

describe("toTranscriptWords", () => {
  it("id w_000001…, µs, timing asr, confidence null; пустые слова отброшены", () => {
    expect(toTranscriptWords({ language: "ru", duration: 3, elapsed_s: 1, words: [{ w: "Привет.", s: 0.12, e: 0.5 }, { w: " ", s: 0.6, e: 0.6 }, { w: "Мир", s: 1.9, e: 2.3 }] }))
      .toEqual([
        { id: "w_000001", text: "Привет.", start_us: 120_000, end_us: 500_000, timing: "asr", confidence: null },
        { id: "w_000002", text: "Мир", start_us: 1_900_000, end_us: 2_300_000, timing: "asr", confidence: null },
      ]);
  });

  it("округление до µs не нарушает s ≤ e и порядок", () => {
    const ws = toTranscriptWords({ language: "ru", duration: 3, elapsed_s: 1, words: [{ w: "a", s: 0.1234565, e: 0.1234565 }, { w: "b", s: 0.1234566, e: 0.2 }] });
    expect(ws[0]!.start_us).toBeLessThanOrEqual(ws[0]!.end_us);
    expect(ws[1]!.start_us).toBeGreaterThanOrEqual(ws[0]!.start_us);
  });
});

describe("ревью Task 26", () => {
  const out = (ws: [string, number, number][]) => ({ language: "ru", duration: 3, elapsed_s: 1, words: ws.map(([w, s, e]) => ({ w, s, e })) });

  it("m10: слова пустые после удаления \\p{Cf} отброшены; \\p{Cc} — пробел; пробелы схлопнуты", () => {
    const ws = toTranscriptWords(out([["\u200b", 0, 0.1], ["\u202e\u2066", 0.1, 0.2], ["a\nb", 0.2, 0.3], ["\u0007", 0.3, 0.4], ["при\u00adвет", 0.4, 0.5], ["x\t\ty", 0.5, 0.6], ["\u2028", 0.6, 0.7]]));
    expect(ws.map((w) => w.text)).toEqual(["a b", "привет", "x y"]);
    expect(ws.map((w) => w.id)).toEqual(["w_000001", "w_000002", "w_000003"]);
  });

  it("m6: trimToDuration — слова после конца видео отброшены, пересекающие конец обрезаны", () => {
    const ws = toTranscriptWords(out([["a", 0.1, 0.5], ["b", 2.8, 3.2], ["c", 3.0, 3.1], ["d", 3.4, 3.6]]));
    const t = trimToDuration(ws, 3_000_000);
    expect(t.words.map((w) => [w.id, w.start_us, w.end_us])).toEqual([["w_000001", 100_000, 500_000], ["w_000002", 2_800_000, 3_000_000]]);
    expect(t).toMatchObject({ dropped: 2, clamped: 1 });
    expect(trimToDuration(ws, 10_000_000)).toMatchObject({ dropped: 0, clamped: 0, words: ws });
  });
});
