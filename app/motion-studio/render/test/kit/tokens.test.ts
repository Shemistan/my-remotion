import { StyleBibleSchema } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { presets } from "../../src/motion-kit/presets.js";
import { alpha, intensityScale, mix, safeAreaPx, shadow, surfaceAt, typeSize } from "../../src/motion-kit/tokens.js";

describe("presets", () => {
  it("три пресета, каждый проходит StyleBibleSchema и id совпадает с ключом", () => {
    expect(Object.keys(presets).sort()).toEqual(["dark-premium", "light-clean", "tech-neon"]);
    for (const [id, s] of Object.entries(presets)) {
      expect(StyleBibleSchema.parse(s)).toEqual(s);
      expect(s.id).toBe(id);
      expect(s.surfaces.elevation).toHaveLength(4);
    }
  });

  it("пресеты различимы: фон, акцент и шрифт заголовков не совпадают попарно", () => {
    const all = Object.values(presets);
    const key = (f: (s: (typeof all)[number]) => string) => new Set(all.map(f)).size;
    expect(key((s) => s.palette.bg)).toBe(3);
    expect(key((s) => s.palette.accent[0]!)).toBe(3);
    expect(key((s) => `${s.typography.display.family}/${s.typography.display.weight}`)).toBe(3);
  });
});

describe("цвет", () => {
  it("alpha: hex → rgba, прочее — color-mix", () => {
    expect(alpha("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
    expect(alpha("#0f0", 1)).toBe("rgba(0, 255, 0, 1)");
    expect(alpha("tomato", 0.25)).toBe("color-mix(in srgb, tomato 25%, transparent)");
  });

  it("mix: линейное смешение hex", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#102030", "#102030", 0.3)).toBe("#102030");
  });
});

describe("токены", () => {
  const s = presets["dark-premium"];

  it("shadow и surfaceAt по elevation 0..3, вне диапазона — зажим", () => {
    expect(shadow(s, 0)).toBe(s.surfaces.elevation[0]);
    expect(shadow(s, 9)).toBe(s.surfaces.elevation[3]);
    // на тёмной теме поверхность светлеет с высотой
    expect(surfaceAt(s, 3)).not.toBe(surfaceAt(s, 0));
  });

  it("typeSize: шаг шкалы с зажимом", () => {
    expect(typeSize(s, 0)).toBe(s.typography.scale[0]);
    expect(typeSize(s, 99)).toBe(s.typography.scale.at(-1));
  });

  it("safeAreaPx: доли кадра → пиксели", () => {
    const r = safeAreaPx(s, 1920, 1080);
    expect(r.left).toBe(Math.round(1920 * s.grid.safe_area.x));
    expect(r.top).toBe(Math.round(1080 * s.grid.safe_area.y));
    expect(r.width).toBe(1920 - 2 * r.left);
    expect(r.height).toBe(1080 - 2 * r.top);
  });

  it("intensityScale: calm медленнее и мягче, energetic быстрее и сильнее", () => {
    const calm = intensityScale("calm");
    const en = intensityScale("energetic");
    expect(intensityScale("balanced")).toEqual({ time: 1, amplitude: 1 });
    expect(calm.time).toBeGreaterThan(1);
    expect(calm.amplitude).toBeLessThan(1);
    expect(en.time).toBeLessThan(1);
    expect(en.amplitude).toBeGreaterThan(1);
  });
});
