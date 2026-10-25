import type { TranscriptWord } from "../src/index.js";

export const F30 = { num: 30, den: 1 };
export const NTSC = { num: 30000, den: 1001 };
export const SHA = "a".repeat(64);
export const TS = "2026-10-23T00:00:00.000Z";

/** Слово с заданными границами (для математики таймлайна). */
export function w(id: string, start_us: number, end_us: number, text = id): TranscriptWord {
  return { id, text, start_us, end_us, timing: "asr", confidence: null };
}

/** Слова подряд по 300 мс: ids `w1`, `w2`, …; текст — аргументы. */
export function ws(...texts: string[]): TranscriptWord[] {
  return texts.map((t, i) => w(`w${i + 1}`, i * 300_000, (i + 1) * 300_000, t));
}

/** Слова w5…w9 по 300 мс через 50 мс: 4_000_000–4_300_000 … 5_700_000–6_000_000. */
export function words59(): TranscriptWord[] {
  return [5, 6, 7, 8, 9].map((n, i) => w(`w${n}`, 4_000_000 + i * 425_000, 4_300_000 + i * 425_000));
}

export function dec(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cut_001", reason: "pause", origin: "detector", status: "proposed",
    source_start_us: 2_000_000, source_end_us: 3_500_000, confidence: 0.9, explanation: "пауза 1,5 с",
    ...over,
  };
}

export function planner(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    style: { preset: "dark-premium", intensity: "balanced", depth: 1, rationale: "спокойный разговор" },
    opportunities: [{
      id: "op_1", anchor_ids: ["a1"], start_word_id: "w_000001", end_word_id: "w_000004", decision: "plan",
      purpose: "показать рост", visual_type: "growth-decline", composition_mode: "overlay", zone: "right_third",
      key_terms: [{ text: "рост", word_id: "w_000002" }], metaphor: "лестница", complexity: 2, usefulness: 4, effort: 2, visual_load: 2,
      evidence: [{ quote: "мы выросли", start_word_id: "w_000001", end_word_id: "w_000002" }],
      ...over,
    }],
  };
}
