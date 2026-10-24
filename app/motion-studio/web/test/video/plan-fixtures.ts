// Данные анализа и визуального плана для юнит-тестов UI (Task 33): сцена плана, план, шот с
// лицом, смысловая разметка, стиль проекта.
import {
  type FootageShot, type PlanDto, type ProjectStyleDto, type ScenePlanItem, type SemanticTimeline, ZONE_RECTS,
} from "@ms/contracts";

const SHA = "a".repeat(64);

export function item(over: Partial<ScenePlanItem> = {}): ScenePlanItem {
  return {
    id: "sp_001", status: "proposed", origin: "agent", anchor_ids: ["a1"], start_word_id: "w_000001", end_word_id: "w_000002",
    edited: { start_us: 0, end_us: 900_000 }, source: { start_us: 0, end_us: 900_000 }, frames: { start: 0, end: 27 },
    segment_ids: ["seg_0001"], purpose: "показать приветствие", visual_type: "key-point-emphasis", composition_mode: "overlay",
    zone: "left_third", rect: ZONE_RECTS.left_third, key_terms: [{ text: "мир", word_id: "w_000002", edited_at_us: 500_000 }],
    metaphor: "рукопожатие", complexity: 2, usefulness: 4, effort: 2, visual_load: 3,
    evidence: [{ quote: "Привет мир.", start_word_id: "w_000001", end_word_id: "w_000002", edited: { start_us: 0, end_us: 900_000 } }],
    face_overlap: { ratio: 0 }, style_id: "sty_1", ...over,
  };
}

export function planDto(items: ScenePlanItem[], over: Partial<PlanDto> = {}, doc: Partial<PlanDto["doc"]> = {}): PlanDto {
  return {
    id: "pln_1", current_revision: 1,
    doc: {
      schema_version: 1, plan_id: "pln_1", revision: 1,
      inputs: {
        edl: { id: "edl_1", revision: 1, hash: SHA }, transcript: { id: "trn_1", revision: 1 }, semantic_id: "sem_1", footage_id: "ftg_1",
        style: { id: "sty_1", revision: 1, hash: SHA },
      },
      items, skipped: [], issues: [], ...doc,
    },
    inputs_fresh: { edl: true, transcript: true, style: true }, proposals: {}, recheck: null, ...over,
  };
}

/** Лицо справа: x 0,55…0,8, y 0,15…0,6. */
export const FACE = { x: 0.55, y: 0.15, w: 0.25, h: 0.45 };

export function shot(over: Partial<FootageShot> = {}): FootageShot {
  return {
    id: "shot_001", source_start_us: 0, source_end_us: 10_000_000, keyframes: [{ us: 500_000, path: "frames/000000500000.png" }],
    face: { union: FACE, detected_ratio: 1, source: "vision" }, hands: { union: { x: 0.5, y: 0.7, w: 0.3, h: 0.2 }, detected_ratio: 0.5 },
    occupied: [FACE], free_zones: [{ zone: "left_third", rect: ZONE_RECTS.left_third, free_ratio: 1 }, { zone: "right_third", rect: ZONE_RECTS.right_third, free_ratio: 0.42 }],
    windows: [], author_position: "right", motion: "static", objects: [], notes: "", uncertainty: [], ...over,
  };
}

export function semantic(over: Partial<SemanticTimeline> = {}): SemanticTimeline {
  return {
    schema_version: 1, id: "sem_1", transcript_ref: { id: "trn_1", revision: 1 }, edl_ref: { id: "edl_1", revision: 1 },
    chapters: [{ id: "c1", title: "Знакомство", summary: "автор здоровается", start_word_id: "w_000001", end_word_id: "w_000002" },
      { id: "c2", title: "Вопрос", summary: "", start_word_id: "w_000004", end_word_id: "w_000005" }],
    anchors: [
      { id: "a1", kind: "thesis", start_word_id: "w_000001", end_word_id: "w_000002", quote: "Привет мир.", claim_type: "assumption", importance: 2, emphasis_word_ids: [] },
      { id: "a2", kind: "emphasis", start_word_id: "w_000004", end_word_id: "w_000005", quote: "как дела", claim_type: "opinion", importance: 1, emphasis_word_ids: ["w_000005"] },
    ],
    entities: [],
    numbers: [{ value: 5, unit: "%", start_word_id: "w_000004", end_word_id: "w_000004", quote: "как", claim_type: "fact" }],
    causal: [],
    disputed: [{ start_word_id: "w_000004", end_word_id: "w_000005", why: "неясно, о ком речь" }],
    ...over,
  };
}

export function styleDto(over: Partial<ProjectStyleDto["current"]> = {}): ProjectStyleDto {
  const palette = { bg: "#0b0d12", surface: "#161a23", text: "#f2f4f8", muted: "#5d6578", accent: ["#6d8bff", "#3ccf8e"], positive: "#3ccf8e", negative: "#ff6b6b" };
  const font = { family: "Inter", weight: 700 };
  return {
    current: {
      schema_version: 1, style_id: "sty_1", revision: 2, base: { preset: "dark-premium", intensity: "balanced", depth: 1 },
      resolved: {
        id: "dark-premium", name: "Dark premium", palette,
        typography: { display: font, body: { family: "Inter", weight: 400 }, mono: { family: "JetBrains Mono" }, scale: [1], tracking: {} },
        grid: { columns: 12, gutter: 24, safe_area: { x: 0.05, y: 0.05 } }, surfaces: { radius: [8], elevation: ["none"] },
        motion: { intensity: "balanced", easing: { enter: [0, 0, 1, 1], exit: [0, 0, 1, 1], emphasis: [0, 0, 1, 1] }, spring: {}, stagger_frames: 3, enter_frames: 12, exit_frames: 10 },
        camera: { allow_zoom: false, max_scale: 1, parallax: false },
      },
      rationale: "спокойная деловая тема", author: "agent", ...over,
    },
    history: [{ revision: 1, parent_revision: null, author: "agent", created_at: "2026-10-24T10:00:00.000Z" }, { revision: 2, parent_revision: 1, author: "agent", created_at: "2026-10-24T10:05:00.000Z" }],
    contrast: [
      { key: "text", color: palette.text, bg: palette.bg, ratio: 17.65, min: 4.5, good: 7 },
      { key: "muted", color: palette.muted, bg: palette.bg, ratio: 3.33, min: 3, good: 4.5 },
    ],
    issues: [{ code: "style_contrast_low", severity: "warning", message: "контраст palette.muted слабый" }],
    fonts: ["Inter", "Manrope", "JetBrains Mono"],
  };
}
