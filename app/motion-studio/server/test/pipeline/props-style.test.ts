// Стиль сцены для props.json: настройки (safe_area, font, интенсивность…) доходят до
// контракта props, который пишет Engineer, и до промпта Engineer.
import { ScenePropsStyleSchema, defaultSettings } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { engineerPrompt, scenePropsStyle } from "../../src/pipeline/generate.js";

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

  it("промпт Engineer требует props.style ровно таким и StyleProvider от него", () => {
    const p = engineerPrompt({
      prompt: "x",
      settings,
      spec: {} as never,
      selection: { items: [] } as never,
      refs: [],
      call: 1,
      maxCalls: 3,
    });
    expect(p).toContain(JSON.stringify(scenePropsStyle(settings), null, 2));
    expect(p).toContain("<StyleProvider style={props.style}>");
  });
});
