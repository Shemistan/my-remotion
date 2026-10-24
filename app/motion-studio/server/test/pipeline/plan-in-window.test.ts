// S5 fix (I1, M4): раскладка сцены сценария — биты без фазы (кадры Director) не раньше lead,
// удержание ≥ tail при длинном запасе после речи.
import { describe, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import { planInWindow } from "../../src/pipeline/steps.js";

const spec = (total: number) => ({
  title: "Версия", purpose: "версия", duration_frames: total, fps: { num: 30, den: 1 }, style_preset: "dark-premium",
  elements: [
    { id: "num", kind: "number", role: "emphasis", entrance: "count", content: { value: 1.24 }, layout: { x: 0.3, y: 0.3, w: 0.4, h: 0.3 } },
    { id: "label", kind: "text", role: "подпись", entrance: "rise", content: { text: "Go" }, layout: { x: 0.3, y: 0.1, w: 0.4, h: 0.1 } },
    { id: "glow", kind: "shape", role: "decor", entrance: "fade", content: {}, layout: { x: 0, y: 0, w: 1, h: 1 } },
  ],
  phases: [
    { id: "count", role: "action", weight: 50, element_ids: ["num"] },
    { id: "intro", role: "setup", weight: 15, element_ids: ["label"] },
    { id: "fin", role: "hold", weight: 35, element_ids: ["num", "label"], hold_mode: "data-shimmer" },
  ],
  beats: [
    { id: "b_glow", action: "glow-enter", kind: "enter", description: "", element_ids: ["glow"], start_frame: 0, end_frame: 20 },
    { id: "b_count", phase: "count", action: "count-up", kind: "count", description: "", element_ids: ["num"] },
    { id: "b_label", phase: "intro", action: "label-enter", kind: "enter", description: "", element_ids: ["label"] },
    { id: "b_hold", phase: "fin", action: "hold", kind: "hold", description: "", element_ids: ["num", "label"] },
  ],
});

describe("planInWindow", () => {
  it("бит без фазы, начатый до lead, сдвигается на lead с сохранением длины; запись в changes", () => {
    const r = planInWindow(spec(180) as never, { ...defaultSettings(), duration_frames: 180 }, { lead: 15, speech: 135, tail: 30 });
    expect(r.ok, r.ok ? "" : r.message).toBe(true);
    if (!r.ok) return;
    const glow = r.spec.beats.find((b) => b.id === "b_glow")!;
    expect([glow.start_frame, glow.end_frame]).toEqual([15, 35]);
    expect(r.changes.some((c) => /b_glow/.test(c))).toBe(true);
  });

  it("длинный tail: hold растянут на [total − tail; total), фазы — в [lead; total − tail)", () => {
    const r = planInWindow(spec(240) as never, { ...defaultSettings(), duration_frames: 240 }, { lead: 15, speech: 75, tail: 150 });
    expect(r.ok, r.ok ? "" : r.message).toBe(true);
    if (!r.ok) return;
    const hold = r.spec.beats.find((b) => b.id === "b_hold")!;
    expect([hold.start_frame, hold.end_frame]).toEqual([90, 240]);
    for (const b of r.spec.beats.filter((x) => x.phase && x.phase !== "fin")) {
      expect(b.start_frame, b.id).toBeGreaterThanOrEqual(15);
      expect(b.end_frame, b.id).toBeLessThanOrEqual(90);
    }
  });
});
