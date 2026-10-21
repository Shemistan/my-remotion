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
  it("Test 1: hero-number → growth-chart.head; бит счёта b4 (24–106) делит график — счёт уходит в свой бит 25–106, b4 не меняется", () => {
    const spec = fixture();
    expect(boundCounters(spec)).toEqual([expect.objectContaining({ number: "hero-number", chart: "growth-chart", beat: "b4", chartBeat: "b2", startFrame: 25, endFrame: 106 })]);
    const w = lineDrawWindow(beat(spec, "b2"));
    const { spec: out, changes, warnings } = normalizeBoundCounters(spec);
    expect(warnings).toEqual([]);
    const own = beat(out, "hero-number-count");
    expect([own.start_frame, own.end_frame, own.element_ids]).toEqual([w.startFrame, w.endFrame, ["hero-number"]]);
    expect(own.action).toMatch(/count/);
    // общий бит остаётся на месте, только без счётчика
    expect(beat(out, "b4")).toEqual({ ...beat(spec, "b4"), element_ids: ["growth-chart"] });
    expect(changes).toEqual([expect.stringContaining("b4 делят другие элементы")]);
    // биты по времени, остальные — те же, исходная spec не меняется
    expect(out.beats.map((b) => b.start_frame)).toEqual([...out.beats.map((b) => b.start_frame)].sort((a, b) => a - b));
    expect(out.beats.filter((b) => b.id !== "b4" && b.id !== "hero-number-count")).toEqual(spec.beats.filter((b) => b.id !== "b4"));
    expect(beat(spec, "b4").element_ids).toContain("hero-number");
    expect(normalizeBoundCounters(out).changes).toEqual([]);
  });

  it("бит счёта только у числа — переписывается на месте: 24–106 → 25–106", () => {
    const spec = fixture();
    const solo = { ...spec, beats: spec.beats.map((b) => (b.id === "b4" ? { ...b, element_ids: ["hero-number"] } : b)) };
    const { spec: out, changes } = normalizeBoundCounters(solo);
    expect([beat(out, "b4").start_frame, beat(out, "b4").end_frame]).toEqual([25, 106]);
    expect(out.beats).toHaveLength(solo.beats.length);
    expect(changes).toEqual([expect.stringContaining("b4 24–106 → 25–106")]);
  });

  it("окно в пределах длительности: конец за duration_frames зажимается; пустое окно — не трогаем, предупреждение", () => {
    const spec = fixture();
    const solo = (dur: number, chart: [number, number]) => ({
      ...spec,
      duration_frames: dur,
      beats: spec.beats.map((b) => (b.id === "b4" ? { ...b, element_ids: ["hero-number"] } : b.id === "b2" ? { ...b, start_frame: chart[0], end_frame: chart[1] } : b)),
    });
    // b2 10–130 → окно 25–106, длительность 100 → 25–100
    const clipped = normalizeBoundCounters(solo(100, [10, 130]));
    expect([beat(clipped.spec, "b4").start_frame, beat(clipped.spec, "b4").end_frame]).toEqual([25, 100]);
    // b2 170–260 → окно 181–242 целиком за концом сцены 180
    const empty = normalizeBoundCounters(solo(180, [170, 260]));
    expect(empty.changes).toEqual([]);
    expect(beat(empty.spec, "b4")).toEqual(beat(solo(180, [170, 260]), "b4"));
    expect(empty.warnings).toEqual([expect.stringContaining("hero-number")]);
  });

  it("у графика нет бита с draw — счётчик не нормализуется, предупреждение", () => {
    const spec = fixture();
    const noDraw = { ...spec, beats: spec.beats.map((b) => (b.id === "b2" ? { ...b, action: "chart-in" } : b)) };
    expect(boundCounters(noDraw)).toEqual([]);
    const r = normalizeBoundCounters(noDraw);
    expect(r.changes).toEqual([]);
    expect(r.warnings).toEqual([expect.stringMatching(/growth-chart.*draw/)]);
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

  it("вход числа кончается позже, чем тронулась линия, — бит входа сдвигается к окну головы (длина та же)", () => {
    const spec = fixture();
    // как в прогоне 2 Fix C: вход 16–40, график 20–140 (окно 35–116)
    const late = {
      ...spec,
      beats: [
        ...spec.beats.map((b) => (b.id === "b2" ? { ...b, start_frame: 20, end_frame: 140 } : b.id === "b4" ? { ...b, element_ids: ["hero-number"], start_frame: 35, end_frame: 116 } : b)),
        { id: "b0", start_frame: 16, end_frame: 40, action: "hero-in", description: "", element_ids: ["hero-number"] },
      ],
    };
    const { spec: out, changes } = normalizeBoundCounters(late);
    expect([beat(out, "b0").start_frame, beat(out, "b0").end_frame]).toEqual([11, 35]);
    expect(changes).toEqual([expect.stringContaining("вход")]);
    // общий бит входа не двигается — предупреждение
    const shared = { ...late, beats: late.beats.map((b) => (b.id === "b0" ? { ...b, element_ids: ["hero-number", "kicker"] } : b)) };
    const r = normalizeBoundCounters(shared);
    expect(beat(r.spec, "b0")).toEqual(beat(shared, "b0"));
    expect(r.warnings).toEqual([expect.stringContaining("b0")]);
  });
});
