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
    ["размер не соответствует aspect_ratio", { width: 1920, height: 1920 }],
    ["safe_area.x >= 0.5", { safe_area: { x: 0.5, y: 0.05 } }],
    ["safe_area.y >= 0.5", { safe_area: { x: 0.05, y: 0.6 } }],
  ];
  it.each(bad)("отвергает: %s", (_n, patch) => {
    expect(SettingsSchema.safeParse({ ...defaultSettings(), ...patch }).success).toBe(false);
  });
  it("aspect_ratio 9:16 и 1:1 проходят с подходящим размером", () => {
    expect(SettingsSchema.safeParse({ ...defaultSettings(), aspect_ratio: "9:16", width: 1080, height: 1920 }).success).toBe(true);
    expect(SettingsSchema.safeParse({ ...defaultSettings(), aspect_ratio: "1:1", width: 1080, height: 1080 }).success).toBe(true);
    expect(SettingsSchema.safeParse({ ...defaultSettings(), width: 1920, height: 1088 }).success).toBe(true);
  });
});

const style = () => ({
  id: "dark-premium", name: "Dark premium",
  palette: { bg: "#0b0d12", surface: "#151922", text: "#f4f6fb", muted: "#8b93a7", accent: ["#6ea8ff", "#b28cff"], positive: "#3ddc97", negative: "#ff5d73" },
  typography: {
    display: { family: "Manrope", weight: 700 }, body: { family: "Inter", weight: 400 }, mono: { family: "JetBrains Mono" },
    scale: [14, 18, 24, 36, 56], tracking: { display: -0.02, body: 0 },
  },
  grid: { columns: 12, gutter: 24, safe_area: { x: 0.05, y: 0.05 } },
  surfaces: { radius: [8, 16], elevation: ["0 8px 24px rgba(0,0,0,.35)"] },
  motion: {
    intensity: "balanced",
    easing: { enter: [0.16, 1, 0.3, 1], exit: [0.7, 0, 0.84, 0], emphasis: [0.34, 1.56, 0.64, 1] },
    spring: { soft: { damping: 20, stiffness: 120, mass: 1 } },
    stagger_frames: 4, enter_frames: 18, exit_frames: 12,
  },
  camera: { allow_zoom: true, max_scale: 1.1, parallax: false },
});

describe("StyleBible", () => {
  it("полный корректный пример проходит", () => {
    expect(StyleBibleSchema.safeParse(style()).success).toBe(true);
  });
  it("отвергает easing с x вне 0..1", () => {
    const s = style();
    s.motion.easing.enter = [1.5, 1, 0.3, 1];
    expect(StyleBibleSchema.safeParse(s).success).toBe(false);
  });
  it("отвергает пустой accent и неположительный mass", () => {
    const a = style(); a.palette.accent = [];
    expect(StyleBibleSchema.safeParse(a).success).toBe(false);
    const b = style(); b.motion.spring.soft!.mass = 0;
    expect(StyleBibleSchema.safeParse(b).success).toBe(false);
  });
  it("отвергает пропущенный раздел", () => {
    const rest: Record<string, unknown> = style();
    delete rest.camera;
    expect(StyleBibleSchema.safeParse(rest).success).toBe(false);
  });
});
