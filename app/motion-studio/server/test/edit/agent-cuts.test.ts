// Task 28: вырезки Rough Cut Editor — проверка цитаты и границы кодом.
import { describe, expect, it } from "vitest";
import { ROUGHCUT_DEFAULTS } from "../../src/config.js";
import { agentDecisionToCut } from "../../src/edit/agent-cuts.js";
import { F30, w } from "./helpers.js";

const R = ROUGHCUT_DEFAULTS;
const words = [
  w("w_000001", "Мы", 0, 300_000), w("w_000002", "в", 400_000, 500_000), w("w_000003", "прошлом…", 600_000, 1_000_000),
  w("w_000004", "Мы", 1_100_000, 1_400_000), w("w_000005", "в", 1_500_000, 1_600_000), w("w_000006", "прошлом", 1_700_000, 2_000_000),
  w("w_000007", "году.", 2_100_000, 2_500_000), w("w_000008", "Потом", 4_000_000, 4_400_000),
];
const dec = (o: Partial<{ start_word_id: string; end_word_id: string; quote: string; reason: "false_start" | "bad_take" | "filler" | "repeat" }>) =>
  ({ start_word_id: "w_000001", end_word_id: "w_000003", reason: "false_start" as const, confidence: 0.8, explanation: "фальстарт", quote: "Мы в прошлом", ...o });

describe("agentDecisionToCut", () => {
  it("цитата совпала — вырезка по словам с границами add_cut, origin agent, proposed", () => {
    expect(agentDecisionToCut(dec({}), words, R, F30, { id: "agt_r1_1" })).toEqual({
      id: "agt_r1_1", reason: "false_start", origin: "agent", status: "proposed", start_word_id: "w_000001", end_word_id: "w_000003",
      source_start_us: 0, source_end_us: 1_000_000, confidence: 0.8, explanation: "фальстарт — «Мы в прошлом»",
    });
  });

  it("выдуманная цитата, чужие и неизвестные слова, обратный порядок — отклонение с кодом", () => {
    expect(agentDecisionToCut(dec({ start_word_id: "w_000002", end_word_id: "w_000003", quote: "совсем другое" }), words, R, F30)).toEqual({ rejected: "quote_mismatch" });
    expect(agentDecisionToCut(dec({ quote: "мы в прошлом году" }), words, R, F30)).toEqual({ rejected: "quote_mismatch" });
    expect(agentDecisionToCut(dec({ start_word_id: "w_000099", quote: "x" }), words, R, F30)).toEqual({ rejected: "unknown_word" });
    expect(agentDecisionToCut(dec({ start_word_id: "w_000003", end_word_id: "w_000001" }), words, R, F30)).toEqual({ rejected: "order" });
  });

  it("длинная пауза после слов агенту не достаётся (ревью D2): конец — конец слова", () => {
    const c = agentDecisionToCut(dec({ start_word_id: "w_000004", end_word_id: "w_000007", quote: "Мы в прошлом году", reason: "bad_take" }), words, R, F30);
    expect(c).toMatchObject({ source_start_us: 1_100_000, source_end_us: 2_500_000 });
  });

  it("слово за концом исходника — word_out_of_range", () => {
    expect(agentDecisionToCut(dec({ start_word_id: "w_000008", end_word_id: "w_000008", quote: "потом" }), words, R, F30, { sourceDurationUs: 3_000_000 }))
      .toEqual({ rejected: "word_out_of_range" });
  });
});

describe("agentDecisionToCut: слишком длинные вырезки (ревью Task 28, M6)", () => {
  const many = (n: number, stepUs: number, text = (i: number) => `слово${i}`) =>
    Array.from({ length: n }, (_, i) => w(`w_${String(i + 1).padStart(6, "0")}`, text(i), i * stepUs, i * stepUs + stepUs - 50_000));
  const span = (ws: ReturnType<typeof many>, a: number, b: number) => ({
    start_word_id: ws[a]!.id, end_word_id: ws[b]!.id, reason: "bad_take" as const, confidence: 0.7, explanation: "дубль",
    quote: ws.slice(a, b + 1).map((x) => x.text).join(" "),
  });

  it("больше 40 слов — too_long; 40 — можно", () => {
    const ws = many(60, 200_000);
    expect(agentDecisionToCut(span(ws, 0, 40), ws, R, F30)).toEqual({ rejected: "too_long" });
    expect(agentDecisionToCut(span(ws, 0, 39), ws, R, F30)).not.toHaveProperty("rejected");
  });

  it("длиннее 15 с — too_long", () => {
    const ws = many(10, 2_000_000);
    expect(agentDecisionToCut(span(ws, 0, 8), ws, R, F30)).toEqual({ rejected: "too_long" });
    expect(agentDecisionToCut(span(ws, 0, 5), ws, R, F30)).not.toHaveProperty("rejected");
  });

  it("два конца предложения внутри — too_long (вырезка через несколько предложений); один — можно", () => {
    const ws = many(12, 300_000, (i) => (i === 3 || i === 7 ? `конец${i}.` : `слово${i}`));
    expect(agentDecisionToCut(span(ws, 0, 9), ws, R, F30)).toEqual({ rejected: "too_long" });
    expect(agentDecisionToCut(span(ws, 0, 5), ws, R, F30)).not.toHaveProperty("rejected");
    // точка на последнем слове вырезки — не «внутри»
    expect(agentDecisionToCut(span(ws, 4, 7), ws, R, F30)).not.toHaveProperty("rejected");
  });
});
