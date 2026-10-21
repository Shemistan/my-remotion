import { describe, expect, it } from "vitest";
import { presets } from "../../src/motion-kit/presets.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";
import { typeSize } from "../../src/motion-kit/style/type-scale.js";

const st = resolveStyle({ preset: "dark-premium", intensity: "balanced" });

describe("typeSize: доли высоты кадра", () => {
  it("1080: body 45, display 119 (бриф)", () => {
    expect(typeSize(st, "body", 1080)).toBe(45);
    expect(typeSize(st, "display", 1080)).toBe(119);
  });

  it("уровни убывают, кегль растёт с высотой кадра", () => {
    const levels = ["display", "h1", "h2", "body", "caption"] as const;
    const px = levels.map((l) => typeSize(st, l, 1080));
    expect(px).toEqual([119, 81, 59, 45, 32]);
    expect(typeSize(st, "h1", 1920)).toBe(Math.round(1920 * 0.075));
    expect(typeSize(st, "caption", 720)).toBe(Math.round(720 * 0.03));
  });

  it("старая форма typeSize(style, шаг) — шаг шкалы StyleBible (совместимость v0.1)", () => {
    const s = presets["dark-premium"];
    expect(typeSize(s, 5)).toBe(s.typography.scale[5]);
    expect(typeSize(s, 99)).toBe(s.typography.scale.at(-1));
  });
});
