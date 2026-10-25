// Task 44: громкость финала против звука на реальном ffmpeg.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { loudnessDelta } from "../../src/final/loudness.js";
import { fx, prepare } from "./media.js";

let dir: string;
beforeAll(async () => {
  dir = await prepare("ms-final-loud-");
}, 180_000);
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("loudnessDelta", () => {
  it("louder: +3 LU, пик выше", async () => {
    const r = await loudnessDelta(fx("louder.mp4"), fx("counter-30.mp4"));
    expect(r.delta_lu).toBeCloseTo(3, 0);
    expect(r.final_peak_db).toBeGreaterThan(r.source_peak_db + 2.5);
  }, 60_000);

  it("final-like против смонтированного звука: в пределах 0,5 LU, пик не выше на 0,1 дБ", async () => {
    const r = await loudnessDelta(fx("final-like.mp4"), fx("final-like-edited.wav"));
    expect(Math.abs(r.delta_lu)).toBeLessThanOrEqual(0.5);
    expect(r.final_peak_db).toBeLessThanOrEqual(r.source_peak_db + 0.1);
  }, 60_000);
});
