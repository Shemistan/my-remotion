// Task 43: оценка места под финал — до рендера, нехватка → `failed(low_space)`.
import { expect, it } from "vitest";
import { checkImportSpace, editedAudioBytes, estimateFinalBytes, estimateMasterBytes } from "../../src/media/space.js";
import { masterHeightFor, masterSize } from "../../src/media/master.js";

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

it("Task 49b: master под выход — оценка по размеру ступени: 4K 272 с → 1080p ≈ 1,06 ГБ вместо ≈ 4,2 ГБ", () => {
  const frames = 272 * 30;
  const uhd = { width: 3840, height: 2160 };
  const est = (display: { width: number; height: number }, out: number) => estimateMasterBytes({ frames, ...masterSize(display, masterHeightFor(display, out)) });
  expect(est(uhd, 1080)).toBe(Math.round(1920 * 1080 * frames * 0.5 / 8));
  expect(est(uhd, 1080)).toBeLessThan(1.1e9);
  expect(est(uhd, 2160)).toBe(Math.round(3840 * 2160 * frames * 0.5 / 8));
  // исходник 1080p, выход 1080p — полный master
  expect(est({ width: 1920, height: 1080 }, 1080)).toBe(Math.round(1920 * 1080 * frames * 0.5 / 8));
});
