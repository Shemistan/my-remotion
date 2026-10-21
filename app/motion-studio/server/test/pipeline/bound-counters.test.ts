// Счётчик с `bound_to: "<chart>.head"`: бит счёта — ровно окно движения головы линии
// (lineChartHead / lineDrawWindow), Director формулу окна не считает.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type MotionSpec, defaultSettings } from "@ms/contracts";
import { lineDrawWindow } from "@ms/render";
import { boundCounters, normalizeBoundCounters } from "../../src/pipeline/bound-counters.js";
import { specChecks } from "../../src/qa/spec-checks.js";

const fixture = (): MotionSpec => JSON.parse(readFileSync(new URL("../fixtures/specs/test1-r1.json", import.meta.url), "utf8")) as MotionSpec;
const beat = (s: MotionSpec, id: string) => s.beats.find((b) => b.id === id)!;

describe("bound counters", () => {
  it("Test 1: hero-number → growth-chart.head; бит счёта b4 24–106 → окно головы бита графика b2 (10–130): 25–106", () => {
    const spec = fixture();
    expect(boundCounters(spec)).toEqual([expect.objectContaining({ number: "hero-number", chart: "growth-chart", beat: "b4", chartBeat: "b2", startFrame: 25, endFrame: 106 })]);
    const w = lineDrawWindow(beat(spec, "b2"));
    const { spec: out, changes } = normalizeBoundCounters(spec);
    expect([beat(out, "b4").start_frame, beat(out, "b4").end_frame]).toEqual([w.startFrame, w.endFrame]);
    expect(changes).toEqual([expect.stringContaining("b4 24–106 → 25–106")]);
    // исходная spec не меняется, остальные биты — те же
    expect(beat(spec, "b4").start_frame).toBe(24);
    expect(out.beats.filter((b) => b.id !== "b4")).toEqual(spec.beats.filter((b) => b.id !== "b4"));
    expect(normalizeBoundCounters(out).changes).toEqual([]);
  });

  it("specChecks: несовпадение бита счётчика с окном головы — warning bound_counter_timing; после нормализации нет", () => {
    const spec = fixture();
    const s = { ...defaultSettings(), duration_frames: spec.duration_frames };
    expect(specChecks(spec, s).filter((i) => i.code === "bound_counter_timing")).toEqual([
      expect.objectContaining({ severity: "warning", area: "hero-number" }),
    ]);
    expect(specChecks(normalizeBoundCounters(spec).spec, s).filter((i) => i.code === "bound_counter_timing")).toEqual([]);
  });

  it("без bound_to, с неизвестным графиком или счёт в том же бите, что и график, — не трогается", () => {
    const spec = fixture();
    const content = (id: string, over: Record<string, unknown>) => ({
      ...spec,
      elements: spec.elements.map((e) => (e.id === id ? { ...e, content: { ...e.content, ...over } } : e)),
    });
    expect(boundCounters(content("hero-number", { bound_to: undefined }))).toEqual([]);
    expect(boundCounters(content("hero-number", { bound_to: "nope.head" }))).toEqual([]);
    const same = { ...spec, beats: spec.beats.map((b) => (b.id === "b2" ? { ...b, element_ids: [...b.element_ids, "hero-number"], action: "chart-draw-count" } : b)) };
    expect(normalizeBoundCounters(same).changes).toEqual([]);
  });
});
