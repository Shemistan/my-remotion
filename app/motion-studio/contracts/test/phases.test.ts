// Структура сцены и фазы (S3a): Director выбирает `composition.structure` и веса фаз,
// кадры битов ставит планировщик. Старые spec без фаз валидны и читаются как build-strike.
import { describe, expect, it } from "vitest";
import {
  DirectorOutputSchema, DirectorSpecSchema, MotionSpecSchema, SceneStructureSchema,
  STRUCTURE_RULES, beatKind, isAccentBeat, isProgressBeat, phasesOf, structureOf, structureOfRule,
} from "../src/index.js";
import { baseSpec } from "./fixtures.js";

const ok = (v: unknown) => MotionSpecSchema.safeParse(v).success;
const dok = (v: unknown) => DirectorSpecSchema.safeParse(v).success;

const phased = () => ({
  ...baseSpec(),
  phases: [
    { id: "p-setup", role: "setup", weight: 1, element_ids: ["title"] },
    { id: "p-draw", role: "action", weight: 3, element_ids: ["chart"] },
    { id: "p-hold", role: "hold", weight: 1, element_ids: ["chart"], hold_mode: "data-shimmer" },
  ],
});
/** Ответ Director: биты без кадров, с фазой. */
const directorSpec = () => {
  const s = phased();
  return { ...s, beats: [
    { id: "b1", phase: "p-setup", action: "title-in", description: "", element_ids: ["title"] },
    { id: "b2", phase: "p-draw", action: "chart-draw", description: "", element_ids: ["chart"] },
  ] };
};

describe("структура и фазы в spec", () => {
  it("шесть структур", () =>
    expect(SceneStructureSchema.options).toEqual(["build-strike", "cold-open", "continuous-flow", "split-reveal", "call-response", "count-up"]));

  it("spec без структуры и фаз валидна; читается как build-strike с фазами из битов", () => {
    const s = MotionSpecSchema.parse(baseSpec());
    expect(structureOf(s)).toBe("build-strike");
    const p = phasesOf(s);
    expect(p.map((x) => x.role)).toEqual(["setup", "action"]);
    expect(p.flatMap((x) => x.element_ids)).toEqual(["title", "chart"]);
  });

  it("фазы из битов: hold → hold, акцент → payoff", () => {
    const s = MotionSpecSchema.parse({
      ...baseSpec(),
      beats: [
        { id: "a", start_frame: 0, end_frame: 30, action: "title-in", description: "", element_ids: ["title"] },
        { id: "b", start_frame: 20, end_frame: 120, action: "chart-draw", description: "", element_ids: ["chart"] },
        { id: "c", start_frame: 120, end_frame: 150, action: "final-emphasis", description: "", element_ids: ["chart"] },
        { id: "d", start_frame: 150, end_frame: 180, action: "hold", description: "", element_ids: ["chart", "title"] },
      ],
    });
    expect(phasesOf(s).map((x) => [x.id, x.role])).toEqual([["a", "setup"], ["b", "action"], ["c", "payoff"], ["d", "hold"]]);
  });

  it("composition.structure и phases с hold_mode проходят; phasesOf отдаёт фазы spec", () => {
    const s = phased();
    expect(ok({ ...s, composition: { archetype: "split", idea: "x", focus: "y", transitions: "z", structure: "cold-open" } })).toBe(true);
    const parsed = MotionSpecSchema.parse({ ...s, composition: { archetype: "split", idea: "x", focus: "y", transitions: "z", structure: "count-up" } });
    expect(structureOf(parsed)).toBe("count-up");
    expect(phasesOf(parsed)).toEqual(s.phases);
  });

  it("неизвестная структура, роль или режим удержания отвергаются", () => {
    expect(ok({ ...baseSpec(), composition: { archetype: "split", idea: "x", focus: "y", transitions: "z", structure: "zigzag" } })).toBe(false);
    const role = phased();
    (role.phases[0] as Record<string, unknown>).role = "climax";
    expect(ok(role)).toBe(false);
    const mode = phased();
    (mode.phases[2] as Record<string, unknown>).hold_mode = "spin";
    expect(ok(mode)).toBe(false);
  });

  it("фазы: дубль id, неизвестный элемент, вес ≤ 0, hold_mode не у hold, два hold — ошибки", () => {
    const dup = phased();
    dup.phases[1]!.id = "p-setup";
    expect(ok(dup)).toBe(false);
    const el = phased();
    el.phases[0]!.element_ids = ["nope"];
    expect(ok(el)).toBe(false);
    const w = phased();
    w.phases[0]!.weight = 0;
    expect(ok(w)).toBe(false);
    const hm = phased();
    (hm.phases[0] as Record<string, unknown>).hold_mode = "now-pulse";
    expect(ok(hm)).toBe(false);
    const two = phased();
    two.phases.push({ id: "p-hold2", role: "hold", weight: 1, element_ids: ["title"] });
    expect(ok(two)).toBe(false);
  });

  it("бит с фазой: фаза должна существовать", () => {
    const s = phased();
    expect(ok({ ...s, beats: s.beats.map((b) => ({ ...b, phase: "p-draw" })) })).toBe(true);
    expect(ok({ ...s, beats: s.beats.map((b) => ({ ...b, phase: "p-x" })) })).toBe(false);
    expect(ok({ ...baseSpec(), beats: baseSpec().beats.map((b) => ({ ...b, phase: "p-draw" })) })).toBe(false);
  });
});

describe("ответ Director: биты без кадров", () => {
  it("с фазами кадры не нужны; бит без фазы и без кадров — ошибка", () => {
    expect(dok(directorSpec())).toBe(true);
    const s = directorSpec();
    delete (s.beats[0] as Record<string, unknown>).phase;
    expect(dok(s)).toBe(false);
  });

  it("без фаз — прежний формат: кадры обязательны, проверки MotionSpec действуют", () => {
    expect(dok(baseSpec())).toBe(true);
    const s = baseSpec();
    delete (s.beats[0] as Record<string, unknown>).start_frame;
    expect(dok(s)).toBe(false);
    expect(dok({ ...baseSpec(), beats: [{ ...baseSpec().beats[0]!, end_frame: 400 }] })).toBe(false);
  });

  it("DirectorOutput принимает spec без кадров", () => {
    expect(DirectorOutputSchema.safeParse({
      spec: directorSpec(),
      composition: { archetype: "split", idea: "x", focus: "y", transitions: "z", structure: "split-reveal" },
      selection: { items: [] },
      rationale: "r",
    }).success).toBe(true);
  });
});

describe("вид бита (S3a-fix M4): целыми словами или явный kind", () => {
  it("входы с «чужими» подстроками — входы; counter-entrance — вход, не счёт", () => {
    for (const a of ["upstream-in", "downstream-in", "workflow-in", "account-card-in", "discount-in", "drawer-in", "threshold-in", "placeholder-in", "rerun-in", "counter-entrance"]) {
      expect(beatKind({ action: a }), a).toBe("enter");
    }
  });
  it("длящиеся, счёт, акцент, удержание — по словам", () => {
    expect(beatKind({ action: "chart-draw" })).toBe("sustain");
    expect(beatKind({ action: "requests-flow" })).toBe("sustain");
    expect(beatKind({ action: "bg_loop" })).toBe("sustain");
    expect(beatKind({ action: "hits-count" })).toBe("count");
    expect(beatKind({ action: "count-up" })).toBe("count");
    expect(beatKind({ action: "final-emphasis" })).toBe("accent");
    expect(beatKind({ action: "hold" })).toBe("hold");
    expect(beatKind({ action: "verdict-shows" })).toBeUndefined();
  });
  it("явный kind сильнее слов; акцент и «ведёт к итогу» — тем же признаком", () => {
    expect(beatKind({ action: "upstream-in", kind: "sustain" })).toBe("sustain");
    expect(isAccentBeat({ action: "verdict-in", kind: "accent" })).toBe(true);
    expect(isAccentBeat({ action: "glow-emphasis", kind: "enter" })).toBe(false);
    expect(isProgressBeat({ action: "chart-draw" })).toBe(true);
    expect(isProgressBeat({ action: "requests-flow" })).toBe(false);
    expect(isProgressBeat({ action: "x", kind: "count" })).toBe(true);
  });
  it("формы слов — по префиксу (s3afix-rereview m5): drawing/redraw/flowing/streaming — длящиеся, counting/counts/countdown — счёт, counter — нет", () => {
    for (const a of ["line-drawing", "redraw", "pulses-flowing", "streaming", "bg-looping", "runs", "edges-drawn", "flows"]) expect(beatKind({ action: a }), a).toBe("sustain");
    for (const a of ["hits-counting", "counts", "countdown", "count-down", "countup"]) expect(beatKind({ action: a }), a).toBe("count");
    for (const a of ["counter", "counter-glow", "encounter", "rerun-label", "overflow-note", "drawer"]) expect(beatKind({ action: a }), a).toBeUndefined();
    expect(isProgressBeat({ action: "line-drawing" })).toBe(true);
    expect(isProgressBeat({ action: "pulses-flowing" })).toBe(false);
  });
  it("акцент с входом (verdict-emphasis-in) — акцент и для beatKind, и для isAccentBeat", () => {
    for (const a of ["verdict-emphasis-in", "accent-in", "final-emphasis", "hold-emphasis"]) {
      expect(beatKind({ action: a }), a).toBe("accent");
      expect(isAccentBeat({ action: a }), a).toBe(true);
    }
    for (const a of ["verdict-in", "hold", "chart-draw"]) expect(isAccentBeat({ action: a }), a).toBe(beatKind({ action: a }) === "accent");
  });
  it("phasesOf: threshold-in — вход (setup), а не hold", () => {
    const s = MotionSpecSchema.parse({ ...baseSpec(), beats: [
      { id: "a", start_frame: 0, end_frame: 20, action: "threshold-in", description: "", element_ids: ["title"] },
      { id: "b", start_frame: 20, end_frame: 180, action: "hold", description: "", element_ids: ["title", "chart"] },
    ] });
    expect(phasesOf(s).map((x) => x.role)).toEqual(["setup", "hold"]);
  });
});

describe("правила структуры Concept (S3a-fix)", () => {
  it("шесть правил по порядку, каждое — своя структура", () => {
    expect(STRUCTURE_RULES.map(([r]) => r)).toEqual(["result-first", "two-sides", "request-answer", "one-number", "always-on", "assembly"]);
    expect(new Set(STRUCTURE_RULES.map(([, s]) => s)).size).toBe(6);
    expect(structureOfRule("two-sides")).toBe("split-reveal");
    expect(structureOfRule("assembly")).toBe("build-strike");
  });
});
