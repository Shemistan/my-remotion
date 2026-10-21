// niceTicks: «круглые» деления оси (шаг 1/2/5 × 10^k), покрывающие диапазон.
import { describe, expect, it } from "vitest";
import { niceTicks } from "../../src/motion-kit/ticks.js";

describe("niceTicks", () => {
  it("шаг 1/2/5 × 10^k, деления покрывают [min, max]", () => {
    expect(niceTicks(0, 1_000_000, 5)).toEqual([0, 200_000, 400_000, 600_000, 800_000, 1_000_000]);
    expect(niceTicks(0, 7, 4)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0, 87, 4)).toEqual([0, 20, 40, 60, 80, 100]);
  });
  it("дробные и отрицательные диапазоны — без хвостов плавающей точки", () => {
    expect(niceTicks(0, 0.7, 4)).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
    expect(niceTicks(-30, 45, 3)).toEqual([-40, -20, 0, 20, 40, 60]);
  });
  it("пустой диапазон — одно деление", () => {
    expect(niceTicks(5, 5, 4)).toEqual([5]);
  });
  it("тот же niceTicks доступен из geometry (совместимость v0.1)", async () => {
    const g = await import("../../src/motion-kit/geometry.js");
    expect(g.niceTicks).toBe(niceTicks);
  });
});
