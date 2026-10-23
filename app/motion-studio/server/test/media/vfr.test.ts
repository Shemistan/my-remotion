import { expect, it } from "vitest";
import { detectVfr } from "../../src/media/vfr.js";

it("CFR: ровные Δ → vfr false", () => {
  expect(detectVfr(Array.from({ length: 300 }, (_, i) => i * 33_333)).vfr).toBe(false);
});
it("неровные Δ → vfr true", () => {
  expect(detectVfr(Array.from({ length: 300 }, (_, i) => i * 33_333 + (i % 2) * 6_000)).vfr).toBe(true);
});
it("pts в порядке декодирования (B-кадры) сортируются; мало кадров — не VFR", () => {
  const pts = [0, 100_000, 33_333, 66_666, 200_000, 133_333, 166_666];
  expect(detectVfr(pts)).toMatchObject({ vfr: false });
  expect(detectVfr(pts).meanDeltaUs).toBeCloseTo(33_333, 0);
  expect(detectVfr([0]).vfr).toBe(false);
  expect(detectVfr([]).vfr).toBe(false);
});
