// Сцены визуального плана (Task 32) из ответа Visual Planner. Время, кадры, прямоугольник зоны и
// долю лица считает код; агент даёт только слова. Диапазон сцены и каждая цитата — правило
// «цитата = то, что слышит зритель» (`checkHeardRange`, ревью Task 31 I1); числа ключевых слов
// сверяются с цифрами услышанного (`numberMatchesQuote`, ревью Task 31 m3).
// `placeScene` — общая для сборки, правки пользователем (`applyPlanOps`) и перепроверки (`recheckPlan`).
import {
  type EditedTimeline, type FootageAnalysis, type NormRect, type ScenePlanItem, type TranscriptSegment, type TranscriptWord,
  type VisualPlannerOutput, type WordMapping, type Zone, TimelineError, checkHeardRange, mapWords, rangeFromWords,
} from "@ms/contracts";
import type { AppConfig } from "../config.js";
import { buildSegments } from "../media/segments.js";
import { facesAt } from "./planner-input.js";
import { numberMatchesQuote } from "./semantic-validate.js";
import { ZONE_RECTS, r6 } from "./zones.js";

export type PlanningConfig = AppConfig["planning"];

/** Коды отказа размещения сцены. */
export type PlaceCode = "unknown_word" | "order" | "anchor_in_cut" | "quote_mismatch" | "value_mismatch" | "empty_range";

export interface PlaceContext {
  words: TranscriptWord[];
  tl: EditedTimeline;
  footage: FootageAnalysis;
  cfg: PlanningConfig;
  /** Сегменты транскрипта; нет — `buildSegments(words)`. */
  segments?: TranscriptSegment[];
  /** `mapWords(tl, words)`, если уже посчитан. */
  wordMap?: Record<string, WordMapping>;
}

export interface SceneWords {
  start_word_id: string;
  end_word_id: string;
  zone: Zone;
  key_terms: { text: string; word_id: string }[];
  evidence: { quote: string; start_word_id: string; end_word_id: string }[];
  override_reason?: string;
}

export type Placement = Pick<ScenePlanItem, "edited" | "source" | "frames" | "rect" | "face_overlap" | "key_terms" | "evidence" | "segment_ids">;

export type PlaceResult = { ok: true; value: Placement } | { ok: false; code: PlaceCode; message: string };

const area = (r: NormRect): number => r.w * r.h;

function intersectArea(a: NormRect, b: NormRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Наибольшая доля лица под прямоугольником: `area(rect ∩ face) / area(face)` по лицам диапазона. */
export function faceOverlapRatio(rect: NormRect, faces: readonly NormRect[]): number {
  let best = 0;
  for (const f of faces) if (area(f) > 0) best = Math.max(best, intersectArea(rect, f) / area(f));
  return Math.min(1, r6(best));
}

const heard = (m: WordMapping | undefined): m is Extract<WordMapping, { state: "kept" | "clipped" }> => m !== undefined && m.state !== "removed";

/** Группы цифр текста (как читает `numberMatchesQuote`: разряды через пробел, дробь через запятую/точку). */
function digitGroups(text: string): number[] {
  const q = text.normalize("NFC").replace(/[\u00a0\u202f]/g, " ");
  return [...q.matchAll(/\d+(?: \d{3})*(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(/ /g, "").replace(",", ".")));
}

/**
 * Размещает сцену по словам: диапазон и цитаты — `checkHeardRange`, ключевые слова — есть, не
 * вырезаны, цифры совпадают с услышанным текстом сцены; время — `rangeFromWords` с полями `cfg`.
 */
export function placeScene(s: SceneWords, c: PlaceContext): PlaceResult {
  const { words, tl, cfg } = c;
  const map = c.wordMap ?? mapWords(tl, words);
  const fail = (code: PlaceCode, message: string): PlaceResult => ({ ok: false, code, message });

  const range = checkHeardRange(words, map, s.start_word_id, s.end_word_id);
  if (!range.ok) return fail(range.code, `сцена: ${range.message}`);
  for (const e of s.evidence) {
    const r = checkHeardRange(words, map, e.start_word_id, e.end_word_id, e.quote);
    if (!r.ok) return fail(r.code, `цитата «${clip(e.quote)}»: ${r.message}`);
  }

  const idx = new Map(words.map((w, i) => [w.id, i]));
  const si = idx.get(s.start_word_id)!;
  const ei = idx.get(s.end_word_id)!;
  const sceneText = words.slice(si, ei + 1).filter((w) => heard(map[w.id])).map((w) => w.text).join(" ");
  const keyTerms: ScenePlanItem["key_terms"] = [];
  for (const k of s.key_terms) {
    const i = idx.get(k.word_id);
    if (i === undefined) return fail("unknown_word", `ключевое слово «${clip(k.text)}»: нет слова ${k.word_id}`);
    const m = map[k.word_id];
    if (!heard(m)) return fail("anchor_in_cut", `ключевое слово «${clip(k.text)}»: слово ${k.word_id} вырезано монтажом`);
    // слово вне сцены не отклоняется (blocking `key_term_outside` в planChecks), но его цифры — тоже речь
    const text = i < si || i > ei ? `${sceneText} ${words[i]!.text}` : sceneText;
    const bad = digitGroups(k.text).find((v) => numberMatchesQuote(v, text) === false);
    if (bad !== undefined) return fail("value_mismatch", `число «${clip(k.text)}» не совпадает с цифрами речи «${clip(text)}»`);
    keyTerms.push({ text: k.text, word_id: k.word_id, edited_at_us: m.edited_start_us });
  }

  let r: ReturnType<typeof rangeFromWords>;
  const evidence: ScenePlanItem["evidence"] = [];
  try {
    r = rangeFromWords(tl, words, s.start_word_id, s.end_word_id, { preUs: cfg.padPreUs, postUs: cfg.padPostUs });
    for (const e of s.evidence) {
      const er = rangeFromWords(tl, words, e.start_word_id, e.end_word_id, { preUs: 0, postUs: 0 });
      evidence.push({ quote: e.quote, start_word_id: e.start_word_id, end_word_id: e.end_word_id, edited: er.edited });
    }
  } catch (e) {
    if (e instanceof TimelineError) return fail(e.code, e.message);
    throw e;
  }
  if (!(r.edited.start_us < r.edited.end_us) || !(r.source.start_us < r.source.end_us) || !(r.frames.start < r.frames.end)) {
    return fail("empty_range", `сцена ${s.start_word_id}–${s.end_word_id} нулевой длины`);
  }

  const rect = ZONE_RECTS[s.zone];
  const ratio = faceOverlapRatio(rect, facesAt(c.footage, r.source));
  const segs = c.segments ?? buildSegments(words);
  const inScene = new Set(words.slice(si, ei + 1).map((w) => w.id));
  return {
    ok: true,
    value: {
      edited: r.edited, source: r.source, frames: r.frames, rect,
      face_overlap: { ratio, ...(s.override_reason !== undefined ? { override_reason: s.override_reason } : {}) },
      key_terms: keyTerms, evidence,
      segment_ids: segs.filter((g) => g.word_ids.some((x) => inScene.has(x))).map((g) => g.id),
    },
  };
}

export interface PlanBuildContext extends PlaceContext {
  styleId: string;
}

export interface PlanRejected {
  opp_id: string;
  code: PlaceCode;
  message: string;
}

export interface PlanBuildResult {
  items: ScenePlanItem[];
  skipped: { anchor_ids: string[]; reason: string }[];
  rejected: PlanRejected[];
  /** Все возможности ответа по порядку — для индекса `visual_opportunities`. */
  opportunities: { opp_id: string; decision: "plan" | "skip"; anchor_ids: string[]; skip_reason: string | null }[];
}

/** Номер сцены `sp_001…`. */
export const itemId = (n: number): string => `sp_${String(n).padStart(3, "0")}`;

/**
 * Сцены плана из ответа агента: `plan` — размещение (`placeScene`), не прошло — `rejected` с кодом;
 * `skip` — в `skipped` с причиной. id сцен — по времени (`sp_001…`), статус `proposed`.
 */
export function buildPlanItems(out: VisualPlannerOutput, ctx: PlanBuildContext): PlanBuildResult {
  const wordMap = ctx.wordMap ?? mapWords(ctx.tl, ctx.words);
  const segments = ctx.segments ?? buildSegments(ctx.words);
  const placed: Omit<ScenePlanItem, "id">[] = [];
  const skipped: PlanBuildResult["skipped"] = [];
  const rejected: PlanRejected[] = [];
  const opportunities: PlanBuildResult["opportunities"] = [];
  for (const o of out.opportunities) {
    opportunities.push({ opp_id: o.id, decision: o.decision, anchor_ids: [...o.anchor_ids], skip_reason: o.decision === "skip" ? o.skip_reason ?? null : null });
    if (o.decision === "skip") {
      skipped.push({ anchor_ids: [...o.anchor_ids], reason: o.skip_reason ?? "без причины" });
      continue;
    }
    if (o.composition_mode === "none") {
      rejected.push({ opp_id: o.id, code: "empty_range", message: "у сцены plan режим none" });
      continue;
    }
    const p = placeScene({
      start_word_id: o.start_word_id, end_word_id: o.end_word_id, zone: o.zone, key_terms: o.key_terms, evidence: o.evidence,
      ...(o.face_override_reason !== undefined ? { override_reason: o.face_override_reason } : {}),
    }, { ...ctx, wordMap, segments });
    if (!p.ok) {
      rejected.push({ opp_id: o.id, code: p.code, message: p.message });
      continue;
    }
    placed.push({
      status: "proposed", origin: "agent", anchor_ids: [...o.anchor_ids], start_word_id: o.start_word_id, end_word_id: o.end_word_id,
      ...p.value, purpose: o.purpose.trim() || o.visual_type, visual_type: o.visual_type, composition_mode: o.composition_mode,
      zone: o.zone, metaphor: o.metaphor, complexity: o.complexity, usefulness: o.usefulness, effort: o.effort,
      visual_load: o.visual_load, style_id: ctx.styleId,
    });
  }
  const order = placed.map((x, i) => ({ x, i })).sort((a, b) => a.x.edited.start_us - b.x.edited.start_us || a.x.edited.end_us - b.x.edited.end_us || a.i - b.i);
  const items = order.map(({ x }, n) => ({ id: itemId(n + 1), ...x }) as ScenePlanItem);
  return { items, skipped, rejected, opportunities };
}

const clip = (s: string, n = 80): string => (s.length > n ? `${s.slice(0, n)}…` : s);
