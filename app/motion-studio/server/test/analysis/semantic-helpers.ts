// Фабрики для тестов смыслового анализа (Task 31): слова, ответ агента, якоря и главы.
import { type SemanticAgentOutput, type TranscriptWord, buildTimeline, mapWords } from "@ms/contracts";
import { F30, w } from "../edit/helpers.js";

export const id = (i: number): string => `w_${String(i).padStart(6, "0")}`;

/**
 * 10 слов по 1 с (слово i — `[(i−1) с, (i−1) с + 0,9 с]`); вырезка 2,0–3,5 с: `w_000003` вырезано
 * целиком, `w_000004` (3,0–3,9 с) — частично (clipped).
 */
export const TEXTS10 = ["Сегодня", "мы", "эээ", "покажем,", "как", "рост", "составил", "5%", "за", "год."];
export const words10: TranscriptWord[] = TEXTS10.map((t, i) => w(id(i + 1), t, i * 1_000_000, i * 1_000_000 + 900_000));
export const tl10 = buildTimeline(10_000_000, [{ start_us: 2_000_000, end_us: 3_500_000 }], F30);
export const map10 = mapWords(tl10, words10);

export function out(over: Partial<SemanticAgentOutput> = {}): SemanticAgentOutput {
  return { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [], ...over };
}

export function anchor(aid: string, s: string, e: string, quote: string, over: Partial<SemanticAgentOutput["anchors"][number]> = {}): SemanticAgentOutput["anchors"][number] {
  return { id: aid, kind: "thesis", start_word_id: s, end_word_id: e, quote, claim_type: "fact", importance: 2, emphasis_word_ids: [], ...over };
}

export function ch(cid: string, s: string, e: string, title = `Глава ${cid}`): SemanticAgentOutput["chapters"][number] {
  return { id: cid, title, summary: "", start_word_id: s, end_word_id: e };
}

/** `n` слов по 400 мс (`слово<i>`), без вырезок. */
export function manyWords(n: number): TranscriptWord[] {
  return Array.from({ length: n }, (_, i) => w(id(i + 1), `слово${i + 1}`, i * 400_000, i * 400_000 + 300_000));
}
