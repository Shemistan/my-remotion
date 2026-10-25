// Проверка ответа Script Director кодом (спека §6.1, §5.2–§5.3): код ничего не «чинит» —
// не прошедшая сцена отклоняется с кодом и уходит в `skipped` с причиной «отклонено проверкой».
//
// Сцена: цитата дословна (`verifyQuote`: `quote_mismatch`, `unknown_word`, `order`); слова — в
// одном блоке (`cross_block`); цитата каждого числа — внутри цитаты сцены (`quote_mismatch`), его
// `value` — среди чисел цитаты: цифры — `numberMatchesQuote`, без цифр — русские числительные
// `ruNumberValues` (Р21; не совпало — `value_mismatch`, не распознано — warning `value_unverified`);
// пересечение по словам — отклоняется поздняя (`scene_overlap`). Время сцены считает код
// (`readingFrames`), id сцен `ss_001…` — по порядку текста. Пропуск агента с неверной цитатой или
// через границу блоков не отклоняется, а отбрасывается (`dropped`): это пояснение, не сцена.
//
// Разбор (`chapters`, `numbers`, по желанию остальное) — `validateSemantic` с картой «все слова
// оставлены»; числа без цифр сверяются так же, как числа сцен.
import {
  type PlanIssue, type ReadingSettings, type ScriptDirectorOutput, type ScriptDirectorScene, type ScriptPlanRevisionDoc, type ScriptRevisionDoc,
  type ScriptSceneItem, type SemanticAgentOutput, type WordMapping, atSeconds, normalizeToken, quoteOf, readingFrames, verifyQuote,
} from "@ms/contracts";
import type { Fps } from "@ms/contracts";
import { numberMatchesQuote, validateSemantic } from "../analysis/semantic-validate.js";
import { planDiversity } from "./diversity.js";
import { meaningRepeatIssues } from "./meaning-repeat.js";
import { ruNumberParse } from "./ru-numbers.js";

/** Пределы речи сцены, с (§5.2). */
export const SCENE_MIN_S = 3;
export const SCENE_LONG_S = 12;
export const SCENE_MAX_S = 20;
/** F1: доля общих слов цитаты и диапазона, с которой цитата исправляется по словам диапазона. */
export const QUOTE_FIX_SHARE = 0.8;
/** Доля слов текста в принятых сценах: ниже — `coverage_low`, выше — `coverage_high` (warning). */
export const COVERAGE_LOW = 0.35;
export const COVERAGE_HIGH = 0.85;

export type RejectCode = "quote_mismatch" | "unknown_word" | "order" | "value_mismatch" | "scene_overlap" | "cross_block";

export interface ScriptPlanValidation {
  items: ScriptSceneItem[];
  skipped: ScriptPlanRevisionDoc["skipped"];
  issues: PlanIssue[];
  analysis: SemanticAgentOutput;
  /** Отклонённые сцены ответа: `id` — номер в ответе и слова («сцена 3 w_…–w_…»), `n` — номер сцены в ответе (с 1). */
  rejected: { id: string; n: number; code: RejectCode; detail: string }[];
  /** Номер сцены ответа (с 1) для каждой принятой сцены — для доработки только проблемных сцен. */
  sources: Record<string, number>;
  /** F1: цитаты, исправленные по словам диапазона (`share` — доля общих слов). */
  fixed: { id: string; n: number; share: number; detail: string }[];
  /**
   * Отброшенные пропуски агента (неверная цитата, через границу блоков): не ошибка плана — пропуск
   * лишь пояснение, — в `skipped` не попадают и переотправку не вызывают (`id` — «пропуск 3 w_…–w_…»).
   */
  dropped: { id: string; code: RejectCode; detail: string }[];
}

const clip = (s: string, n = 120): string => (s.length > n ? `${s.slice(0, n)}…` : s);
const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

/**
 * Сверка числа с числами словами: значение — одно из распознанных чисел, их отношение
 * («один к двумстам пятидесяти шести» = 1/256) или доля при слове «процент». `undefined` — числа
 * словами не распознаны или не совпали, а в цитате есть неточное количество («десятки тысяч»,
 * «треть»): тогда не проверить, а не «не совпало».
 */
export function wordNumberMatches(value: number, quote: string): boolean | undefined {
  const { values: vals, vague } = ruNumberParse(quote);
  if (vals.length === 0) return undefined;
  const v = Math.abs(value);
  const cands = [...vals];
  for (let i = 1; i < vals.length; i++) if (vals[i] !== 0) cands.push(vals[i - 1]! / vals[i]!);
  if (/процент/i.test(quote)) cands.push(...vals.map((x) => x / 100));
  if (cands.some((c) => near(v, c))) return true;
  return vague ? undefined : false;
}

/**
 * Число совпадает с цитатой: сначала цифры (`numberMatchesQuote`), затем числа словами
 * (`wordNumberMatches`). Цифры не совпали — отказ, только если и словами не совпало («2 в степени n
 * минус четыре» → 4); цифр нет — результат слов (`undefined` — не проверить).
 */
export function valueMatches(value: number, quote: string): boolean | undefined {
  const digits = numberMatchesQuote(value, quote);
  if (digits === true) return true;
  const words = wordNumberMatches(value, quote);
  if (digits === false) return words === true;
  return words;
}

/** Нормализованные слова текста по пробелам (пустые — знаки препинания — выброшены). */
const tokensOf = (s: string): string[] => s.split(/\s+/u).map(normalizeToken).filter((x) => x !== "");

/**
 * F1: доля общих слов цитаты и слов диапазона — пересечение мультимножеств к большему из двух
 * (склейка двух предложений, где агент ошибся концом диапазона на слово-два, — ≈ 0,9).
 */
export function quoteOverlap(quote: string, rangeWords: readonly string[]): number {
  const q = tokensOf(quote);
  const r = rangeWords.flatMap(tokensOf);
  if (q.length === 0 || r.length === 0) return 0;
  const left = new Map<string, number>();
  for (const t of r) left.set(t, (left.get(t) ?? 0) + 1);
  let common = 0;
  for (const t of q) {
    const k = left.get(t) ?? 0;
    if (k > 0) {
      common++;
      left.set(t, k - 1);
    }
  }
  return common / Math.max(q.length, r.length);
}

/**
 * Цитата — непрерывный кусок слов фрагмента по границам слов: нормализованная цитата без
 * пробелов равна склейке слов фрагмента с i по j («Go 1.24» ✓, «o 1.24» и «1.2» — нет; «1000» к
 * словам «1 000» — ✓). Пробелы и переносы в цитате значения не имеют.
 */
export function quoteInFragment(quote: string, fragmentWords: readonly string[]): boolean {
  const q = tokensOf(quote).join("");
  if (q === "") return false;
  const f = fragmentWords.flatMap(tokensOf);
  for (let i = 0; i < f.length; i++) {
    let acc = "";
    for (let j = i; j < f.length && acc.length < q.length; j++) {
      acc += f[j]!;
      if (!q.startsWith(acc)) break;
      if (acc === q) return true;
    }
  }
  return false;
}

/** Длительность принятых сцен (§5.2): речь > 20 с — blocking, > 12 с и < 3 с — warning. */
export function itemIssues(items: readonly ScriptSceneItem[], _reading: ReadingSettings, fps: Fps): PlanIssue[] {
  const out: PlanIssue[] = [];
  for (const x of items) {
    if (x.status !== "accepted") continue;
    const s = (x.frames.speech * fps.den) / fps.num;
    const sec = s.toFixed(1).replace(".", ",");
    if (s > SCENE_MAX_S) out.push({ item_id: x.id, code: "scene_too_long", severity: "blocking", message: `речь сцены ${x.id} ≈ ${sec} с > ${SCENE_MAX_S} с — разбейте фрагмент` });
    else if (s > SCENE_LONG_S) out.push({ item_id: x.id, code: "scene_long", severity: "warning", message: `речь сцены ${x.id} ≈ ${sec} с > ${SCENE_LONG_S} с — сцене нужны биты по фразам` });
    else if (s < SCENE_MIN_S) out.push({ item_id: x.id, code: "scene_too_short", severity: "warning", message: `речь сцены ${x.id} ≈ ${sec} с < ${SCENE_MIN_S} с` });
  }
  return out;
}

interface Candidate { n: number; scene: ScriptDirectorScene; si: number; ei: number }

export function validateScriptPlan(out: ScriptDirectorOutput, doc: ScriptRevisionDoc, reading: ReadingSettings, fps: Fps): ScriptPlanValidation {
  const words = doc.words;
  const pos = new Map(words.map((w, i) => [w.id, i]));
  const rejected: ScriptPlanValidation["rejected"] = [];
  const fixes: { n: number; share: number; detail: string }[] = [];
  const dropped: ScriptPlanValidation["dropped"] = [];
  const skipped: ScriptPlanValidation["skipped"] = [];
  const reject = (c: { n: number; scene: ScriptDirectorScene }, code: RejectCode, detail: string) => {
    const s = c.scene;
    if (s.decision === "skip") {
      dropped.push({ id: `пропуск ${c.n} ${s.start_word_id}–${s.end_word_id}`, code, detail });
      return;
    }
    rejected.push({ id: `сцена ${c.n} ${s.start_word_id}–${s.end_word_id}`, n: c.n, code, detail });
    skipped.push({ start_word_id: s.start_word_id, end_word_id: s.end_word_id, quote: quoteOf(doc, s.start_word_id, s.end_word_id), reason: `отклонено проверкой (${code}): ${detail}` });
  };

  // разбор: все слова «оставлены»
  const allKept: Record<string, WordMapping> = Object.fromEntries(words.map((w, i) => [w.id, { state: "kept", edited_start_us: i, edited_end_us: i + 1 }]));
  const sem = validateSemantic(
    { chapters: out.chapters, anchors: out.anchors, entities: out.entities, numbers: out.numbers, causal: out.causal, disputed: out.disputed },
    words, allKept,
  ).timeline;
  const analysis: SemanticAgentOutput = { ...sem, numbers: sem.numbers.filter((x) => valueMatches(x.value, x.quote) !== false) };
  const anchorIds = new Set(analysis.anchors.map((a) => a.id));

  // сцены по отдельности
  const plan: Candidate[] = [];
  out.scenes.forEach((raw, i) => {
    let scene = raw;
    const c = { n: i + 1, scene };
    const v = verifyQuote(words, scene.start_word_id, scene.end_word_id, scene.quote);
    let fixedShare: number | undefined;
    if (!v.ok) {
      // F1: цитата почти совпала со словами диапазона — текст берётся по словам (id — главное)
      const range = v.code === "quote_mismatch" ? words.slice(pos.get(scene.start_word_id)!, pos.get(scene.end_word_id)! + 1).map((x) => x.text) : [];
      const share = range.length > 0 ? quoteOverlap(scene.quote, range) : 0;
      if (share < QUOTE_FIX_SHARE) return reject(c, v.code, `${v.message}: «${clip(scene.quote)}»`);
      fixedShare = share;
      scene = { ...scene, quote: quoteOf(doc, scene.start_word_id, scene.end_word_id) };
      c.scene = scene;
    }
    const si = pos.get(scene.start_word_id)!;
    const ei = pos.get(scene.end_word_id)!;
    if (words[si]!.block_id !== words[ei]!.block_id) return reject(c, "cross_block", `сцена идёт через границу блоков ${words[si]!.block_id} → ${words[ei]!.block_id}`);
    if (scene.decision === "skip") {
      skipped.push({ start_word_id: scene.start_word_id, end_word_id: scene.end_word_id, quote: quoteOf(doc, scene.start_word_id, scene.end_word_id), reason: scene.skip_reason ?? "пропуск" });
      return;
    }
    const fragment = words.slice(si, ei + 1).map((x) => x.text);
    if (fixedShare !== undefined) {
      // как при правке границ человеком: числа с цитатой вне фрагмента отпадают
      const off = scene.data.filter((d) => !quoteInFragment(d.quote, fragment));
      scene = { ...scene, data: scene.data.filter((d) => quoteInFragment(d.quote, fragment)) };
      c.scene = scene;
      fixes.push({
        n: c.n, share: fixedShare,
        detail: `цитата сцены не совпала со словами ${scene.start_word_id}–${scene.end_word_id} (общих слов ${Math.round(fixedShare * 100)} %) — взят текст диапазона: «${clip(raw.quote)}»${off.length > 0 ? `; числа вне фрагмента убраны: ${off.map((d) => `«${clip(d.quote, 40)}»`).join(", ")}` : ""}`,
      });
    }
    for (const d of scene.data) {
      if (!quoteInFragment(d.quote, fragment)) return reject(c, "quote_mismatch", `цитата числа «${clip(d.quote)}» не из фрагмента сцены`);
      const m = valueMatches(d.value, d.quote);
      if (m === false) return reject(c, "value_mismatch", `значение ${d.value} не совпадает с числом цитаты «${clip(d.quote)}»`);
    }
    plan.push({ ...c, si, ei });
  });

  // порядок текста; пересечение — отклоняется поздняя
  plan.sort((a, b) => a.si - b.si || a.n - b.n);
  const kept: Candidate[] = [];
  for (const c of plan) {
    const prev = kept.at(-1);
    if (prev && c.si <= prev.ei) {
      reject(c, "scene_overlap", `слова ${c.scene.start_word_id}–${c.scene.end_word_id} пересекаются со сценой ${prev.scene.start_word_id}–${prev.scene.end_word_id}`);
      continue;
    }
    kept.push(c);
  }

  const items: ScriptSceneItem[] = kept.map((c, k) => {
    const s = c.scene;
    const id = `ss_${String(k + 1).padStart(3, "0")}`;
    const n = c.ei - c.si + 1;
    const blockId = words[c.si]!.block_id;
    const before = words.slice(0, c.si).filter((w) => w.block_id === blockId).length;
    return {
      id, status: "accepted", origin: "agent",
      start_word_id: s.start_word_id, end_word_id: s.end_word_id, quote: quoteOf(doc, s.start_word_id, s.end_word_id),
      block_id: blockId, words: n, at_s: atSeconds(before, reading), frames: readingFrames(n, reading, fps),
      technique: s.technique!, pattern: s.pattern!, ...(s.structure_rule ? { structure_rule: s.structure_rule } : {}),
      purpose: s.purpose, idea: s.idea,
      key_terms: s.key_terms.filter((t) => {
        const i = pos.get(t.word_id);
        return i !== undefined && i >= c.si && i <= c.ei;
      }),
      data: s.data, importance: s.importance, anchor_ids: s.anchor_ids.filter((a) => anchorIds.has(a)),
    };
  });

  const sources = Object.fromEntries(kept.map((c, k) => [items[k]!.id, c.n]));
  const byN = new Map(kept.map((c, k) => [c.n, items[k]!.id]));
  const fixed = fixes.filter((f) => byN.has(f.n)).map((f) => ({ id: byN.get(f.n)!, ...f }));
  const issues: PlanIssue[] = [
    ...planIssues(items, doc, reading, fps).issues,
    ...fixed.map((f): PlanIssue => ({ item_id: f.id, code: "quote_autofixed", severity: "warning", message: `${f.id}: ${f.detail}` })),
  ];
  return { items, skipped, issues, analysis, rejected, dropped, sources, fixed };
}

/**
 * Проблемы плана — общие для ответа агента (S3) и правки человека (S4), по принятым сценам:
 * числа словами без проверки (`value_unverified`), длительность (`itemIssues`), разнообразие
 * (`planDiversity`), смысловые повторы (`meaning_repeat`, F9), покрытие текста (`coverage_low`/`coverage_high`).
 */
export function planIssues(items: readonly ScriptSceneItem[], script: ScriptRevisionDoc, reading: ReadingSettings, fps: Fps): {
  issues: PlanIssue[]; diversity: ScriptPlanRevisionDoc["diversity"];
} {
  const accepted = items.filter((x) => x.status === "accepted");
  const issues: PlanIssue[] = [];
  for (const x of accepted) {
    const unverified = x.data.filter((d) => valueMatches(d.value, d.quote) === undefined).map((d) => `${d.label} = ${d.value} («${clip(d.quote, 60)}»)`);
    if (unverified.length > 0) {
      issues.push({ item_id: x.id, code: "value_unverified", severity: "warning", message: `число не проверено по цитате (записано словами, не распознано): ${unverified.join("; ")}` });
    }
  }
  const div = planDiversity(items);
  issues.push(...itemIssues(items, reading, fps), ...div.issues, ...meaningRepeatIssues(items));
  const covered = accepted.reduce((a, x) => a + x.words, 0);
  const share = script.words.length === 0 ? 0 : covered / script.words.length;
  const pct = `${Math.round(share * 100)} %`;
  if (accepted.length > 0 && share < COVERAGE_LOW) issues.push({ code: "coverage_low", severity: "warning", message: `сцены покрывают ${pct} слов текста (меньше ${COVERAGE_LOW * 100} %)` });
  if (share > COVERAGE_HIGH) issues.push({ code: "coverage_high", severity: "warning", message: `сцены покрывают ${pct} слов текста (больше ${COVERAGE_HIGH * 100} %): паузам без графики места нет` });
  return { issues, diversity: { techniques: div.techniques, adjacent_repeats: div.adjacent_repeats, kinetic_share: div.kinetic_share } };
}
