// Task 28: взаимная корреляция и проверка синхронности превью.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildTimeline } from "@ms/contracts";
import { arrayPcm, audioOffsetUs, syncCheck, wavPcm, xcorrLag } from "../../src/edit/sync-probe.js";
import { F30, w } from "./helpers.js";

/** Детерминированный шум (LCG). */
function noise(n: number, seed = 1): Int16Array {
  const out = new Int16Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    out[i] = (x % 20000) - 10000;
  }
  return out;
}
/** `a`, запаздывающий на `k` сэмплов (в начале — нули). */
function shift(a: Int16Array, k: number): Int16Array {
  const out = new Int16Array(a.length);
  for (let i = k; i < a.length; i++) out[i] = a[i - k]!;
  return out;
}

const tmp = mkdtempSync(join(tmpdir(), "ms-sync-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("audioOffsetUs / xcorrLag", () => {
  it("находит сдвиг шума с точностью до сэмпла", () => {
    const a = noise(16000);
    expect(Math.abs(audioOffsetUs(a, shift(a, 480), 16000, 100_000) - 30_000)).toBeLessThanOrEqual(63);
    expect(audioOffsetUs(shift(a, 160), a, 16000, 100_000)).toBe(-10_000);
    expect(audioOffsetUs(a, a, 16000, 100_000)).toBe(0);
    expect(xcorrLag(a, a, -10, 10).corr).toBeCloseTo(1, 6);
    // тишина — корреляция 0, замер ненадёжен
    expect(xcorrLag(new Int16Array(1000), a.subarray(0, 1000), -10, 10).corr).toBe(0);
  });
});

describe("syncCheck", () => {
  // «исходник» 10 с шума 16 кГц, вырезка 3–4,5 с; «превью» — склейка оставленного
  const sr = 16000;
  const src = noise(10 * sr, 7);
  const tl = buildTimeline(10_000_000, [{ start_us: 3_000_000, end_us: 4_500_000 }], F30);
  const words = Array.from({ length: 9 }, (_, i) => w(`w_00000${i + 1}`, `с${i}`, i * 1_000_000 + 200_000, i * 1_000_000 + 600_000));
  const cutPreview = (lagSamples: number) => {
    const kept = new Int16Array(src.length - 1.5 * sr);
    kept.set(src.subarray(0, 3 * sr), 0);
    kept.set(src.subarray(4.5 * sr), 3 * sr);
    return lagSamples > 0 ? shift(kept, lagSamples) : kept;
  };

  it("точная склейка — смещения 0 по 5 словам из оставленных", async () => {
    const r = await syncCheck(arrayPcm(src, sr), arrayPcm(cutPreview(0), sr), tl, words, 5);
    expect(r).toHaveLength(5);
    for (const s of r) {
      expect(s.offset_us).toBe(0);
      expect(s.corr).toBeGreaterThan(0.99);
    }
    // вырезанное слово (w_000004: 3,2–3,6 с) не выбирается
    expect(r.map((s) => s.word_id)).not.toContain("w_000004");
  });

  it("звук превью уехал на 40 мс — смещение видно", async () => {
    const r = await syncCheck(arrayPcm(src, sr), arrayPcm(cutPreview(640), sr), tl, words, 3);
    for (const s of r) expect(s.offset_us).toBe(40_000);
  });

  it("wavPcm читает окна из файла и нули за краями", async () => {
    const path = join(tmp, "a.wav");
    execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:sample_rate=16000:d=1", "-ac", "1", "-c:a", "pcm_s16le", path]);
    const r = await wavPcm(path);
    try {
      expect(r.sampleRate).toBe(16000);
      expect(r.length).toBe(16000);
      const head = await r.read(-10, 20);
      expect(Array.from(head.subarray(0, 10))).toEqual(Array(10).fill(0));
      const tail = await r.read(15990, 20);
      expect(Array.from(tail.subarray(10))).toEqual(Array(10).fill(0));
      expect((await r.read(100, 50)).some((x) => x !== 0)).toBe(true);
    } finally {
      await r.close();
    }
  });
});
