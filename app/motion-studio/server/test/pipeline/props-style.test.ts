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
