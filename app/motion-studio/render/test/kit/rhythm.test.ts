import { describe, expect, it } from "vitest";
import { edgeDelay, kineticStep, typeRhythm } from "../../src/motion-kit/choreo/rhythm.js";
import { frames } from "../../src/motion-kit/easing.js";
import { presets } from "../../src/motion-kit/presets.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

const at = (num: number) => resolveStyle({ preset: "dark-premium", intensity: "balanced", fps: { num, den: 1 } });
const s30 = at(30);
const s60 = at(60);

describe("ритм компонентов под fps", () => {
  it("frames(): константы при 30 fps → вдвое больше кадров на 60 fps; сырой StyleBible — как есть", () => {
    expect(s60.fpsScale).toBe(2);
    expect(frames(s30, 10)).toBe(10);
    expect(frames(s60, 10)).toBe(20);
    expect(frames(presets["dark-premium"], 10)).toBe(10);
  });

  it("FlowGraph: задержка ребра 6 → 12 кадров", () => {
    expect(edgeDelay(s30)).toBe(6);
    expect(edgeDelay(s60)).toBe(12);
  });

  it("KineticText: шаг частей и набор — та же длительность в секундах", () => {
    const words = { mode: "words" as const, units: 3, len: 600 };
    expect(kineticStep(s60, words)).toBe(2 * kineticStep(s30, words));
    expect(kineticStep(s60, { ...words, stagger: 5 })).toBe(10);
    const t30 = typeRhythm(s30, { chars: 10, len: 600 });
    const t60 = typeRhythm(s60, { chars: 10, len: 600 });
    expect(t60.perChar).toBe(2 * t30.perChar);
    // каретка мигает с тем же периодом в секундах
    expect(t30.blink).toBe(8);
    expect(t60.blink).toBe(16);
  });
});
