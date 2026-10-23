import { expect, it } from "vitest";
import { checkImportSpace, estimateImportBytes } from "../../src/media/space.js";

it("оценка места: копия (другой том) + прокси + audio16k + запас", () => {
  expect(estimateImportBytes({ sizeBytes: 1e9, durationUs: 100_000_000, sameVolume: false })).toBe(1_084_450_000);
  expect(estimateImportBytes({ sizeBytes: 1e9, durationUs: 100_000_000, sameVolume: true })).toBe(84_450_000);
});
it("после импорта должно остаться minFree, иначе low_space", () => {
  expect(checkImportSpace(3e9, 12 * 2 ** 30, 10 * 2 ** 30)).toMatchObject({ ok: false, code: "low_space" });
  expect(checkImportSpace(1e9, 12 * 2 ** 30, 10 * 2 ** 30)).toEqual({ ok: true });
  expect(checkImportSpace(3e9, 12 * 2 ** 30, 10 * 2 ** 30)).toMatchObject({ needBytes: 3e9 + 10 * 2 ** 30 });
});
