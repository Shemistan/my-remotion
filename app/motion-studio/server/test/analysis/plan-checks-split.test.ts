// Task 35′ (Р-V5, Phase 3 F6): split_screen при лице автора в центре кадра не предлагается —
// половина экрана под графику закрыла бы лицо (автор не перекадрируется). blocking split_face_center.
import { describe, expect, it } from "vitest";
import type { NormRect, ScenePlanItem } from "@ms/contracts";
import { SPLIT_FACE_CENTER, planChecks } from "../../src/analysis/plan-checks.js";
import { SPLIT_FACE_CENTER as INPUT_CENTER, faceSide } from "../../src/analysis/planner-input.js";
import { ZONE_RECTS } from "../../src/analysis/zones.js";
import { P, footage, sc } from "./plan-helpers.js";

const face = (cx: number): NormRect => ({ x: cx - 0.1, y: 0.1, w: 0.2, h: 0.4 });
const split: Partial<ScenePlanItem> = { composition_mode: "split_screen", zone: "split_right", rect: ZONE_RECTS.split_right };
const run = (faceCenterX: number | undefined, over: Partial<ScenePlanItem> = split) =>
  planChecks([sc(1_000_000, 4_000_000, over)], { editedDurationUs: 60_000_000, cfg: P, footage: footage(faceCenterX === undefined ? undefined : face(faceCenterX)) });
const codes = (xs: ReturnType<typeof planChecks>) => xs.filter((i) => i.severity === "blocking").map((i) => i.code);

describe("split_face_center", () => {
  it("центр лица по x в [0,35; 0,65] — blocking", () => {
    expect(codes(run(0.5))).toContain("split_face_center");
    expect(codes(run(0.36))).toContain("split_face_center");
    expect(codes(run(0.64))).toContain("split_face_center");
    expect(run(0.5).find((i) => i.code === "split_face_center")!.message).toMatch(/центр/);
  });

  it("автор сбоку, лица нет, нет анализа видеоряда, другой режим — нет", () => {
    expect(codes(run(0.25))).not.toContain("split_face_center");
    expect(codes(run(0.75))).not.toContain("split_face_center");
    expect(codes(run(undefined))).not.toContain("split_face_center");
    expect(codes(planChecks([sc(1_000_000, 4_000_000, split)], { editedDurationUs: 60_000_000, cfg: P }))).not.toContain("split_face_center");
    expect(codes(run(0.5, { composition_mode: "fullscreen", zone: "full", rect: ZONE_RECTS.full }))).not.toContain("split_face_center");
  });

  it("один порог с face_zone планировщика: 0,37 — center и blocking, 0,30 — left и не blocking", () => {
    expect(SPLIT_FACE_CENTER).toBe(INPUT_CENTER);
    expect(faceSide([face(0.37)])).toBe("center");
    expect(codes(run(0.37))).toContain("split_face_center");
    expect(faceSide([face(0.63)])).toBe("center");
    expect(codes(run(0.63))).toContain("split_face_center");
    expect(faceSide([face(0.3)])).toBe("left");
    expect(codes(run(0.3))).not.toContain("split_face_center");
    expect(faceSide([face(0.7)])).toBe("right");
    expect(codes(run(0.7))).not.toContain("split_face_center");
  });
});
