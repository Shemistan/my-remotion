// Task 43: оценка места под финал — до рендера, нехватка → `failed(low_space)`.
import { expect, it } from "vitest";
import { checkImportSpace, editedAudioBytes, estimateFinalBytes, estimateMasterBytes } from "../../src/media/space.js";

it("estimateFinalBytes: w·h·кадры·k(q)/8 + 1 ГБ запаса, k = 0,12 / 0,08 / 0,05", () => {
  expect(estimateFinalBytes({ frames: 3600, width: 1920, height: 1080, quality: "standard" })).toBe(Math.round(1920 * 1080 * 3600 * 0.08 / 8) + 1_000_000_000);
  expect(estimateFinalBytes({ frames: 3600, width: 1920, height: 1080, quality: "high" })).toBe(Math.round(1920 * 1080 * 3600 * 0.12 / 8) + 1_000_000_000);
  expect(estimateFinalBytes({ frames: 3600, width: 1920, height: 1080, quality: "draft" })).toBe(Math.round(1920 * 1080 * 3600 * 0.05 / 8) + 1_000_000_000);
});

it("master (CRF 12) — 0,5 бита на пиксель кадра; WAV 48 кГц s24 — 3 байта на сэмпл канала", () => {
  expect(estimateMasterBytes({ frames: 300, width: 1280, height: 720 })).toBe(Math.round(1280 * 720 * 300 * 0.5 / 8));
  expect(editedAudioBytes({ durationUs: 10_000_000, channels: 2 })).toBe(480_000 * 3 * 2 + 44);
});

it("checkImportSpace: оценка + порог StorageGuard", () => {
  expect(checkImportSpace(100, 300, 200)).toEqual({ ok: true });
  expect(checkImportSpace(101, 300, 200)).toEqual({ ok: false, code: "low_space", needBytes: 301 });
});
