// Task 35′ (Phase 4–6 v2): математика таймлайна видеопроекта — последовательности исходника
// по EDL, сэмплы звука, состав сцен (C), якоря, проверки. Длительность и зона с таймлайна не
// меняются (Р-V6, Д2): операций `set_duration` и `set_zone` нет.
import { describe, expect, it } from "vitest";
import {
  type VideoTimelineClip,
  type VideoTimelineDoc,
  TimelineOpSchema,
  VideoTimelineClipSchema,
  VideoTimelineDocSchema,
  anchorCheck,
  audioSampleRange,
  buildTimeline,
  clipsToSequences,
  composeTimeline,
  placementFor,
  snapToWord,
  timelineChecks,
  timelineFrames,
} from "../src/index.js";
import { F30, NTSC, SHA, planItem } from "./video-fixtures.js";

const tl = buildTimeline(10_000_000, [{ start_us: 2_000_000, end_us: 3_500_000 }], F30);
const inputs = { media_sha256: SHA, edl: { id: "edl_1", revision: 2, hash: SHA }, plan: { id: "pln_1", revision: 3, hash: SHA }, style: { id: "sty_1", revision: 1, hash: SHA } };

function clip(over: Partial<VideoTimelineClip> = {}): VideoTimelineClip {
  return {
    clip_id: "clip_sp_001", scene_id: "scn_1", item_id: "sp_001", version_id: "ver_a", version_number: 1, include: "approved",
    start_frame: 330, duration_frames: 90, placement: placementFor("overlay", "lower_third"), z: 1,
    anchors: [{ word_id: "w_000120", text: "миллион", frame: 400 }],
    ...over,
  };
}
function doc(scenes: VideoTimelineClip[], duration_frames = 3000): VideoTimelineDoc {
  return { schema_version: 1, timeline_id: "tml_1", revision: 1, fps: F30, duration_frames, inputs, video: [], scenes, excluded: [], issues: [] };
}

describe("последовательности исходника и звук (редакция 2026-10-21 без изменений)", () => {
  it("clipsToSequences, timelineFrames, audioSampleRange — 30 fps", () => {
    expect(clipsToSequences(tl)).toEqual([
      { idx: 0, from: 0, durationInFrames: 60, startFrom: 0 },
      { idx: 1, from: 60, durationInFrames: 195, startFrom: 105 },
    ]);
    expect(timelineFrames(tl)).toBe(255);
    expect(audioSampleRange(tl.clips[1]!, 48_000)).toEqual({ start: 168_000, end: 480_000 });
  });

  it("29,97: границы на кадрах NTSC", () => {
    const tl2 = buildTimeline(10_010_000, [{ start_us: 1_001_000, end_us: 2_002_000 }], NTSC);
    expect(clipsToSequences(tl2).map((s) => [s.from, s.durationInFrames, s.startFrom])).toEqual([[0, 30, 0], [30, 240, 60]]);
    expect(timelineFrames(tl2)).toBe(270);
  });

  it("клип короче кадра (хвост исходника не на кадре) в последовательности не попадает", () => {
    const t3 = buildTimeline(10_010_000, [{ start_us: 1_000_000, end_us: 10_000_000 }], F30);
    expect(t3.clips).toHaveLength(2);
    expect(clipsToSequences(t3)).toEqual([{ idx: 0, from: 0, durationInFrames: 30, startFrom: 0 }]);
    expect(timelineFrames(t3)).toBe(30);
  });
});

describe("операции таймлайна (Р-V6, Д2)", () => {
  it("move, use_version, include — да; set_duration и set_zone — нет", () => {
    expect(TimelineOpSchema.safeParse({ op: "move", clip_id: "c1", start_frame: 120 }).success).toBe(true);
    expect(TimelineOpSchema.safeParse({ op: "move", clip_id: "c1", start_frame: 120, override_reason: "так надо" }).success).toBe(true);
    expect(TimelineOpSchema.safeParse({ op: "use_version", clip_id: "c1", version_id: "ver_2" }).success).toBe(true);
    expect(TimelineOpSchema.safeParse({ op: "include", clip_id: "c1", include: false }).success).toBe(true);
    expect(TimelineOpSchema.safeParse({ op: "set_duration", clip_id: "c1", duration_frames: 120 }).success).toBe(false);
    expect(TimelineOpSchema.safeParse({ op: "set_zone", clip_id: "c1", zone: "pip_tr" }).success).toBe(false);
  });

  it("клип: override — только с причиной", () => {
    expect(VideoTimelineClipSchema.safeParse(clip()).success).toBe(true);
    expect(VideoTimelineClipSchema.safeParse(clip({ include: "override" })).success).toBe(false);
    expect(VideoTimelineClipSchema.safeParse(clip({ include: "override", override_reason: "C позже" })).success).toBe(true);
  });
});

describe("якоря", () => {
  it("anchorCheck: ключевое слово (кадр 400) внутри окна сцены 90 кадров", () => {
    expect(anchorCheck(clip(), 311)).toEqual({ ok: true });
    expect(anchorCheck(clip(), 300)).toEqual({ ok: false, outside: ["w_000120"] });
    expect(anchorCheck(clip(), 401)).toEqual({ ok: false, outside: ["w_000120"] });
  });

  it("snapToWord: к ближайшему слову не дальше maxDist кадров", () => {
    expect(snapToWord(103, [90, 100, 120])).toBe(100);
    expect(snapToWord(110, [90, 100, 120], 6)).toBe(110);
    expect(snapToWord(116, [90, 100, 120])).toBe(120);
    expect(snapToWord(5, [])).toBe(5);
  });
});

describe("composeTimeline", () => {
  const i1 = planItem({ id: "sp_001" });
  const i2 = planItem({ id: "sp_002", frames: { start: 600, end: 720 }, key_terms: [] });
  const i3 = planItem({ id: "sp_003", frames: { start: 900, end: 960 }, key_terms: [] });
  const i4 = planItem({ id: "sp_004", status: "rejected" });
  const ready = (version_id: string, approved?: string) => ({
    scene_id: `scn_${version_id}`, status: "ready" as const, current: { version_id, version_number: 2, duration_frames: 90 },
    ...(approved ? { approved: { version_id: approved, version_number: 1, duration_frames: 90 } } : {}),
  });

  it("без C сцена исключена; не готовая — failed / no_version; отклонённая в план не входит", () => {
    const d = composeTimeline({ tl, items: [i1, i2, i3, i4], scenes: { sp_001: ready("ver_a", "ver_a"), sp_002: ready("ver_b"), sp_003: { scene_id: "s3", status: "failed" } }, inputs, timelineId: "tml_1", revision: 1 });
    expect(d.scenes.map((c) => c.item_id)).toEqual(["sp_001"]);
    expect(d.excluded).toEqual([{ item_id: "sp_002", reason: "not_approved" }, { item_id: "sp_003", reason: "failed" }]);
    expect(VideoTimelineDocSchema.safeParse(d).success).toBe(true);
    const c = d.scenes[0]!;
    expect(c).toMatchObject({ version_id: "ver_a", version_number: 1, include: "approved", start_frame: 300, duration_frames: 90, placement: placementFor("overlay", "lower_third", i1.rect) });
    expect(c.anchors).toEqual([{ word_id: "w_000120", text: "миллион", frame: 330 }]);
    expect(d).toMatchObject({ duration_frames: 255, video: clipsToSequences(tl), fps: F30, revision: 1 });
  });

  it("неутверждённая — только override с причиной; устаревшая — stale; без сцены — no_version", () => {
    const d = composeTimeline({
      tl, items: [i1, i2, i3], inputs, timelineId: "tml_1", revision: 2,
      scenes: { sp_001: { ...ready("ver_a", "ver_a"), stale: true }, sp_002: ready("ver_b") }, overrides: { sp_002: "утвержу позже" },
    });
    expect(d.scenes.map((c) => [c.item_id, c.include, c.version_id, c.override_reason])).toEqual([["sp_002", "override", "ver_b", "утвержу позже"]]);
    expect(d.excluded).toEqual([{ item_id: "sp_001", reason: "stale" }, { item_id: "sp_003", reason: "no_version" }]);
  });

  it("длительность версии ≠ плану — blocking duration_mismatch", () => {
    const d = composeTimeline({ tl, items: [i1], inputs, timelineId: "tml_1", revision: 1, scenes: { sp_001: { ...ready("ver_a"), approved: { version_id: "ver_a", version_number: 1, duration_frames: 75 } } } });
    expect(d.issues).toContainEqual(expect.objectContaining({ item_id: "sp_001", code: "duration_mismatch", severity: "blocking" }));
  });
});

describe("timelineChecks", () => {
  const codes = (d: VideoTimelineDoc) => timelineChecks(d).map((i) => [i.code, i.severity]);

  it("пересечение: две непрозрачные или одна зона — blocking; разные зоны поверх — можно", () => {
    const full = (id: string, start: number) => clip({ clip_id: id, item_id: id, start_frame: start, placement: placementFor("fullscreen", "full"), z: 0, anchors: [] });
    expect(codes(doc([full("a", 100), full("b", 150)]))).toContainEqual(["scene_overlap", "blocking"]);
    const lt = (id: string, start: number, zone: "lower_third" | "top_band") => clip({ clip_id: id, item_id: id, start_frame: start, placement: placementFor("overlay", zone), anchors: [] });
    expect(codes(doc([lt("a", 100, "lower_third"), lt("b", 150, "lower_third")]))).toContainEqual(["scene_overlap", "blocking"]);
    expect(codes(doc([lt("a", 100, "lower_third"), lt("b", 150, "top_band")]))).toEqual([]);
    expect(codes(doc([lt("a", 100, "lower_third"), lt("b", 190, "lower_third")]))).toEqual([]);
  });

  it("якорь вне окна — blocking, с причиной — warning; за концом ролика — out_of_range", () => {
    expect(codes(doc([clip({ start_frame: 250 })]))).toEqual([["anchor_outside", "blocking"]]);
    expect(codes(doc([clip({ start_frame: 250, override_reason: "так задумано" })]))).toEqual([["anchor_outside", "warning"]]);
    expect(codes(doc([clip({ start_frame: 330 })], 400))).toEqual([["out_of_range", "blocking"]]);
  });

  it("версия другой длины — duration_mismatch", () => {
    expect(codes(doc([clip({ version_frames: 89 })]))).toEqual([["duration_mismatch", "blocking"]]);
    expect(codes(doc([clip({ version_frames: 90 })]))).toEqual([]);
  });
});
