import { describe, expect, it } from "vitest";
import { SettingsSchema, StyleBibleSchema, defaultSettings } from "../src/index.js";

describe("настройки", () => {
  it("значения по умолчанию", () => {
    expect(defaultSettings()).toMatchObject({
      aspect_ratio: "16:9", width: 1920, height: 1080,
      fps: { num: 30, den: 1 }, duration_frames: 180,
    });
  });
  it("defaultSettings проходит схему", () => {
    expect(SettingsSchema.safeParse(defaultSettings()).success).toBe(true);
  });
  it("defaultSettings возвращает новый объект", () => {
    const a = defaultSettings();
    a.width = 1;
    expect(defaultSettings().width).toBe(1920);
  });
  const bad: Array<[string, Record<string, unknown>]> = [
    ["aspect_ratio", { aspect_ratio: "4:3" }],
    ["style_preset", { style_preset: "neon" }],
    ["animation_intensity", { animation_intensity: "wild" }],
    ["width 0", { width: 0 }],
    ["width дробный", { width: 100.5 }],
    ["fps den 0", { fps: { num: 30, den: 0 } }],
    ["duration_frames 0", { duration_frames: 0 }],
    ["safe_area вне 0..1", { safe_area: { x: 1.5, y: 0.05 } }],
    ["лишнее поле", { extra: 1 }],
  ];
  it.each(bad)("отвергает: %s", (_n, patch) => {
    expect(SettingsSchema.safeParse({ ...defaultSettings(), ...patch }).success).toBe(false);
  });
  it("StyleBible отвергает неверный easing", () => {
    expect(StyleBibleSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});
