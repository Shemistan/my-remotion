// Task 43 (fix 1): каналы звука финала по смыслу — моно L≈R, стерео попарно с edited-audio, 5.1 —
// явный даунмикс (без ffmpeg: суждения по PCM).
import { describe, expect, it } from "vitest";
import { FinalVerifyReportSchema } from "@ms/contracts";
import { CHANNELS_RATE, bestLag, checkChannels, correlation, deinterleave, judgeMono, judgeStereo, rmsDb } from "../../src/final/channels.js";

/** Шум с закреплённым seed (LCG), `n` сэмплов, амплитуда `a`. */
function noise(n: number, seed: number, a = 0.3): Float32Array {
  const x = new Float32Array(n);
  let s = seed >>> 0;
  for (let k = 0; k < n; k++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    x[k] = ((s / 2 ** 32) * 2 - 1) * a;
  }
  return x;
}
const scale = (x: Float32Array, g: number) => x.map((v) => v * g);
const shift = (x: Float32Array, lag: number) => {
  const y = new Float32Array(x.length);
  for (let k = 0; k < x.length; k++) y[k] = k - lag >= 0 && k - lag < x.length ? x[k - lag]! : 0;
  return y;
};
const N = CHANNELS_RATE * 3;

describe("примитивы", () => {
  it("rmsDb, correlation, bestLag, deinterleave", () => {
    expect(rmsDb(new Float32Array(10))).toBe(-150);
    expect(rmsDb(new Float32Array(8).fill(0.5))).toBeCloseTo(-6.02, 1);
    const a = noise(N, 1);
    expect(correlation(a, a)).toBeCloseTo(1, 6);
    expect(correlation(a, scale(a, -1))).toBeCloseTo(-1, 6);
    expect(Math.abs(correlation(a, noise(N, 2)))).toBeLessThan(0.05);
    expect(bestLag(a, shift(a, 37), 100, N)).toBe(37);
    expect(deinterleave(new Float32Array([1, 2, 3, 4, 5, 6]), 2)).toEqual([new Float32Array([1, 3, 5]), new Float32Array([2, 4, 6])]);
  });
});

describe("моно-исходник: L ≈ R", () => {
  it("одинаковые каналы → ok; один канал тише на 3 дБ или другой сигнал → провал", () => {
    const a = noise(N, 3);
    expect(judgeMono(a, a)).toMatchObject({ mode: "mono", ok: true, rms_diff_db: 0, corr: 1 });
    expect(judgeMono(a, scale(a, 10 ** (-3 / 20)))).toMatchObject({ ok: false, rms_diff_db: 3 });
    expect(judgeMono(a, noise(N, 4))).toMatchObject({ ok: false });
    expect(judgeMono(a, new Float32Array(N))).toMatchObject({ ok: false });
    expect(judgeMono(new Float32Array(N), new Float32Array(N))).toMatchObject({ ok: true, message: expect.stringMatching(/тишина/) });
  });
});

describe("стерео: попарно с edited-audio", () => {
  it("те же каналы (со сдвигом в пределах ±100 мс) → ok; перепутаны или сведены в моно → провал", () => {
    const l = noise(N, 5), r = noise(N, 6);
    const ok = judgeStereo([shift(l, 40), shift(r, 40)], [l, r]);
    expect(ok).toMatchObject({ mode: "stereo", ok: true, lag_ms: 5 });
    expect(ok.corr_left!).toBeGreaterThan(0.99);
    expect(judgeStereo([r, l], [l, r])).toMatchObject({ ok: false });
    const m = l.map((v, k) => (v + r[k]!) / 2);
    expect(judgeStereo([m, m], [l, r])).toMatchObject({ ok: false });
  });
});

describe("checkChannels", () => {
  it("5.1 → явный даунмикс в отчёте; отчёт по схеме verify.json", async () => {
    const r = await checkChannels({ finalPath: "/nope.mp4", editedAudio: "/nope.wav", sourceChannels: 6, finalChannels: 2, workDir: "/nope" });
    expect(r).toMatchObject({ mode: "downmix", source_channels: 6, final_channels: 2, ok: true, message: expect.stringMatching(/даунмикс/) });
    const report = {
      probe: [], duration: { expected_frames: 1, actual_us: 1, delta_frames: 0 }, sync: [], frames: [],
      loudness: { source_lufs: 0, final_lufs: 0, delta_lu: 0, final_peak_db: 0, source_peak_db: 0 }, verdict: "pass", failures: [], channels: r,
      color_tags: { color_space: "bt709", color_primaries: "bt709", color_transfer: "bt709" },
    };
    expect(FinalVerifyReportSchema.parse(report)).toEqual(report);
  });
});
