// Фикстуры правки плана сценария (S4): текст из двух блоков (60 + 10 слов) и план из трёх
// принятых сцен с разными приёмами; время сцен — по `readingFrames`, как у S3.
import {
  DEFAULT_READING, type ScriptPlanRevisionDoc, type ScriptSceneItem, type Technique, ScriptPlanRevisionDocSchema, atSeconds, quoteOf, readingFrames,
} from "@ms/contracts";
import { docOf, w } from "./plan-fixtures.js";

export { w };

const sentence = (from: number, n: number): string =>
  `${Array.from({ length: n }, (_, i) => `слово${from + i}`).join(" ")}.`;

/** Блок b1: w_000001–w_000060 (предложения по 12 слов); блок b2: w_000061–w_000070 (без цифр: «кот»). */
export const SCRIPT = docOf([
  { title: "Первый", text: [1, 13, 25, 37, 49].map((f) => sentence(f, 12)).join(" ") },
  { title: "Второй", text: `${Array.from({ length: 10 }, () => "кот").join(" ")}.` },
]);

export const FPS = { num: 30, den: 1 };
export const SHA = "a".repeat(64);

/** Сцена плана по словам `s…e` текста SCRIPT. */
export function itemOf(id: string, s: number, e: number, technique: Technique, over: Partial<ScriptSceneItem> = {}): ScriptSceneItem {
  const n = e - s + 1;
  const blockId = SCRIPT.words[s - 1]!.block_id;
  const before = SCRIPT.words.slice(0, s - 1).filter((x) => x.block_id === blockId).length;
  return {
    id, status: "accepted", origin: "agent", start_word_id: w(s), end_word_id: w(e), quote: quoteOf(SCRIPT, w(s), w(e)),
    block_id: blockId, words: n, at_s: atSeconds(before, DEFAULT_READING), frames: readingFrames(n, DEFAULT_READING, FPS),
    technique, pattern: "system-structure", purpose: "назначение", idea: "идея", key_terms: [], data: [], importance: 2, anchor_ids: [],
    ...over,
  };
}

/** План r1: ss_001 w1–w12 hero-number, ss_002 w13–w26 structure-build, ss_003 w45–w58 bar-compare. */
export const PLAN: ScriptPlanRevisionDoc = ScriptPlanRevisionDocSchema.parse({
  schema_version: 1, plan_id: "pln_test", revision: 1,
  inputs: { script: { id: SCRIPT.script_id, revision: SCRIPT.revision, hash: SHA }, style: { id: "sty_1", revision: 1, hash: SHA } },
  fps: FPS, aspect: "16:9", reading: DEFAULT_READING,
  analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
  items: [
    itemOf("ss_001", 1, 12, "hero-number", { pattern: "quantities" }),
    itemOf("ss_002", 13, 26, "structure-build"),
    itemOf("ss_003", 45, 58, "bar-compare", { pattern: "comparison" }),
  ],
  skipped: [], issues: [],
  diversity: { techniques: { "hero-number": 1, "structure-build": 1, "bar-compare": 1 }, adjacent_repeats: 0, kinetic_share: 0 },
});
