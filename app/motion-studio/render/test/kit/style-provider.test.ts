import { describe, expect, it } from "vitest";
import { styleSafeRect } from "../../src/motion-kit/choreo/safe-area.js";
import { toResolved } from "../../src/motion-kit/style.js";

describe("StyleProvider: источник стиля", () => {
  it("props.style с safe_area из настроек 0.1 → поля 0.1 кадра у useSafeArea", () => {
    const s = toResolved({ preset: "dark-premium", intensity: "balanced", depth: 1, transparent: false, safe_area: { x: 0.1, y: 0.1 } }, 30);
    expect(styleSafeRect(s, 1920, 1080)).toEqual({ x: 192, y: 108, w: 1536, h: 864 });
    // без поля — поля пресета
    const d = toResolved({ preset: "dark-premium", intensity: "balanced" }, 30);
    expect(styleSafeRect(d, 1920, 1080)).toEqual({ x: 115, y: 86, w: 1690, h: 908 });
  });

  it("font из props.style доходит до типографики; fps композиции — до fpsScale", () => {
    const s = toResolved({ preset: "tech-neon", intensity: "calm", font: "Manrope" }, 60);
    expect(s.typography.display.family).toBe("Manrope");
    expect(s.fpsScale).toBe(2);
  });

  it("неизвестный id пресета — ошибка, а не тихая подмена", () => {
    expect(() => toResolved("neon-dream" as never, 30)).toThrow(/neon-dream/);
    expect(() => toResolved({ preset: "neon-dream" as never, intensity: "balanced" }, 30)).toThrow(/neon-dream/);
  });
});
