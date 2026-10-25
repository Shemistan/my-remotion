import { describe, expect, it } from "vitest";
import { ScenePropsBaseSchema, isContentFrameKey, scaleContentFrames, scaleTiming, unscaledTimeKeys } from "../src/index.js";

const b = (start_frame: number, end_frame: number) => ({ start_frame, end_frame });

function props(style: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    timing: { duration_frames: 180, beats: [{ id: "b1", start_frame: 0, end_frame: 60 }, { id: "b2", start_frame: 60, end_frame: 180 }] },
    style: { preset: "dark-premium", intensity: "balanced", depth: 2, transparent: false, ...style },
    content: { title: "Рост" },
  };
}
const propsWith = (style: Record<string, unknown>) => props(style);

describe("scaleTiming", () => {
  it("медленнее на 25 %: 180 → 240, границы × 4/3", () => {
    expect(scaleTiming({ duration_frames: 180, beats: [b(0, 30), b(30, 120), b(120, 180)] }, 1 / 0.75))
      .toMatchObject({ duration_frames: 240, beats: [b(0, 40), b(40, 160), b(160, 240)] });
  });
  it("последний бит кончается ровно на новой длительности", () => {
    expect(scaleTiming({ duration_frames: 162, beats: [b(0, 25), b(20, 125), b(125, 162)] }, 2).beats[2]!.end_frame).toBe(324);
    const t = scaleTiming({ duration_frames: 101, beats: [b(0, 33), b(33, 101)] }, 1 / 3);
    expect(t.duration_frames).toBe(34);
    expect(t.beats[1]!.end_frame).toBe(34);
  });
  it("сохраняет прочие поля битов и не меняет вход", () => {
    const input = { duration_frames: 100, beats: [{ id: "x", start_frame: 0, end_frame: 100 }] };
    const out = scaleTiming(input, 0.5);
    expect(out).toEqual({ duration_frames: 50, beats: [{ id: "x", start_frame: 0, end_frame: 50 }] });
    expect(input.beats[0]!.end_frame).toBe(100);
  });
  it("бит не схлопывается в ноль кадров", () => {
    const t = scaleTiming({ duration_frames: 100, beats: [b(0, 1), b(1, 100)] }, 0.3);
    for (const x of t.beats) expect(x.end_frame).toBeGreaterThan(x.start_frame);
  });
  it("коэффициент должен быть положительным конечным", () => {
    expect(() => scaleTiming({ duration_frames: 10, beats: [] }, 0)).toThrow();
    expect(() => scaleTiming({ duration_frames: 10, beats: [] }, Number.NaN)).toThrow();
  });
});

describe("ScenePropsBase", () => {
  it("depth по умолчанию 1", () => {
    const p = props();
    delete (p.style as Record<string, unknown>).depth;
    expect(ScenePropsBaseSchema.parse(p).style.depth).toBe(1);
  });
  it("палитра — PaletteOverrides: accent0 отвергается, accent[] принимается", () => {
    expect(ScenePropsBaseSchema.safeParse(propsWith({ palette_overrides: { accent0: "#9B5CFF" } })).success).toBe(false);
    expect(ScenePropsBaseSchema.safeParse(propsWith({ palette_overrides: { accent: ["#9B5CFF"] } })).success).toBe(true);
  });
  it("intensity и depth из словаря", () => {
    expect(ScenePropsBaseSchema.safeParse(propsWith({ intensity: "wild" })).success).toBe(false);
    expect(ScenePropsBaseSchema.safeParse(propsWith({ depth: 4 })).success).toBe(false);
  });
  it("бит за пределами duration_frames отвергается", () => {
    const p = props();
    (p.timing as { beats: unknown[] }).beats.push({ id: "b3", start_frame: 170, end_frame: 200 });
    expect(ScenePropsBaseSchema.safeParse(p).success).toBe(false);
  });
  it("safe_area и font из настроек сцены — необязательны и проверяются", () => {
    expect(ScenePropsBaseSchema.parse(propsWith({ safe_area: { x: 0.1, y: 0.1 }, font: "Inter" })).style).toMatchObject({ safe_area: { x: 0.1, y: 0.1 }, font: "Inter" });
    expect(ScenePropsBaseSchema.safeParse(propsWith({ safe_area: { x: 0.5, y: 0.1 } })).success).toBe(false);
    expect(ScenePropsBaseSchema.safeParse(propsWith({ safe_area: { x: 0.1 } })).success).toBe(false);
    expect(ScenePropsBaseSchema.safeParse(propsWith({ font: "" })).success).toBe(false);
  });
});

describe("scaleContentFrames (кадровые величины props.content)", () => {
  it("ключи-кадры по договору: travel, delay, stagger, hold, frame и суффиксы _frames/_frame/Frames/Frame", () => {
    for (const k of ["travel", "delay", "stagger", "hold", "frame", "fan_stagger_frames", "enter_frames", "staggerFrames", "start_frame", "atFrame"]) expect(isContentFrameKey(k), k).toBe(true);
    for (const k of ["stagger_index", "size", "count", "x", "frames_total_label", "framework", "accentIndex", "ms"]) expect(isContentFrameKey(k), k).toBe(false);
  });

  it("× 4/3: flows[].travel, fan_stagger_frames, ключи камеры; индексы, раскладка и строки — как были; вход не меняется", () => {
    const content = {
      fan_stagger_frames: 4,
      flows: [{ edge: "e1", travel: 18, stagger_index: 2, size: 10 }, { edge: "e2", travel: 14 }],
      nodes: [{ id: "n1", layout: { x: 0.3, y: 0.2, w: 0.2, h: 0.1 }, delay: 0 }],
      camera: [{ frame: 150, scale: 1.1 }],
      hold: "steady-flow",
      pulse: { delay: 3, stagger_frames: [2, 4] },
    };
    const r = scaleContentFrames(content, 1 / 0.75);
    expect(r.content).toEqual({
      fan_stagger_frames: 5,
      flows: [{ edge: "e1", travel: 24, stagger_index: 2, size: 10 }, { edge: "e2", travel: 19 }],
      nodes: [{ id: "n1", layout: { x: 0.3, y: 0.2, w: 0.2, h: 0.1 }, delay: 0 }],
      camera: [{ frame: 200, scale: 1.1 }],
      hold: "steady-flow",
      pulse: { delay: 4, stagger_frames: [3, 5] },
    });
    expect(r.scaled).toEqual(expect.arrayContaining(["content.fan_stagger_frames", "content.flows[0].travel", "content.camera[0].frame", "content.pulse.stagger_frames[1]"]));
    expect(content.flows[0]!.travel).toBe(18);
  });

  it("длительность > 0 не схлопывается в 0; дробные — без округления", () => {
    expect(scaleContentFrames({ travel: 1, delay: 0.5 }, 0.25).content).toEqual({ travel: 1, delay: 0.125 });
  });

  it("кадровые пропы kit под тем же именем (M-R2): enterAt, until, at, duration, frames, keyframes, flash, writes и суффикс At", () => {
    for (const k of ["enterAt", "until", "at", "duration", "frames", "keyframes", "flash", "writes", "exitAt", "leaveAt"]) expect(isContentFrameKey(k), k).toBe(true);
    // не время: индексы, счётчики, координаты, «формат»
    for (const k of ["cells", "filled", "count", "format", "data", "accentIndex", "pop"]) expect(isContentFrameKey(k), k).toBe(false);
  });

  it("× 4/3: хореография kit масштабируется вместе с битами — enterAt узла, until токена, at статусов, flash/writes узла (числа, не объекты прихода)", () => {
    const content = {
      nodes: [{ id: "n1", enterAt: 20, flash: [30, { edge: "e1", beat: "b2" }], writes: [60, 90] }],
      tokens: [{ edge: "e1", until: 150 }],
      status: { states: [{ text: "ждёт", at: 0 }, { text: "готово", at: 120 }] },
      enter: { duration: 12 },
      pulse: { frames: [10, 40] },
    };
    expect(scaleContentFrames(content, 4 / 3).content).toEqual({
      nodes: [{ id: "n1", enterAt: 27, flash: [40, { edge: "e1", beat: "b2" }], writes: [80, 120] }],
      tokens: [{ edge: "e1", until: 200 }],
      status: { states: [{ text: "ждёт", at: 0 }, { text: "готово", at: 160 }] },
      enter: { duration: 16 },
      pulse: { frames: [13, 53] },
    });
  });

  it("unscaledTimeKeys: числа под временными именами вне договора — пути (для предупреждения при смене темпа)", () => {
    const content = { start: 10, nodes: [{ id: "n", lead: 4, end: 90, enterAt: 5, x: 3 }], phase: { step: 6, leave: 100, label: "start" }, ms: 120 };
    expect(unscaledTimeKeys(content).sort()).toEqual(["content.nodes[0].end", "content.nodes[0].lead", "content.phase.leave", "content.phase.step", "content.start"]);
    expect(unscaledTimeKeys({ travel: 18, layout: { x: 0.1 } })).toEqual([]);
  });
});
