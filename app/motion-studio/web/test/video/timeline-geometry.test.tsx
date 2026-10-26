// Task 45: геометрия таймлайна — кадр ↔ пиксель обратимы на целых кадрах для любых масштаба и
// прокрутки; «весь ролик», шаг линейки.
import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, fitZoom, frameToX, rulerStep, xToFrame } from "../../src/timeline/geometry.js";

describe("frameToX / xToFrame", () => {
  it.each([0.5, 1, 4.25])("обратимы на кадре 437 при масштабе %s (с прокруткой и без)", (z) => {
    for (const s of [0, 120, 3333.5]) expect(xToFrame(frameToX(437, z, s), z, s)).toBe(437);
  });

  it("обратимы на всех кадрах 0…2000 при дробном масштабе", () => {
    for (let f = 0; f <= 2000; f++) expect(xToFrame(frameToX(f, 0.37, 55), 0.37, 55)).toBe(f);
  });

  it("пиксель между кадрами — ближайший кадр", () => {
    expect(xToFrame(10 * 4 + 1.9, 4)).toBe(10);
    expect(xToFrame(10 * 4 + 2.1, 4)).toBe(11);
  });
});

describe("fitZoom и rulerStep", () => {
  it("весь ролик в ширину, в пределах масштабов", () => {
    expect(fitZoom(900, 900)).toBe(1);
    expect(fitZoom(10, 1_000_000)).toBe(MIN_ZOOM);
    expect(fitZoom(10_000, 10)).toBe(MAX_ZOOM);
    expect(fitZoom(0, 100)).toBe(1);
  });

  it("шаг линейки не уже 80 px: 1 px/кадр при 30 к/с — 150 кадров (5 с)", () => {
    expect(rulerStep(1, 30)).toBe(150);
    expect(rulerStep(16, 30)).toBe(5);
  });
});
