// Task 44: смещение звука финала по опорным словам на реальном ffmpeg.
import { rm } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTimeline } from "@ms/contracts";
import { measureSync, syncAnchors } from "../../src/final/sync.js";
import { F30, WORDS, fx, prepare } from "./media.js";

let dir: string;
beforeAll(async () => {
  dir = await prepare("ms-final-sync-");
}, 180_000);
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const whole = buildTimeline(10_000_000, [], F30);
const syncAt = (finalPath: string, n: number) => measureSync({
  finalPath, source16k: fx("counter-30-16k.wav"), tl: whole, words: WORDS, anchors: syncAnchors({ scenes: [] }, WORDS, whole, n), workDir: dir,
});

describe("measureSync", () => {
  it("звук на месте — смещение 0 ± 1 мс", async () => {
    const r = await syncAt(fx("counter-30.mp4"), 5);
    expect(r).toHaveLength(5);
    for (const s of r) expect(Math.abs(s.offset_us), s.word_id).toBeLessThanOrEqual(1_000);
  }, 60_000);

  it("delayed-audio: ≈ 66 000 мкс (2 кадра)", async () => {
    const r = await syncAt(fx("delayed-audio.mp4"), 5);
    expect(r).toHaveLength(5);
    expect(Math.abs(r[0]!.offset_us - 66_000)).toBeLessThanOrEqual(1_000);
    for (const s of r) expect(s.corr, s.word_id).toBeGreaterThan(0.5);
  }, 60_000);
});
