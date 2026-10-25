// Фикстуры плана сценария (S3): текст из трёх предложений (40 слов) и ответы Script Director.
import {
  type ScriptDirectorOutput, type ScriptDirectorScene, ScriptDirectorOutputSchema, type ScriptRevisionDoc, quoteOf, tokenizeScript,
} from "@ms/contracts";

/** 3 предложения, 40 слов: w_000001–w_000014, w_000015–w_000028, w_000029–w_000040. */
export const TEXT =
  "С Go 1.24 встроенная map в Go реализована заново на основе дизайна Swiss Table. " +
  "Старая map держала записи в бакетах по восемь слотов, а пара бакетов делила цепочку. " +
  "Когда в среднем на бакет приходилось шесть с половиной записей, массив удваивался.";

export const w = (n: number): string => `w_${String(n).padStart(6, "0")}`;

/** Документ ревизии текста из блоков (как `saveScriptText`, без хранилища). */
export function docOf(blocks: { title: string; text: string }[]): ScriptRevisionDoc {
  return { schema_version: 1, script_id: "scr_test", revision: 1, ...tokenizeScript(blocks), author: "user" };
}
export const DOC = docOf([{ title: "Блок", text: TEXT }]);

/** Сцена ответа агента: цитата по словам документа, приём `structure-build`, если не задан. */
export function scene(doc: ScriptRevisionDoc, s: string, e: string, over: Partial<ScriptDirectorScene> = {}): ScriptDirectorScene {
  return {
    start_word_id: s, end_word_id: e, quote: quoteOf(doc, s, e), technique: "structure-build", pattern: "system-structure",
    purpose: "зритель поймёт устройство", idea: "блоки собираются в схему", key_terms: [], data: [], importance: 2, anchor_ids: [], decision: "plan", ...over,
  };
}

/** Ответ Script Director: одна глава на весь текст, числа — пусто (Р24: только chapters и numbers). */
export function out(doc: ScriptRevisionDoc, scenes: ScriptDirectorScene[], over: Partial<ScriptDirectorOutput> = {}): ScriptDirectorOutput {
  return ScriptDirectorOutputSchema.parse({
    chapters: [{ id: "ch_01", title: "Map", summary: "", start_word_id: doc.words[0]!.id, end_word_id: doc.words.at(-1)!.id }],
    numbers: [],
    scenes,
    style: { preset: "dark-premium", intensity: "balanced", depth: 1, rationale: "техническая тема" },
    ...over,
  });
}

/** Чистый ответ для DOC: три сцены, разные приёмы и формы времени, число 1.24 с цитатой. */
export const cleanScenes = (doc: ScriptRevisionDoc = DOC): ScriptDirectorScene[] => [
  scene(doc, w(1), w(14), { technique: "hero-number", pattern: "quantities", data: [{ label: "версия", value: 1.24, quote: "Go 1.24" }] }),
  scene(doc, w(15), w(28), { technique: "structure-build", pattern: "system-structure", data: [{ label: "слотов", value: 8, quote: "восемь слотов" }] }),
  scene(doc, w(29), w(40), { technique: "bar-compare", pattern: "comparison", data: [{ label: "записей на бакет", value: 6.5, quote: "шесть с половиной записей" }] }),
];
