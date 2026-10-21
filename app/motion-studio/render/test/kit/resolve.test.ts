import { PaletteOverridesSchema, type StyleBible } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { presets } from "../../src/motion-kit/presets.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

const base = presets["dark-premium"].motion;

describe("resolveStyle", () => {
  it("интенсивность: calm — кадры × 1.25, energetic — амплитуда 1.35 (бриф)", () => {
    expect(resolveStyle({ preset: "dark-premium", intensity: "calm" }).motion.enter_frames).toBe(Math.round(base.enter_frames * 1.25));
    expect(resolveStyle({ preset: "dark-premium", intensity: "energetic" }).amplitude).toBe(1.35);
    const bal = resolveStyle({ preset: "dark-premium", intensity: "balanced" });
    expect(bal.amplitude).toBe(1);
    expect(bal.motion.enter_frames).toBe(base.enter_frames);
    const calm = resolveStyle({ preset: "dark-premium", intensity: "calm" });
    expect(calm.amplitude).toBe(0.6);
    expect(calm.motion.exit_frames).toBe(Math.round(base.exit_frames * 1.25));
    expect(calm.motion.stagger_frames).toBe(Math.round(base.stagger_frames * 1.25));
    const en = resolveStyle({ preset: "dark-premium", intensity: "energetic" });
    expect(en.motion.enter_frames).toBe(Math.round(base.enter_frames * 0.75));
    // интенсивность сцены записывается в стиль: от неё зависят пружины
    expect(en.motion.intensity).toBe("energetic");
  });

  it("кадры входа и выхода не обнуляются округлением (поправка после ревью среза)", () => {
    const tinyEnterPreset: StyleBible = {
      ...presets["tech-neon"],
      motion: { ...presets["tech-neon"].motion, enter_frames: 0, exit_frames: 0, stagger_frames: 0 },
    };
    const r = resolveStyle({ preset: tinyEnterPreset, intensity: "energetic" });
    expect(r.motion.enter_frames).toBeGreaterThanOrEqual(1);
    expect(r.motion.exit_frames).toBeGreaterThanOrEqual(1);
    expect(r.motion.stagger_frames).toBe(0);
    const one: StyleBible = { ...presets["tech-neon"], motion: { ...presets["tech-neon"].motion, enter_frames: 1 } };
    // 1 × 0.75 × 24/30 = 0.6 → 1, а не 0
    expect(resolveStyle({ preset: one, intensity: "energetic", fps: { num: 24, den: 1 } }).motion.enter_frames).toBe(1);
  });

  it("палитра: accent[i] заменяет palette.accent[i], прочие акценты остаются (H3)", () => {
    const r = resolveStyle({ preset: "dark-premium", intensity: "balanced", palette_overrides: { accent: ["#9B5CFF"] } });
    expect(r.palette.accent[0]).toBe("#9B5CFF");
    expect(r.palette.accent.slice(1)).toEqual(presets["dark-premium"].palette.accent.slice(1));
    const bg = resolveStyle({ preset: "light-clean", intensity: "balanced", palette_overrides: { bg: "#ffffff", text: "#000000" } });
    expect(bg.palette.bg).toBe("#ffffff");
    expect(bg.palette.text).toBe("#000000");
    // пресет не мутируется
    expect(presets["dark-premium"].palette.accent[0]).toBe("#8b7cff");
  });

  it("неизвестный ключ палитры — ошибка с его именем", () => {
    expect(() => resolveStyle({ preset: "dark-premium", intensity: "balanced", palette_overrides: { nope: "#000" } as never })).toThrow(/nope/);
  });

  it("проверка палитры совпадает с PaletteOverridesSchema контракта", () => {
    const cases: unknown[] = [
      {}, { accent: ["#fff"] }, { bg: "#000", accent: ["#1", "#2"] }, { accent: [] }, { accent: "#fff" },
      { accent: [1] }, { bg: 5 }, { primary: "#fff" }, { accent0: "#fff" }, { text: "#fff", muted: "#aaa", surface: "#111", positive: "#0f0", negative: "#f00" },
    ];
    for (const c of cases) {
      const contract = PaletteOverridesSchema.safeParse(c).success;
      let kit = true;
      try {
        resolveStyle({ preset: "dark-premium", intensity: "balanced", palette_overrides: c as never });
      } catch {
        kit = false;
      }
      expect(kit, JSON.stringify(c)).toBe(contract);
    }
  });

  it("fps: кадровые токены пересчитываются от базы 30 fps (M11)", () => {
    expect(resolveStyle({ preset: "dark-premium", intensity: "balanced", fps: { num: 60, den: 1 } }).motion.enter_frames).toBe(Math.round(base.enter_frames * 2));
    const ntsc = resolveStyle({ preset: "dark-premium", intensity: "calm", fps: { num: 30000, den: 1001 } });
    expect(ntsc.motion.enter_frames).toBe(Math.round(base.enter_frames * (30000 / 1001 / 30) * 1.25));
  });

  it("depth, transparent, safe_area и font", () => {
    const d = resolveStyle({ preset: "dark-premium", intensity: "balanced" });
    expect(d.depth).toBe(1);
    expect(d.transparent).toBe(false);
    const r = resolveStyle({ preset: "dark-premium", intensity: "balanced", depth: 3, transparent: true, safe_area: { x: 0.05, y: 0.04 }, font: "Inter" });
    expect(r.depth).toBe(3);
    expect(r.transparent).toBe(true);
    expect(r.grid.safe_area).toEqual({ x: 0.05, y: 0.04 });
    expect(r.typography.display.family).toBe("Inter");
    expect(r.typography.body.family).toBe("Inter");
    // у Inter нет 800 — ближайшее загруженное начертание
    expect(r.typography.display.weight).toBe(700);
    expect(r.typography.mono).toEqual(presets["dark-premium"].typography.mono);
    expect(() => resolveStyle({ preset: "dark-premium", intensity: "balanced", font: "Comic Sans" })).toThrow(/Comic Sans/);
  });
});
