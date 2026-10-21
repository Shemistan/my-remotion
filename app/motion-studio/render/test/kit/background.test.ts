// Background: раскладка световых пятен по seed и фокусу, атмосфера с первого кадра.
import { describe, expect, it } from "vitest";
import { backgroundLayout, backgroundReveal } from "../../src/motion-kit/components/Background.js";

const key = (seed: string) => JSON.stringify(backgroundLayout(seed).map((b) => [b.x.toFixed(2), b.y.toFixed(2), b.accent]));

describe("backgroundLayout", () => {
  it("детерминирован: один seed — одна раскладка", () => {
    expect(backgroundLayout("scene-a")).toEqual(backgroundLayout("scene-a"));
  });

  it("разные seed — разные раскладки и порядок оттенков (не одно пятно слева сверху)", () => {
    const seeds = ["test1", "test2", "gen-compare", "gen-timeline", "gen-cache"];
    expect(new Set(seeds.map(key)).size).toBe(seeds.length);
    // самое яркое пятно стоит в разных четвертях кадра хотя бы у трёх сцен
    const quad = (s: string) => {
      const b = backgroundLayout(s)[0]!;
      return `${b.x < 0.5 ? "L" : "R"}${b.y < 0.5 ? "T" : "B"}`;
    };
    expect(new Set(seeds.map(quad)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(seeds.map((s) => backgroundLayout(s)[0]!.accent)).size).toBeGreaterThanOrEqual(2);
  });

  it("focus: самое яркое пятно — за героем", () => {
    const b = backgroundLayout("x", { x: 0.7, y: 0.6 });
    expect(b[0]!.x).toBeCloseTo(0.7, 5);
    expect(b[0]!.y).toBeCloseTo(0.6, 5);
    expect(b[0]!.alpha).toBeGreaterThan(b[1]!.alpha);
    expect(b[0]!.alpha).toBeGreaterThan(b[2]!.alpha);
  });

  it("пятна в кадре (с запасом): центры в 0..1", () => {
    for (const s of ["a", "b", "c", "d", "e", "f"]) {
      for (const b of backgroundLayout(s)) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(1);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("backgroundReveal: первый кадр не чёрный", () => {
  it("в начале бита атмосфера уже видна (≥ 0.7: на 0.4 первые кадры читались чёрными, Fix F), к концу — 1", () => {
    const beat = { start_frame: 0, end_frame: 40 };
    expect(backgroundReveal(0, beat)).toBeGreaterThanOrEqual(0.7);
    expect(backgroundReveal(40, beat)).toBe(1);
    expect(backgroundReveal(10, undefined)).toBe(1);
  });
});
