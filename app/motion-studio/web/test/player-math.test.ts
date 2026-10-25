// Время плеера ↔ номер кадра: середина кадра, чтобы <video> после seek показывал ровно этот кадр.
import { expect, it } from "vitest";
import { clampFrame, formatDuration, frameToTime, timeToFrame } from "../src/lib/player-math.js";

it("frameToTime — середина кадра", () => {
  expect(frameToTime(12, { num: 30, den: 1 })).toBeCloseTo(0.41667, 4);
  expect(frameToTime(0, { num: 25, den: 1 })).toBeCloseTo(0.02, 6);
});

it("timeToFrame(frameToTime(f)) === f для дробных и целых fps", () => {
  expect(timeToFrame(frameToTime(179, { num: 30000, den: 1001 }), { num: 30000, den: 1001 })).toBe(179);
  for (const fps of [{ num: 24, den: 1 }, { num: 25, den: 1 }, { num: 30, den: 1 }, { num: 60, den: 1 }, { num: 24000, den: 1001 }]) {
    for (let f = 0; f < 600; f += 7) expect(timeToFrame(frameToTime(f, fps), fps)).toBe(f);
  }
});

it("clampFrame держит кадр в [0, duration − 1]", () => {
  expect(clampFrame(-1, 150)).toBe(0);
  expect(clampFrame(150, 150)).toBe(149);
  expect(clampFrame(10.7, 150)).toBe(10);
});

it("formatDuration — секунды с одной цифрой после запятой", () => {
  expect(formatDuration(150, { num: 30, den: 1 })).toBe("5,0");
  expect(formatDuration(240, { num: 30000, den: 1001 })).toBe("8,0");
});
