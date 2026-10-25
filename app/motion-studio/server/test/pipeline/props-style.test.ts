// Стиль сцены для props.json: настройки (safe_area, font, интенсивность…) доходят до
// контракта props, который пишет Engineer, и до промпта Engineer.
import { ScenePropsStyleSchema, defaultSettings } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { checkProps } from "../../src/pipeline/fix-loop.js";
import { scenePropsStyle } from "../../src/pipeline/generate.js";

const settings = { ...defaultSettings(), safe_area: { x: 0.1, y: 0.1 }, font: "Manrope", animation_intensity: "calm" as const, transparent_export: true };

describe("scenePropsStyle", () => {
  it("переносит пресет, интенсивность, прозрачность, safe_area и font; проходит контракт", () => {
    const st = scenePropsStyle(settings);
    expect(st).toEqual({ preset: "dark-premium", intensity: "calm", depth: 1, transparent: true, safe_area: { x: 0.1, y: 0.1 }, font: "Manrope" });
    expect(ScenePropsStyleSchema.parse(st)).toEqual(st);
  });

  it("шрифт не из motion-kit не попадает в props (сцена упала бы на рендере)", () => {
    expect(scenePropsStyle({ ...settings, font: "Comic Sans" }).font).toBeUndefined();
    expect(scenePropsStyle(defaultSettings()).font).toBeUndefined();
  });

  it("пайплайн перезаписывает props.style из настроек, palette_overrides и depth сцены сохраняются (Task 14 → 17)", () => {
    const spec = { duration_frames: 180, beats: [{ id: "b1", start_frame: 0, end_frame: 180 }] } as never;
    const engineer = { timing: { duration_frames: 180, beats: [{ id: "b1", start_frame: 0, end_frame: 180 }] }, style: { preset: "tech-neon", intensity: "energetic", depth: 3, transparent: false, palette_overrides: { accent: ["#a855f7"] }, safe_area: { x: 0, y: 0 } }, content: {} };
    const r = checkProps(JSON.stringify(engineer), spec, { ...settings, duration_frames: 180 });
    expect(r.issues).toEqual([]);
    expect(r.props!.style).toEqual({ ...scenePropsStyle({ ...settings, duration_frames: 180 }), depth: 3, palette_overrides: { accent: ["#a855f7"] } });
    expect(JSON.parse(r.text!).style.safe_area).toEqual({ x: 0.1, y: 0.1 });
  });
});

describe("startPropsStyle", () => {
  it("палитра агента поверх настроек, style_lock — последним (generate, playground generate/edit)", async () => {
    const { startPropsStyle } = await import("../../src/pipeline/steps.js");
    const agent = { bg: "#ffffff", accent: ["#a855f7"] };
    expect(startPropsStyle(settings, agent)).toEqual({ ...scenePropsStyle(settings), palette_overrides: agent });
    expect(startPropsStyle(settings, undefined)).toEqual(scenePropsStyle(settings));
    const lock = { palette_overrides: { bg: "#101418", accent: ["#22c55e"] }, depth: 2 as const, font: "Inter" as const };
    expect(startPropsStyle({ ...settings, style_lock: lock }, agent)).toMatchObject({ palette_overrides: lock.palette_overrides, depth: 2, font: "Inter" });
  });
});

describe("withSceneSeed", () => {
  it("seed фона — id сцены; вариант и фокус Director сохраняются; без composition — как есть", async () => {
    const { withSceneSeed } = await import("../../src/pipeline/steps.js");
    const base = { title: "t", purpose: "p", duration_frames: 90, fps: { num: 30, den: 1 }, style_preset: "dark-premium" as const, elements: [{ id: "a", kind: "text" as const, role: "r", entrance: "rise" as const, content: {} }], beats: [{ id: "b", start_frame: 0, end_frame: 90, action: "hold", description: "", element_ids: ["a"] }] };
    const composition = { archetype: "split" as const, idea: "i", focus: "f", transitions: "t", background: { variant: "blueprint" as const, focus: { x: 0.6, y: 0.4 }, seed: "director" } };
    expect(withSceneSeed({ ...base, composition }, "scn_1").composition?.background).toEqual({ variant: "blueprint", focus: { x: 0.6, y: 0.4 }, seed: "scn_1" });
    expect(withSceneSeed(base, "scn_1")).toEqual(base);
  });

  it("сценарий: settings.style_lock (стиль проекта) важнее палитры, глубины и шрифта сцены", () => {
    const lock = { palette_overrides: { bg: "#101418", accent: ["#22c55e"] }, depth: 2 as const, font: "Inter" as const };
    const locked = { ...settings, duration_frames: 180, style_lock: lock };
    expect(scenePropsStyle(locked)).toMatchObject({ palette_overrides: lock.palette_overrides, depth: 2, font: "Inter" });
    const spec = { duration_frames: 180, beats: [{ id: "b1", start_frame: 0, end_frame: 180 }], palette_overrides: { bg: "#ffffff" } } as never;
    const engineer = { timing: { duration_frames: 180, beats: [{ id: "b1", start_frame: 0, end_frame: 180 }] }, style: { preset: "dark-premium", intensity: "calm", depth: 3, transparent: true, palette_overrides: { accent: ["#a855f7"] }, safe_area: { x: 0, y: 0 } }, content: {} };
    const r = checkProps(JSON.stringify(engineer), spec, locked);
    expect(r.issues).toEqual([]);
    expect(r.props!.style).toMatchObject({ palette_overrides: lock.palette_overrides, depth: 2, font: "Inter" });
  });
});
