// Чистое расписание импульсов (choreo/pulse-timing.ts): без remotion, побитно как раньше.
import { readFileSync } from "node:fs";
import { Easing } from "remotion";
import { describe, expect, it } from "vitest";
import * as node from "../../src/node/index.js";
import * as pulse from "../../src/motion-kit/choreo/pulse.js";
import { EASE_PASS, cubicBezier, pulsePass } from "../../src/motion-kit/choreo/pulse-timing.js";
import { resolveStyle } from "../../src/motion-kit/style/resolve.js";

describe("pulse-timing", () => {
  it("cubicBezier побитно совпадает с remotion Easing.bezier (пиксели импульсов не меняются)", () => {
    const curves: [number, number, number, number][] = [[0.45, 0.05, 0.4, 1], [0.16, 1, 0.3, 1], [0.65, 0, 0.35, 1], [0, 0, 1, 1], [0.9, 0.1, 0.95, 0.2]];
    for (const c of curves) {
      const [ours, theirs] = [cubicBezier(...c), Easing.bezier(...c)];
      for (let i = -2; i <= 2002; i++) expect(ours(i / 2000)).toBe(theirs(i / 2000));
    }
  });

  it("модуль без remotion и React — его можно звать на сервере", () => {
    const src = readFileSync(new URL("../../src/motion-kit/choreo/pulse-timing.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from "(remotion|react)/);
  });

  it("pulse.ts и node-вход отдают те же функции (один источник)", () => {
    for (const k of ["EASE_PASS", "pulsePass", "pulseStarts", "arrivalInPass", "ARRIVAL_PX", "PULSE_PX_PER_S", "PULSE_MIN_S"] as const) expect(pulse[k]).toBe(node[k]);
    expect(pulse.EASE_PASS).toBe(EASE_PASS);
  });

  it("pulsePass: 420 px/с с интенсивностью и fps стиля, не короче 0.6 с", () => {
    const at = (intensity: "calm" | "balanced" | "energetic", fps = 30) => pulsePass(840, undefined, fps, resolveStyle({ preset: "dark-premium", intensity, fps: { num: fps, den: 1 } }));
    expect([at("calm"), at("balanced"), at("energetic"), at("balanced", 60)]).toEqual([75, 60, 45, 120]);
    expect(pulsePass(10, undefined, 30, resolveStyle({ preset: "dark-premium", intensity: "balanced" }))).toBe(18);
    expect(pulsePass(840, 33, 30, resolveStyle({ preset: "dark-premium", intensity: "balanced" }))).toBe(33);
  });
});
