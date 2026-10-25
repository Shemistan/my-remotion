// Task 42: перенос пользовательских операций на пересобранную ревизию (`carryOver`): сдвинутый
// пользователем клип сохраняет смещение от первого якоря; сохранить нельзя — позиция плана и
// `move_dropped`; несдвинутые клипы — на позиции плана; исключение пользователем переносится.
import { describe, expect, it } from "vitest";
import { ZONE_RECTS, type VideoTimelineClip, type VideoTimelineDoc, placementFor, timelineChecks } from "@ms/contracts";
import { carryOver } from "../../src/timeline/carry-over.js";
import { applyTimelineOps } from "../../src/timeline/ops.js";

const H = "a".repeat(64);
function clip(item: string, start: number, dur: number, anchor?: number): VideoTimelineClip {
  return {
    clip_id: `clip_${item}`, scene_id: `scn_${item}`, item_id: item, version_id: `ver_${item}`, version_number: 1, include: "approved",
    start_frame: start, duration_frames: dur, placement: placementFor("overlay", "lower_third", ZONE_RECTS.lower_third), z: 1,
    anchors: anchor === undefined ? [] : [{ word_id: `w_${item}`, text: "слово", frame: anchor }], version_frames: dur,
  };
}
function doc(scenes: VideoTimelineClip[], over: Partial<VideoTimelineDoc> = {}): VideoTimelineDoc {
  const d: VideoTimelineDoc = {
    schema_version: 1, timeline_id: "tl_p1", revision: 1, fps: { num: 30, den: 1 }, duration_frames: 900,
    inputs: { media_sha256: H, edl: { id: "edl_1", revision: 1, hash: H }, plan: { id: "pln_1", revision: 1, hash: H }, style: { id: "sty_1", revision: 1, hash: H } },
    video: [], scenes, excluded: [], issues: [], ...over,
  };
  return { ...d, issues: timelineChecks(d) };
}

// до вырезки: sp_001 [300, 390) с якорем 340, sp_002 [600, 720) с якорем 645
const d1 = doc([clip("sp_001", 300, 90, 340), clip("sp_002", 600, 120, 645)]);
// после вырезки 45 кадров до сцен: всё на 45 кадров раньше
const rebuilt = doc([clip("sp_001", 255, 90, 295), clip("sp_002", 555, 120, 600)], { revision: 2, parent_revision: 1, duration_frames: 855 });

describe("carryOver", () => {
  it("вырезка 45 кадров до сцены: сдвинутый пользователем клип сохраняет смещение от якоря (−10), несдвинутый — на плане", () => {
    const moved = applyTimelineOps(d1, [{ op: "move", clip_id: "clip_sp_001", start_frame: 330 }], {});
    const next = carryOver(moved, rebuilt);
    expect(next.scenes.map((c) => c.start_frame)).toEqual([285, 555]);
    expect(next.ops).toEqual([{ op: "move", clip_id: "clip_sp_001", start_frame: 285 }]);
    expect(next.issues).toEqual([]);
  });

  it("сохранить смещение нельзя (якорь вне окна) → позиция плана и move_dropped", () => {
    const moved = applyTimelineOps(d1, [{ op: "move", clip_id: "clip_sp_001", start_frame: 260 }], {});
    // новый план укоротил окно до якоря: якорь теперь на 90-м кадре сцены — смещение −35 его теряет
    const narrow = doc([clip("sp_001", 255, 60, 300), clip("sp_002", 555, 120, 600)], { revision: 2, duration_frames: 855 });
    const next = carryOver(moved, narrow);
    expect(next.scenes[0]!.start_frame).toBe(255);
    expect(next.issues).toContainEqual(expect.objectContaining({ item_id: "sp_001", code: "move_dropped", severity: "warning" }));
    expect(next.ops).toBeUndefined();
  });

  it("клип без якорей — смещение от позиции плана прежней ревизии; исключение пользователем переносится", () => {
    const plain = doc([clip("sp_001", 300, 90), clip("sp_002", 600, 120, 645)]);
    const ops = applyTimelineOps(plain, [{ op: "move", clip_id: "clip_sp_001", start_frame: 310 }, { op: "include", clip_id: "clip_sp_002", include: false }], {});
    const next = carryOver(ops, doc([clip("sp_001", 255, 90), clip("sp_002", 555, 120, 600)], { revision: 2 }), { prevPlanStarts: { sp_001: 300 } });
    expect(next.scenes.map((c) => [c.item_id, c.start_frame])).toEqual([["sp_001", 265]]);
    expect(next.excluded).toEqual([{ item_id: "sp_002", reason: "user" }]);
    expect(next.ops).toEqual([{ op: "move", clip_id: "clip_sp_001", start_frame: 265 }, { op: "include", clip_id: "clip_sp_002", include: false }]);
  });

  it("операций в прежней ревизии нет — следующая как есть", () => {
    expect(carryOver(d1, rebuilt)).toEqual(rebuilt);
  });
});
