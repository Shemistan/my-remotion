import { describe, expect, it } from "vitest";
import {
  CompositionModeSchema, FootageAnalysisSchema, NormRectSchema, PlanOpSchema, ProjectStyleDocSchema, ScenePlanItemSchema,
  SemanticTimelineSchema, VisualPlanRevisionDocSchema, ZoneSchema, semanticWithoutAgent,
} from "../src/index.js";
import { SHA } from "./video-fixtures.js";

function item(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sp_001", status: "proposed", origin: "agent", anchor_ids: ["a1"], start_word_id: "w_000005", end_word_id: "w_000009",
    edited: { start_us: 2_300_000, end_us: 4_800_000 }, source: { start_us: 3_800_000, end_us: 6_300_000 }, frames: { start: 69, end: 144 },
    segment_ids: ["seg_0002"], purpose: "показать рост", visual_type: "growth-decline", composition_mode: "overlay", zone: "right_third",
    rect: { x: 0.66, y: 0.1, w: 0.3, h: 0.8 },
    key_terms: [{ text: "рост", word_id: "w_000006", edited_at_us: 2_700_000 }], metaphor: "лестница",
    complexity: 2, usefulness: 4, effort: 2, visual_load: 3,
    evidence: [{ quote: "мы выросли", start_word_id: "w_000005", end_word_id: "w_000006", edited: { start_us: 2_500_000, end_us: 3_225_000 } }],
    face_overlap: { ratio: 0 }, style_id: "st_1",
    ...over,
  };
}

describe("plan", () => {
  it("словари", () => {
    // CompositionMode — общий с Concept (Phase 1)
    expect([...CompositionModeSchema.options].sort()).toEqual(["callout", "fullscreen", "none", "overlay", "pip", "split_screen"]);
    expect(ZoneSchema.options).toContain("lower_third");
  });

  it("NormRect: доли кадра внутри кадра", () => {
    expect(NormRectSchema.safeParse({ x: 0, y: 0, w: 1, h: 1 }).success).toBe(true);
    expect(NormRectSchema.safeParse({ x: 0.5, y: 0, w: 0.6, h: 1 }).success).toBe(false);
    expect(NormRectSchema.safeParse({ x: -0.1, y: 0, w: 0.5, h: 0.5 }).success).toBe(false);
    expect(NormRectSchema.safeParse({ x: 0.1, y: 0.1, w: 0, h: 0.5 }).success).toBe(false);
  });

  it("ScenePlanItem", () => {
    expect(ScenePlanItemSchema.safeParse(item()).success).toBe(true);
    expect(ScenePlanItemSchema.safeParse(item({ composition_mode: "none" })).success).toBe(false);
    expect(ScenePlanItemSchema.safeParse(item({ id: "scene1" })).success).toBe(false);
    expect(ScenePlanItemSchema.safeParse(item({ usefulness: 6 })).success).toBe(false);
    expect(ScenePlanItemSchema.safeParse(item({ complexity: 0 })).success).toBe(false);
    expect(ScenePlanItemSchema.safeParse(item({ visual_type: "pie" })).success).toBe(false);
    expect(ScenePlanItemSchema.safeParse(item({ edited: { start_us: 5, end_us: 5 } })).success).toBe(false);
    expect(ScenePlanItemSchema.safeParse(item({ frames: { start: 10, end: 9 } })).success).toBe(false);
    expect(ScenePlanItemSchema.safeParse(item({ face_overlap: { ratio: 0.3, override_reason: "крупный план" } })).success).toBe(true);
    expect(ScenePlanItemSchema.safeParse(item({ face_overlap: { ratio: 1.3 } })).success).toBe(false);
    // цитата на вставленном слове нулевой длины — пустой edited у evidence допустим, у сцены — нет
    const ev = { quote: "да", start_word_id: "w_000005.1", end_word_id: "w_000005.1", edited: { start_us: 2_500_000, end_us: 2_500_000 } };
    expect(ScenePlanItemSchema.safeParse(item({ evidence: [ev] })).success).toBe(true);
    expect(ScenePlanItemSchema.safeParse(item({ evidence: [{ ...ev, edited: { start_us: 2, end_us: 1 } }] })).success).toBe(false);
  });

  it("ScenePlanItem: stale ⇔ причина", () => {
    expect(ScenePlanItemSchema.safeParse(item({ status: "stale", stale_reason: "anchor_cut" })).success).toBe(true);
    expect(ScenePlanItemSchema.safeParse(item({ status: "stale" })).success).toBe(false);
    expect(ScenePlanItemSchema.safeParse(item({ status: "accepted", stale_reason: "timing_changed" })).success).toBe(false);
  });

  it("VisualPlanRevisionDoc", () => {
    const d = {
      schema_version: 1, plan_id: "pl_1", revision: 1,
      inputs: { edl: { id: "edl_1", revision: 2, hash: SHA }, transcript: { id: "tr_1", revision: 1 }, semantic_id: "sem_1", footage_id: "ft_1", style: { id: "st_1", revision: 1, hash: SHA } },
      items: [item()], skipped: [{ anchor_ids: ["a2"], reason: "лицо крупно" }],
      issues: [{ item_id: "sp_001", code: "face_overlap", severity: "blocking", message: "оверлей на лице" }],
    };
    expect(VisualPlanRevisionDocSchema.safeParse(d).success).toBe(true);
    expect(VisualPlanRevisionDocSchema.safeParse({ ...d, items: [item(), item()] }).success).toBe(false);
    expect(VisualPlanRevisionDocSchema.safeParse({ ...d, issues: [{ code: "x", severity: "error", message: "m" }] }).success).toBe(false);
  });

  it("PlanOp", () => {
    expect(PlanOpSchema.safeParse({ op: "set_status", item_id: "sp_001", status: "accepted" }).success).toBe(true);
    expect(PlanOpSchema.safeParse({ op: "set_status", item_id: "sp_001", status: "stale" }).success).toBe(false);
    expect(PlanOpSchema.safeParse({ op: "modify", item_id: "sp_001", patch: { zone: "left_third", override_reason: "так задумано" } }).success).toBe(true);
    expect(PlanOpSchema.safeParse({ op: "modify", item_id: "sp_001", patch: { edited: { start_us: 0, end_us: 1 } } }).success).toBe(false);
    expect(PlanOpSchema.safeParse({ op: "add", start_word_id: "w_000001", end_word_id: "w_000002", visual_type: "comparison", composition_mode: "fullscreen", zone: "full", purpose: "сравнить" }).success).toBe(true);
  });

  it("FootageAnalysis", () => {
    const shot = {
      id: "shot_001", source_start_us: 0, source_end_us: 5_000_000, keyframes: [{ us: 0, path: "k/0.png" }, { us: 2_500_000, path: "k/1.png" }, { us: 4_900_000, path: "k/2.png" }],
      face: { union: { x: 0.4, y: 0.1, w: 0.2, h: 0.3 }, detected_ratio: 1, source: "vision" }, hands: { detected_ratio: 0 },
      occupied: [], free_zones: [{ zone: "left_third", rect: { x: 0, y: 0, w: 0.33, h: 1 }, free_ratio: 0.95 }], windows: [],
      author_position: "center", motion: "static", objects: [{ label: "кружка", important: false }], notes: "", uncertainty: [],
    };
    expect(FootageAnalysisSchema.safeParse({ schema_version: 1, id: "ft_1", media_sha256: SHA, mode: "vision+llm", shots: [shot] }).success).toBe(true);
    expect(FootageAnalysisSchema.safeParse({ schema_version: 1, id: "ft_1", media_sha256: SHA, mode: "gpu", shots: [shot] }).success).toBe(false);
    // окна занятости: внутри шота, по порядку, без пересечений
    const win = (start_us: number, end_us: number) => ({ start_us, end_us, occupied: [], free_zones: [] });
    const ok = (windows: unknown[]) => FootageAnalysisSchema.safeParse({ schema_version: 1, id: "ft_1", media_sha256: SHA, mode: "vision", shots: [{ ...shot, windows }] }).success;
    expect(ok([win(0, 2_500_000), win(2_500_000, 5_000_000)])).toBe(true);
    expect(ok([win(0, 6_000_000)])).toBe(false);
    expect(ok([win(0, 3_000_000), win(2_500_000, 5_000_000)])).toBe(false);
    expect(ok([win(2_000_000, 2_000_000)])).toBe(false);
  });

  it("SemanticTimeline: ссылки causal на якоря", () => {
    const base = {
      schema_version: 1, id: "sem_1", transcript_ref: { id: "tr_1", revision: 1 }, edl_ref: { id: "edl_1", revision: 1 },
      chapters: [{ id: "ch_1", title: "Начало", summary: "о чём", start_word_id: "w_000001", end_word_id: "w_000010" }],
      anchors: [
        { id: "a1", kind: "thesis", start_word_id: "w_000001", end_word_id: "w_000003", quote: "мы выросли", claim_type: "fact", importance: 3, emphasis_word_ids: ["w_000002"] },
        { id: "a2", kind: "cause_effect", start_word_id: "w_000004", end_word_id: "w_000006", quote: "потому что", claim_type: "opinion", importance: 2, emphasis_word_ids: [] },
      ],
      entities: [], numbers: [{ value: 1_000_000, start_word_id: "w_000001", end_word_id: "w_000003", quote: "1 000 000", claim_type: "fact" }],
      causal: [{ cause_anchor_id: "a2", effect_anchor_id: "a1" }], disputed: [],
    };
    expect(SemanticTimelineSchema.safeParse(base).success).toBe(true);
    expect(SemanticTimelineSchema.safeParse({ ...base, causal: [{ cause_anchor_id: "a9", effect_anchor_id: "a1" }] }).success).toBe(false);
    expect(SemanticTimelineSchema.safeParse({ ...base, anchors: [base.anchors[0], base.anchors[0]] }).success).toBe(false);
  });

  it("ревью Task 33 M1: semanticWithoutAgent — пометка skipped или пустая разметка (старые без поля agent)", () => {
    const empty = {
      schema_version: 1 as const, id: "sem_1", transcript_ref: { id: "tr_1", revision: 1 }, edl_ref: { id: "edl_1", revision: 1 },
      chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [],
    };
    const ch = { id: "ch_1", title: "Начало", summary: "", start_word_id: "w_000001", end_word_id: "w_000010" };
    const num = { value: 1, start_word_id: "w_000001", end_word_id: "w_000001", quote: "1", claim_type: "fact" as const };
    expect(semanticWithoutAgent({ ...empty, agent: "skipped" })).toBe(true);
    expect(semanticWithoutAgent(empty)).toBe(true);
    expect(semanticWithoutAgent({ ...empty, chapters: [ch] })).toBe(false);
    expect(semanticWithoutAgent({ ...empty, numbers: [num] })).toBe(false);
    expect(semanticWithoutAgent({ ...empty, chapters: [ch], agent: "skipped" })).toBe(true);
  });

  it("ProjectStyleDoc", () => {
    const base = { preset: "dark-premium", intensity: "calm", depth: 2 };
    const d = { schema_version: 1, style_id: "st_1", revision: 1, base, resolved: {}, rationale: "", author: "user" };
    // resolved — полная StyleBible; пустой объект не проходит
    expect(ProjectStyleDocSchema.safeParse(d).success).toBe(false);
    expect(ProjectStyleDocSchema.shape.base.safeParse(base).success).toBe(true);
    expect(ProjectStyleDocSchema.shape.base.safeParse({ ...base, depth: 4 }).success).toBe(false);
  });
});
