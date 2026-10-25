// S5 (Р19): spec-проверка `speech_window` для сцен сценария — основное действие в окне речи,
// финальное удержание ≥ tail; без окна проверки нет.
import { type MotionSpec, type PhaseRole, type QAIssue, defaultSettings } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { specChecks } from "../../src/qa/spec-checks.js";

const s237 = { ...defaultSettings(), duration_frames: 237 };
const W = { lead: 15, speech: 192, tail: 30 };
const codes = (issues: QAIssue[]) => issues.map((i) => i.code);
const sw = (issues: QAIssue[]) => issues.filter((i) => i.code === "speech_window");

/** Spec с фазами: окно фазы — её бит (кадры уже расставлены планировщиком). */
function specWithPhases(windows: Partial<Record<PhaseRole, [number, number]>>): MotionSpec {
  const roles = Object.keys(windows) as PhaseRole[];
  return {
    title: "t", purpose: "p", duration_frames: 237, fps: { num: 30, den: 1 }, style_preset: "dark-premium",
    elements: roles.map((r, i) => ({ id: `e${i}`, kind: "text", role: r === "payoff" ? "emphasis" : "label", entrance: (["rise", "scale", "mask", "pop", "blur"] as const)[i]!, content: { text: r }, layout: { x: 0, y: i * 0.18, w: 0.5, h: 0.15 } })),
    phases: roles.map((r, i) => ({ id: `ph_${r}`, role: r, weight: 10, element_ids: [`e${i}`] })),
    beats: roles.map((r, i) => ({ id: `b_${r}`, phase: `ph_${r}`, start_frame: windows[r]![0], end_frame: windows[r]![1], action: r === "hold" ? "hold" : r === "setup" ? "enter" : "show", kind: r === "hold" ? "hold" : r === "setup" ? "enter" : undefined, description: "", element_ids: [`e${i}`] })),
  } as MotionSpec;
}

describe("speech_window", () => {
  it("действие раньше lead — blocking с подсказкой про окно речи", () => {
    const out = sw(specChecks(specWithPhases({ action: [0, 120], hold: [200, 237] }), s237, { speechWindow: W }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: "blocking", area: "ph_action" });
    expect(out[0]!.fix_hint).toContain("основное действие — в окне речи [lead; lead+speech)");
    expect(out[0]!.fix_hint).toContain("[15; 207)");
  });

  it("setup в запасе, действие в окне, удержание ровно tail — без замечания", () => {
    expect(codes(specChecks(specWithPhases({ setup: [0, 15], action: [15, 207], hold: [207, 237] }), s237, { speechWindow: W }))).not.toContain("speech_window");
  });

  it("без окна речи — как раньше", () => {
    expect(codes(specChecks(specWithPhases({ action: [0, 120], hold: [200, 237] }), s237, {}))).not.toContain("speech_window");
  });

  it("turn и payoff тоже не раньше lead", () => {
    const out = sw(specChecks(specWithPhases({ setup: [0, 20], turn: [10, 60], action: [60, 150], payoff: [150, 200], hold: [200, 237] }), s237, { speechWindow: W }));
    expect(out.map((i) => i.area)).toEqual(["ph_turn"]);
  });

  it("удержание короче tail, начинается позже total − tail или его нет — blocking", () => {
    expect(sw(specChecks(specWithPhases({ setup: [0, 15], action: [15, 220], hold: [220, 237] }), s237, { speechWindow: W }))).toHaveLength(1);
    expect(sw(specChecks(specWithPhases({ setup: [0, 15], action: [15, 200], hold: [210, 237] }), s237, { speechWindow: W }))[0]!.description).toMatch(/hold/);
    expect(sw(specChecks(specWithPhases({ setup: [0, 15], action: [15, 237] }), s237, { speechWindow: W }))[0]!.description).toMatch(/нет фазы hold/);
  });

  it("spec без фаз: биты действия до lead — blocking, вход до первого действия (мягкий вход) — можно", () => {
    const base = specWithPhases({ setup: [0, 15], action: [15, 207], hold: [207, 237] });
    const flat = { ...base, phases: undefined, beats: base.beats.map((b) => ({ ...b, phase: undefined })) } as MotionSpec;
    expect(codes(specChecks(flat, s237, { speechWindow: W }))).not.toContain("speech_window");
    const early = { ...flat, beats: flat.beats.map((b) => (b.id === "b_action" ? { ...b, start_frame: 5 } : b)) };
    expect(sw(specChecks(early, s237, { speechWindow: W })).map((i) => i.area)).toEqual(["b_action"]);
  });
});
