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

it("M8: квантование таймбазы (±1 тик) не делает CFR переменным; p10 интервалов", () => {
  // 60 fps в таймбазе 1/1000: Δ = 16/17 мс — CV ≈ 2,8 %, но это округление до тика
  const ms60 = Array.from({ length: 300 }, (_, i) => Math.round((i * 1000) / 60) * 1000);
  expect(detectVfr(ms60).vfr).toBe(true);
  expect(detectVfr(ms60, { tickUs: 1000 }).vfr).toBe(false);
  // настоящий VFR (25 + 30) таймбаза не скрывает
  const mixed = Array.from({ length: 300 }, (_, i) => (i < 150 ? i * 40_000 : 6_000_000 + (i - 150) * 33_333));
  expect(detectVfr(mixed, { tickUs: 1000 / 15 })).toMatchObject({ vfr: true });
  expect(detectVfr(mixed).p10DeltaUs).toBeCloseTo(33_333, 0);
});
