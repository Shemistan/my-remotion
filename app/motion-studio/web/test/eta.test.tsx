import { expect, it } from "vitest";
import { etaFrom } from "../src/ui/eta.js";

it("считает оставшееся время по прошедшему времени и прогрессу", () => {
  const started = "2026-10-27T10:00:00.000Z";
  const now = Date.parse("2026-10-27T10:02:00.000Z");
  expect(etaFrom(started, 0.25, now)).toBe(360);
  expect(etaFrom(started, 0.5, now)).toBe(120);
});

it("не обещает ETA без старта, при нулевом прогрессе и после завершения", () => {
  expect(etaFrom(null, 0.5)).toBeNull();
  expect(etaFrom(Date.now(), 0)).toBeNull();
  expect(etaFrom(Date.now(), 1)).toBe(0);
  expect(etaFrom("not-a-date", 0.5)).toBeNull();
});

it("ограничивает скачки оценки и округляет секунды вверх", () => {
  expect(etaFrom(0, 0.999, 1_000)).toBe(1);
  expect(etaFrom(10_000, 0.5, 5_000)).toBeNull();
});

it("считает ETA по последним точкам прогресса и отказывается от неподвижной шкалы", () => {
  expect(etaFrom([{ t: 0, p: 0 }, { t: 10_000, p: 0.1 }, { t: 20_000, p: 0.2 }])).toBe(80_000);
  expect(etaFrom([{ t: 0, p: 0.5 }, { t: 10_000, p: 0.5 }, { t: 20_000, p: 0.5 }])).toBeUndefined();
});
