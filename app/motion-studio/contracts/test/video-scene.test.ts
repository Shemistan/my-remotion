// Task 35′ (Phase 4–6 v2): контракты видеосцены — размещение (Р-V5), вход генерации, кадры и
// ключевые моменты сцены плана, манифест папки клипов (Р-V9).
import { describe, expect, it } from "vitest";
import {
  ApprovalSchema,
  ApprovalStaleReasonSchema,
  JobErrorCodeSchema,
  JobTypeSchema,
  PlacementSchema,
  ScenePropsBaseSchema,
  VideoPackageManifestSchema,
  VideoSceneContextSchema,
  ZONE_RECTS,
  placementFor,
  subjectKey,
  videoKeyMoments,
  videoSceneFrames,
  videoSceneWindow,
} from "../src/index.js";
import { F30, SHA, TS, planItem as item } from "./video-fixtures.js";

const PROPS = {
  timing: { duration_frames: 90, beats: [] },
  style: { preset: "dark-premium", intensity: "balanced", depth: 1, transparent: true },
  content: {},
};

describe("размещение (Р-V5)", () => {
  it("placementFor: rect зоны по умолчанию, fullscreen непрозрачный, остальные прозрачные", () => {
    expect(placementFor("overlay", "lower_third")).toEqual({ mode: "overlay", zone: "lower_third", rect: ZONE_RECTS.lower_third, transparent: true });
    expect(placementFor("fullscreen", "full").transparent).toBe(false);
    expect(placementFor("split_screen", "split_right").transparent).toBe(true);
    for (const m of ["callout", "pip"] as const) expect(placementFor(m, "pip_tr").transparent).toBe(true);
    const r = { x: 0.1, y: 0.1, w: 0.3, h: 0.3 };
    expect(placementFor("pip", "pip_tl", r).rect).toEqual(r);
  });

  it("PlacementSchema: режим none и прямоугольник за кадром — нет", () => {
    expect(PlacementSchema.safeParse(placementFor("overlay", "lower_third")).success).toBe(true);
    expect(PlacementSchema.safeParse({ ...placementFor("overlay", "lower_third"), mode: "none" }).success).toBe(false);
    expect(PlacementSchema.safeParse({ ...placementFor("overlay", "lower_third"), rect: { x: 0.9, y: 0, w: 0.3, h: 1 } }).success).toBe(false);
  });

  it("ScenePropsBase.layout — необязательный rect графики; лишнее поле — нет", () => {
    expect(ScenePropsBaseSchema.safeParse(PROPS).success).toBe(true);
    expect(ScenePropsBaseSchema.safeParse({ ...PROPS, layout: { rect: ZONE_RECTS.split_right } }).success).toBe(true);
    expect(ScenePropsBaseSchema.safeParse({ ...PROPS, layout: { rect: ZONE_RECTS.split_right, z: 1 } }).success).toBe(false);
    expect(ScenePropsBaseSchema.safeParse({ ...PROPS, layout: {} }).success).toBe(false);
  });
});

describe("вход video у playground.generate", () => {
  const ctx = {
    project_id: "p1", plan_id: "pln_1", plan_revision: 2, item_id: "sp_001",
    style: { preset: "dark-premium", intensity: "balanced", depth: 1 },
    lead_frames: 6, tail_frames: 12, placement: placementFor("split_screen", "split_right"),
  };
  it("по образцу ScriptSceneContext: strict, лицо и ключевые моменты необязательны", () => {
    expect(VideoSceneContextSchema.safeParse(ctx).success).toBe(true);
    expect(VideoSceneContextSchema.safeParse({ ...ctx, face: { x: 0.4, y: 0.1, w: 0.2, h: 0.4 }, key_moments: [{ text: "миллион", frame: 30 }], context_frame_rel: "context/frame.png" }).success).toBe(true);
    expect(VideoSceneContextSchema.safeParse({ ...ctx, aspect: "16:9" }).success).toBe(false);
    expect(VideoSceneContextSchema.safeParse({ ...ctx, lead_frames: -1 }).success).toBe(false);
  });
});

describe("кадры сцены плана", () => {
  it("videoSceneFrames = frames.end − frames.start", () => {
    expect(videoSceneFrames(item())).toBe(90);
  });

  it("videoKeyMoments: кадр слова от начала сцены, только внутри [0, длительность)", () => {
    expect(videoKeyMoments(item({ frames: { start: 300, end: 390 }, key_terms: [{ text: "миллион", word_id: "w_000120", edited_at_us: 11_000_000 }] }), F30))
      .toEqual([{ text: "миллион", frame: 30 }]);
    const terms = [
      { text: "до", word_id: "w_000090", edited_at_us: 9_900_000 },
      { text: "начало", word_id: "w_000100", edited_at_us: 10_000_000 },
      { text: "конец", word_id: "w_000130", edited_at_us: 13_000_000 },
    ];
    expect(videoKeyMoments(item({ key_terms: terms }), F30)).toEqual([{ text: "начало", frame: 0 }]);
  });

  it("videoSceneWindow: запас до первой цитаты и после последней, не меньше 0", () => {
    // цитата 10,2–12,5 с → кадры 306 и 375 (конец — вверх)
    expect(videoSceneWindow(item(), F30)).toEqual({ lead: 6, tail: 15 });
    const ev = (s: number, e: number) => ({ quote: "x", start_word_id: "w_000101", end_word_id: "w_000102", edited: { start_us: s, end_us: e } });
    expect(videoSceneWindow(item({ evidence: [ev(11_000_000, 11_500_000), ev(10_100_000, 10_500_000)] }), F30)).toEqual({ lead: 3, tail: 45 });
    expect(videoSceneWindow(item({ evidence: [ev(9_000_000, 14_000_000)] }), F30)).toEqual({ lead: 0, tail: 0 });
  });
});

describe("манифест папки клипов (Phase 5-lite)", () => {
  const file = { file: "01_overlay.mp4", export_id: "exp_1", sha256: SHA, ffprobe: { durationMs: 3000, width: 1920, height: 1080, fps: F30, codec: "h264" } };
  const m = {
    schema_version: 1, package_id: "vpk_1", project_id: "p1", project_title: "Ролик", name: "Ролик_клипы_2026-10-25",
    fps: F30, edl: { id: "edl_1", revision: 3 }, plan: { id: "pln_1", revision: 2 },
    scenes: [{
      n: 1, item_id: "sp_001", scene_id: "scn_1", version_id: "ver_1", version_number: 2, approved: true,
      source: { start_us: 12_000_000, end_us: 15_000_000 }, edited: { start_us: 10_000_000, end_us: 13_000_000 }, frames: { start: 300, end: 390 },
      quote: "мы выросли до миллиона", mode: "overlay", zone: "lower_third", mp4: file, alpha: null, warnings: [],
    }],
    missing: [{ item_id: "sp_002", reason: "сцена не утверждена" }],
    created_at: TS,
  };
  it("сцены с таймкодами исходника и смонтированного ролика, версия и C", () => {
    expect(VideoPackageManifestSchema.safeParse(m).success).toBe(true);
    expect(VideoPackageManifestSchema.safeParse({ ...m, scenes: [{ ...m.scenes[0], approved: undefined }] }).success).toBe(false);
    expect(VideoPackageManifestSchema.safeParse({ ...m, scenes: [{ ...m.scenes[0], mode: "none" }] }).success).toBe(false);
  });
});

describe("реестры Phase 4–6", () => {
  it("типы задач: + 8 видео/финал/обслуживание, без production.* и scene.import", () => {
    for (const t of ["video.package", "scene.preview_context", "timeline.build", "timeline.preview", "final.render", "final.reproduce", "trash.purge", "cache.gc"]) {
      expect(JobTypeSchema.safeParse(t).success, t).toBe(true);
    }
    for (const t of ["production.generate", "production.batch", "scene.import"]) expect(JobTypeSchema.safeParse(t).success, t).toBe(false);
  });

  it("коды ошибок задач и причины устаревания", () => {
    for (const c of ["timeline_stale", "scene_not_ready", "version_failed", "verify_failed", "stalled", "project_busy"]) expect(JobErrorCodeSchema.safeParse(c).success, c).toBe(true);
    expect(JobErrorCodeSchema.safeParse("placement_class_change").success).toBe(false);
    for (const r of ["plan_changed", "version_changed", "timeline_changed"]) expect(ApprovalStaleReasonSchema.safeParse(r).success, r).toBe(true);
  });

  it("субъект C — scene:<id>@r<N>, final — timeline:<id>@r<N>; subjectKey — до @", () => {
    const a = { id: "apr_1", project_id: "p1", subject_hash: SHA, status: "valid", decided_at: TS };
    expect(ApprovalSchema.safeParse({ ...a, kind: "C", subject_ref: "scene:scn_1@r2" }).success).toBe(true);
    expect(ApprovalSchema.safeParse({ ...a, kind: "C", subject_ref: "plan:pln_1@r2" }).success).toBe(false);
    expect(ApprovalSchema.safeParse({ ...a, kind: "final", subject_ref: "timeline:tml_1@r3" }).success).toBe(true);
    expect(ApprovalSchema.safeParse({ ...a, kind: "final", subject_ref: "scene:scn_1@r3" }).success).toBe(false);
    expect(subjectKey("scene:scn_1@r2")).toBe("scene:scn_1");
    expect(subjectKey("edl:edl_1@r12")).toBe("edl:edl_1");
    expect(() => subjectKey("scene:scn_1")).toThrow();
  });
});
