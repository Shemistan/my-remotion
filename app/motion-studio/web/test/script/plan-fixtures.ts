// Моки состояния сценарного проекта (S8): текст из двух блоков, план из четырёх сцен, пропуск,
// проблемы плана. Документы проходят схемы контрактов — UI видит то же, что отдал бы сервер.
import {
  DEFAULT_READING,
  type PlanIssue,
  type ReadingSettings,
  type ScriptPlanRevisionDoc,
  type ScriptRevisionDoc,
  type ScriptSceneItem,
  type ScriptStateDto,
  type Technique,
  ScriptStateDtoSchema,
  quoteOf,
  readingFrames,
  tokenizeScript,
  wordsBetween,
} from "@ms/contracts";
import { TS } from "../helpers.js";
import { styleDto } from "../video/plan-fixtures.js";

export const F30 = { num: 30, den: 1 };
const HASH = "a".repeat(64);

export const BLOCKS = [
  { title: "Swiss Table", text: "В Go 1.24 — Swiss Table. Таблица делится на группы по восемь слотов. Каждый слот хранит ключ и значение." },
  { title: "Поиск", text: "Поиск сначала сравнивает один байт хэша сразу во всей группе. Совпадение бывает редко, поэтому лишних сравнений почти нет." },
];

export function scriptDoc(revision = 1): ScriptRevisionDoc {
  const { blocks, words } = tokenizeScript(BLOCKS);
  return { schema_version: 1, script_id: "scr_1", revision, blocks, words, author: "user" };
}

const project = { id: "p1", kind: "script" as const, title: "Go map", settings: null, created_at: TS, updated_at: TS };

export function item(doc: ScriptRevisionDoc, id: string, start: string, end: string, technique: Technique, over: Partial<ScriptSceneItem> = {}, reading: ReadingSettings = DEFAULT_READING): ScriptSceneItem {
  const ws = wordsBetween(doc, start, end);
  const block = ws[0]!.block_id;
  const before = doc.words.filter((w) => w.block_id === block && w.id < start).length;
  return {
    id, status: "accepted", origin: "agent", start_word_id: start, end_word_id: end, quote: quoteOf(doc, start, end), block_id: block,
    words: ws.length, at_s: Math.round((before / reading.wps) * 10) / 10, frames: readingFrames(ws.length, reading, F30),
    technique, pattern: "quantities", purpose: `Зритель понимает сцену ${id}`, idea: `Идея ${id}`,
    key_terms: [], data: [], importance: 2, anchor_ids: [], ...over,
  };
}

/** Слова фикстуры: блок 1 — w_000001…w_000018, блок 2 — w_000019…w_000036. */
export function planDoc(doc: ScriptRevisionDoc, over: Partial<ScriptPlanRevisionDoc> = {}): ScriptPlanRevisionDoc {
  const items = [
    item(doc, "ss_001", "w_000001", "w_000005", "hero-number", { data: [{ label: "версия", value: 1.24, quote: "Go 1.24" }], key_terms: [{ text: "Swiss Table", word_id: "w_000004" }] }),
    item(doc, "ss_002", "w_000006", "w_000012", "structure-build", { pattern: "system-structure", structure_rule: "request-answer" }),
    item(doc, "ss_003", "w_000013", "w_000018", "checklist", { pattern: "key-point-emphasis" }),
    item(doc, "ss_004", "w_000019", "w_000028", "race", { pattern: "comparison", origin: "user" }),
  ];
  const issues: PlanIssue[] = [
    { item_id: "ss_004", code: "scene_long", severity: "warning", message: "речь 13,2 с > 12 с" },
    { item_id: "ss_001", code: "value_unverified", severity: "warning", message: "число не сверено с цитатой" },
    { code: "coverage_low", severity: "warning", message: "в сценах 25 % слов" },
  ];
  return {
    schema_version: 1, plan_id: "pln_1", revision: 3, parent_revision: 2,
    inputs: { script: { id: "scr_1", revision: doc.revision, hash: HASH }, style: { id: "sty_1", revision: 1, hash: HASH } },
    fps: F30, aspect: "16:9", reading: DEFAULT_READING,
    analysis: {
      chapters: [{ id: "ch_1", title: "Устройство Swiss Table", summary: "Группы и слоты", start_word_id: "w_000001", end_word_id: "w_000018" }],
      anchors: [], entities: [],
      numbers: [{ value: 8, start_word_id: "w_000011", end_word_id: "w_000012", quote: "восемь слотов", claim_type: "fact" }],
      causal: [], disputed: [],
    },
    items,
    skipped: [{ start_word_id: "w_000029", end_word_id: "w_000036", quote: quoteOf(doc, "w_000029", "w_000036"), reason: "Повтор мысли предыдущей сцены" }],
    issues,
    diversity: { techniques: { "hero-number": 1, "structure-build": 1, checklist: 1, race: 1 }, adjacent_repeats: 0, kinetic_share: 0 },
    ...over,
  };
}

export function state(over: Partial<ScriptStateDto> = {}): ScriptStateDto {
  const doc = scriptDoc();
  const plan = planDoc(doc);
  const s: ScriptStateDto = {
    project, script: doc, plan: { plan_id: "pln_1", doc: plan, approval: { state: "missing" } }, plan_outdated: false,
    style: styleDto().current, approval: { state: "missing" }, scenes: [], batches: [], packages: [], ...over,
  };
  return ScriptStateDtoSchema.parse(s);
}

export const emptyState = (): ScriptStateDto => state({ script: null, plan: null });
