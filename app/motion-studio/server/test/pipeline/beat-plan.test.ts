// Шаг пайплайна после Director (S3a): кадры битов — из фаз и структуры (planBeats kit),
// Director кадров не пишет. Счётчики по приходам — в окне потока, старые spec — как были.
import { describe, expect, it } from "vitest";
import { type DirectorSpec, type MotionSpec, MotionSpecSchema, type SceneStructure, defaultSettings } from "@ms/contracts";
import { planBeats } from "@ms/render";
import { alignArrivalCounters, planSpecBeats } from "../../src/pipeline/beat-plan.js";
import { directorOutput } from "./helpers.js";

const settings = defaultSettings();

/** Схема запрос → ответ: узлы, граф с потоком, счётчик приходов, итог. */
function phasedSpec(structure?: SceneStructure): DirectorSpec {
  return {
    title: "Ответ из кэша",
    purpose: "кэш отвечает в 10 раз быстрее",
    duration_frames: 180,
    fps: { num: 30, den: 1 },
    style_preset: "dark-premium",
    composition: { archetype: "network-centric", idea: "x", focus: "y", transitions: "z", ...(structure ? { structure } : {}) },
    elements: [
      { id: "client", kind: "card", role: "node: клиент", entrance: "slide", content: { label: "Клиент" } },
      { id: "cache", kind: "card", role: "node: кэш", entrance: "pop", content: { label: "Кэш" } },
      { id: "graph", kind: "graph", role: "схема", entrance: "draw", content: { edges: [{ id: "e1", from: "client", to: "cache" }], flows: [{ edge: "e1", direction: "forward", beat: "b-flow" }] } },
      { id: "hits", kind: "number", role: "счётчик ответов", entrance: "count", content: { from: 0, to: 12, bound_to: "graph.arrivals.e1" } },
      { id: "verdict", kind: "text", role: "акцент: вывод", entrance: "mask", content: { text: "В 10 раз быстрее" } },
    ],
    phases: [
      { id: "p-setup", role: "setup", weight: 1, element_ids: ["client", "cache", "graph"] },
      { id: "p-flow", role: "action", weight: 3, element_ids: ["graph", "hits"] },
      { id: "p-pay", role: "payoff", weight: 1, element_ids: ["verdict"] },
      { id: "p-hold", role: "hold", weight: 1, element_ids: ["verdict", "graph"], hold_mode: "steady-flow" },
    ],
    beats: [
      { id: "b-client", phase: "p-setup", action: "client-in", description: "", element_ids: ["client"] },
      { id: "b-cache", phase: "p-setup", action: "cache-in", description: "", element_ids: ["cache"] },
      { id: "b-edges", phase: "p-setup", action: "edges-draw", description: "", element_ids: ["graph"] },
      { id: "b-flow", phase: "p-flow", action: "requests-flow", description: "", element_ids: ["graph"] },
      { id: "b-hits", phase: "p-flow", action: "hits-count", description: "", element_ids: ["hits"] },
      { id: "b-verdict", phase: "p-pay", action: "verdict-emphasis", description: "", element_ids: ["verdict"] },
      { id: "b-hold", phase: "p-hold", action: "hold", description: "потоки идут тише", element_ids: ["verdict", "graph"] },
    ],
  };
}
const beat = (s: MotionSpec, id: string) => s.beats.find((b) => b.id === id)!;
const ok = (r: ReturnType<typeof planSpecBeats>) => {
  if (!r.ok) throw new Error(r.message);
  return r;
};

describe("planSpecBeats", () => {
  it("spec без фаз — биты Director как есть (build-strike по умолчанию)", () => {
    const legacy = directorOutput().spec;
    const r = ok(planSpecBeats(legacy, settings));
    expect(r.spec.beats).toEqual(legacy.beats);
    expect(r.plan).toBeUndefined();
    expect(r.changes).toEqual([]);
  });

  it("фазы → окна planBeats; биты фазы — по порядку внутри окна, валидная MotionSpec", () => {
    const d = phasedSpec("build-strike");
    const r = ok(planSpecBeats(d, settings));
    expect(MotionSpecSchema.safeParse(r.spec).success).toBe(true);
    const plan = planBeats({ structure: "build-strike", phases: r.phases!, duration: 180, fps: 30, intensity: settings.animation_intensity, density: 5, seed: "Ответ из кэша|кэш отвечает в 10 раз быстрее" });
    const win = (id: string) => plan.beats.find((b) => b.phase === id && b.kind === "main")!;
    // setup: три бита по порядку, старт первого — старт фазы
    const setup = ["b-client", "b-cache", "b-edges"].map((id) => beat(r.spec, id));
    expect(setup[0]!.start_frame).toBe(win("p-setup").start_frame);
    expect(setup[0]!.start_frame).toBeLessThan(setup[1]!.start_frame);
    expect(setup[1]!.start_frame).toBeLessThan(setup[2]!.start_frame);
    for (const b of setup) expect(b.end_frame).toBeLessThanOrEqual(win("p-setup").end_frame);
    // рисование — до конца окна фазы (span phase по действию draw)
    expect(beat(r.spec, "b-edges").end_frame).toBe(win("p-setup").end_frame);
    // удар и удержание: payoff в окне payoff, hold до последнего кадра
    expect([beat(r.spec, "b-verdict").start_frame, beat(r.spec, "b-verdict").end_frame]).toEqual([win("p-pay").start_frame, win("p-pay").end_frame]);
    expect(beat(r.spec, "b-hold").end_frame).toBe(180);
    expect(r.spec.beats.map((b) => b.start_frame)).toEqual([...r.spec.beats.map((b) => b.start_frame)].sort((a, b) => a - b));
  });

  it("текст вывода → время чтения: payoff + hold ≥ 2 с", () => {
    const r = ok(planSpecBeats(phasedSpec(), settings));
    expect(r.phases!.find((p) => p.id === "p-pay")!.chars).toBe("В 10 раз быстрее".length);
    expect(180 - beat(r.spec, "b-verdict").start_frame).toBeGreaterThanOrEqual(60);
  });

  it("span: phase растягивает бит на всё окно фазы, slot — своя доля", () => {
    const d = phasedSpec();
    d.beats = d.beats.map((b) => (b.id === "b-client" ? { ...b, span: "phase" as const } : b));
    const r = ok(planSpecBeats(d, settings));
    expect(beat(r.spec, "b-client").end_frame).toBe(beat(r.spec, "b-edges").end_frame);
  });

  it("счётчик приходов идёт в окне своего потока", () => {
    const r = ok(planSpecBeats(phasedSpec(), settings));
    const flow = beat(r.spec, "b-flow");
    expect([beat(r.spec, "b-hits").start_frame, beat(r.spec, "b-hits").end_frame]).toEqual([flow.start_frame, flow.end_frame]);
  });

  it("cold-open: бит-постер итога с кадра 0 до объяснения", () => {
    const r = ok(planSpecBeats(phasedSpec("cold-open"), settings));
    const open = beat(r.spec, "p-pay-open");
    expect(open.start_frame).toBe(0);
    expect(open.element_ids).toEqual(["verdict"]);
    expect(open.action).toMatch(/cold-open/);
    expect(open.end_frame).toBeLessThanOrEqual(beat(r.spec, "b-client").start_frame);
  });

  it("фаза без битов получает свой бит; hold без слова hold — добавляется бит hold", () => {
    const d = phasedSpec();
    d.beats = d.beats.filter((b) => b.id !== "b-verdict").map((b) => (b.id === "b-hold" ? { ...b, action: "steady" } : b));
    const r = ok(planSpecBeats(d, settings));
    const pay = r.spec.beats.find((b) => b.phase === "p-pay")!;
    expect(pay.element_ids).toEqual(["verdict"]);
    expect(pay.action).toMatch(/emphasis/);
    const holds = r.spec.beats.filter((b) => /hold/.test(b.action));
    expect(holds).toHaveLength(1);
    expect(holds[0]!.end_frame).toBe(180);
  });

  it("структуры дают разные кадры удара; одна и та же spec — один и тот же план", () => {
    const at = (s?: SceneStructure) => beat(ok(planSpecBeats(phasedSpec(s), settings)).spec, "b-verdict").start_frame;
    expect(new Set([at(), at("count-up"), at("call-response"), at("split-reveal")]).size).toBeGreaterThan(1);
    expect(ok(planSpecBeats(phasedSpec("count-up"), settings)).spec).toEqual(ok(planSpecBeats(phasedSpec("count-up"), settings)).spec);
  });

  it("идемпотентно: план поверх спланированной spec (чекпоинт) — тот же результат", () => {
    const once = ok(planSpecBeats(phasedSpec("cold-open"), settings)).spec;
    const twice = ok(planSpecBeats(once, settings)).spec;
    expect(twice).toEqual(once);
  });
});

describe("alignArrivalCounters (spec без фаз)", () => {
  it("бит счёта только числа → окно потока ребра; общий бит не трогается", () => {
    const d = phasedSpec();
    const legacy: MotionSpec = MotionSpecSchema.parse({
      ...d,
      phases: undefined,
      beats: [
        { id: "b-in", start_frame: 0, end_frame: 30, action: "nodes-in", description: "", element_ids: ["client", "cache", "graph", "verdict"] },
        { id: "b-flow", start_frame: 40, end_frame: 120, action: "flow", description: "", element_ids: ["graph"] },
        { id: "b-hits", start_frame: 30, end_frame: 90, action: "hits-count", description: "", element_ids: ["hits"] },
        { id: "b-hold", start_frame: 120, end_frame: 180, action: "hold", description: "", element_ids: ["graph", "verdict"] },
      ],
    });
    const r = alignArrivalCounters(legacy);
    expect([beat(r.spec, "b-hits").start_frame, beat(r.spec, "b-hits").end_frame]).toEqual([40, 120]);
    expect(r.changes).toEqual([expect.stringContaining("hits")]);
    const shared = { ...legacy, beats: legacy.beats.map((b) => (b.id === "b-hits" ? { ...b, element_ids: ["hits", "verdict"] } : b)) };
    expect(alignArrivalCounters(shared).spec).toEqual(shared);
  });
});
