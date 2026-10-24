// Фабрики для тестов визуального плана (Task 32): 20 слов, вырезка с w3, лицо, ответ Visual Planner.
import {
  type EditedTimeline, type FootageAnalysis, type FootageShot, type NormRect, type ScenePlanItem, type TranscriptWord, type VisualPlanRevisionDoc,
  type VisualPlannerOutput, buildTimeline,
} from "@ms/contracts";
import { loadConfig } from "../../src/config.js";
import { ZONE_RECTS, freeZones } from "../../src/analysis/zones.js";
import { F30, w } from "../edit/helpers.js";
import { id } from "./semantic-helpers.js";

export { id };

export const P = loadConfig({ MS_DATA_DIR: "/tmp/ms-unused" }).planning;

/**
 * 20 слов по 0,4 с подряд с 2,4 с (слово i — `[2,4 + 0,4(i−1), +0,4)`); исходник 12 с.
 * Вырезка 2,2–3,7 с: w1–w3 вырезаны целиком, w4 (3,6–4,0) — частично (clipped).
 */
export const TEXTS = ["Сегодня", "мы", "эээ", "ну", "выручка", "выросла", "на", "40%", "за", "год.",
  "Это", "главный", "итог", "нашей", "работы", "и", "всей", "команды", "за", "сезон."];
export const wordAt = (i: number): { start_us: number; end_us: number } => ({ start_us: 2_400_000 + (i - 1) * 400_000, end_us: 2_400_000 + i * 400_000 });
export const words: TranscriptWord[] = TEXTS.map((t, i) => w(id(i + 1), t, wordAt(i + 1).start_us, wordAt(i + 1).end_us));
export const SOURCE_US = 12_000_000;
export const CUT = { start_us: 2_200_000, end_us: 3_700_000 };
export const tl: EditedTimeline = buildTimeline(SOURCE_US, [CUT], F30);
/** Тот же монтаж плюс вырезка слов `cut` (номера) целиком. */
export function tlCutting(...cut: number[]): EditedTimeline {
  return buildTimeline(SOURCE_US, [CUT, ...cut.map((i) => wordAt(i))], F30);
}
export const textOf = (s: number, e: number): string => TEXTS.slice(s - 1, e).join(" ");
export const quote59 = textOf(5, 9); // «выручка выросла на 40% за»

/** Шот на весь исходник: лицо `face` (уже с полем), окна — по `windows`. */
export function shot(face: NormRect | undefined, o: { windows?: FootageShot["windows"]; start_us?: number; end_us?: number; id?: string } = {}): FootageShot {
  const occupied = face ? [face] : [];
  return {
    id: o.id ?? "shot_001", source_start_us: o.start_us ?? 0, source_end_us: o.end_us ?? SOURCE_US, keyframes: [],
    face: { ...(face ? { union: face } : {}), detected_ratio: face ? 1 : 0, source: "vision" },
    hands: { detected_ratio: 0 },
    occupied: o.windows ? [...occupied, ...o.windows.flatMap((x) => x.occupied)] : occupied,
    free_zones: freeZones(o.windows ? [...occupied, ...o.windows.flatMap((x) => x.occupied)] : occupied),
    windows: o.windows ?? [],
    author_position: face ? (face.x + face.w / 2 < 0.4 ? "left" : face.x + face.w / 2 > 0.6 ? "right" : "center") : "absent",
    motion: "static", objects: [], notes: "", uncertainty: [],
  };
}
export function footage(face: NormRect | undefined, o: Parameters<typeof shot>[1] = {}): FootageAnalysis {
  return { schema_version: 1, id: "ftg_1", media_sha256: "a".repeat(64), mode: "vision", shots: [shot(face, o)] };
}
/** Окно занятости шота: лицо и руки. */
export function win(start_us: number, end_us: number, occupied: NormRect[]): FootageShot["windows"][number] {
  return { start_us, end_us, occupied, free_zones: freeZones(occupied) };
}

export const FACE: NormRect = { x: 0.55, y: 0.15, w: 0.25, h: 0.45 };

type Opp = VisualPlannerOutput["opportunities"][number];
export const ev = (s: number, e: number, quote = textOf(s, e)): Opp["evidence"][number] => ({ quote, start_word_id: id(s), end_word_id: id(e) });
export function opp(over: Partial<Omit<Opp, "start_word_id" | "end_word_id">> & { s?: number; e?: number } = {}): Opp {
  const { s = 5, e = 9, ...rest } = over;
  return {
    id: "o1", anchor_ids: ["a1"], start_word_id: id(s), end_word_id: id(e), decision: "plan", purpose: "показать рост выручки",
    visual_type: "growth-decline", composition_mode: "overlay", zone: "left_third", key_terms: [{ text: "40%", word_id: id(8) }],
    metaphor: "столбик растёт", complexity: 2, usefulness: 4, effort: 2, visual_load: 2, evidence: [ev(s, e)], ...rest,
  };
}
export const skipOpp = (oid: string, reason = "мысль понятна без графики"): Opp => ({
  ...opp({ id: oid }), decision: "skip", skip_reason: reason, composition_mode: "none", evidence: [],
});
export function out(opps: Opp[], style: Partial<VisualPlannerOutput["style"]> = {}): VisualPlannerOutput {
  return { style: { preset: "dark-premium", intensity: "balanced", depth: 1, rationale: "спокойная деловая тема", ...style }, opportunities: opps };
}
/** `ctx(tl, undefined)` — кадр без лица (явный `undefined` не подменяется на `FACE`). */
export function ctx(timeline: EditedTimeline = tl, ...rest: [face?: NormRect | undefined, o?: { footage?: FootageAnalysis }]) {
  const face = rest.length > 0 ? rest[0] : FACE;
  const o = rest[1] ?? {};
  return { words, tl: timeline, footage: o.footage ?? footage(face), styleId: "sty_1", cfg: P };
}

let k = 0;
/** Сцена с готовым edited-диапазоном (для `planChecks`): overlay в левой трети, лицо не задето. */
export function sc(start_us: number, end_us: number, over: Partial<ScenePlanItem> = {}): ScenePlanItem {
  k++;
  return {
    id: `sp_${String(k).padStart(3, "0")}`, status: "proposed", origin: "agent", anchor_ids: [], start_word_id: id(5), end_word_id: id(9),
    edited: { start_us, end_us }, source: { start_us, end_us }, frames: { start: Math.floor((start_us * 30) / 1e6), end: Math.ceil((end_us * 30) / 1e6) },
    segment_ids: [], purpose: "сцена", visual_type: "key-point-emphasis", composition_mode: "overlay", zone: "left_third", rect: ZONE_RECTS.left_third,
    key_terms: [], metaphor: "", complexity: 1, usefulness: 3, effort: 2, visual_load: 2,
    evidence: [{ quote: "выручка", start_word_id: id(5), end_word_id: id(5), edited: { start_us, end_us: start_us } }],
    face_overlap: { ratio: 0 }, style_id: "sty_1", ...over,
  };
}

export const HASH = "b".repeat(64);
export function planDoc(items: ScenePlanItem[], over: Partial<VisualPlanRevisionDoc> = {}): VisualPlanRevisionDoc {
  return {
    schema_version: 1, plan_id: "pln_1", revision: 1,
    inputs: {
      edl: { id: "edl_1", revision: 1, hash: HASH }, transcript: { id: "trn_1", revision: 1 }, semantic_id: "sem_1", footage_id: "ftg_1",
      style: { id: "sty_1", revision: 1, hash: HASH },
    },
    items, skipped: [], issues: [], ...over,
  };
}
