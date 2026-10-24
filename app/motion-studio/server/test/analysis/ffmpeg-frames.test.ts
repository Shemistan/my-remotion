// Task 30: `scdet` и извлечение кадров на реальном ffmpeg (короткий синтетический ролик со
// сменами сцен на 2 и 4 с). Точность `-ss` перед `-i` сверяется с `-ss` после `-i`.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractKeyframes } from "../../src/analysis/keyframes.js";
import { detectCuts, shotsFromCuts } from "../../src/analysis/shots.js";
import { REPO_TMP } from "../db/helpers.js";

let dir: string;
let video: string;

beforeAll(async () => {
  dir = await mkdtemp(join(REPO_TMP, "ms-frames-"));
  video = join(dir, "cuts.mp4");
  execFileSync("ffmpeg", [
    "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=2", "-f", "lavfi", "-i", "smptebars=s=640x360:r=30:d=2",
    "-f", "lavfi", "-i", "mandelbrot=s=640x360:r=30", "-filter_complex", "[2:v]trim=duration=2,setpts=PTS-STARTPTS[m];[0:v][1:v][m]concat=n=3:v=1:a=0",
    "-c:v", "libx264", "-g", "90", "-pix_fmt", "yuv420p", "-movflags", "+faststart", video,
  ]);
});
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const md5 = async (p: string) => createHash("md5").update(await readFile(p)).digest("hex");

describe("ffmpeg: смены сцен и кадры", () => {
  it("scdet находит обе смены; шоты по ним", async () => {
    const cuts = await detectCuts(video, { signal: new AbortController().signal });
    expect(cuts).toHaveLength(2);
    expect(Math.abs(cuts[0]! - 2_000_000)).toBeLessThanOrEqual(34_000);
    expect(Math.abs(cuts[1]! - 4_000_000)).toBeLessThanOrEqual(34_000);
    expect(shotsFromCuts(cuts, 6_000_000)).toHaveLength(3);
  });

  it("кадр по -ss перед -i тот же, что по -ss после -i; длинная сторона 640; кадр за концом пропущен", async () => {
    const got = await extractKeyframes(video, [1_500_000, 2_500_000, 9_000_000], dir, { signal: new AbortController().signal });
    expect(got.map((g) => g.us)).toEqual([1_500_000, 2_500_000]);
    for (const g of got) {
      const ref = join(dir, `ref-${g.us}.png`);
      execFileSync("ffmpeg", ["-v", "error", "-i", video, "-ss", (g.us / 1e6).toFixed(6), "-frames:v", "1", "-vf", "scale=640:-2", ref]);
      expect(await md5(join(dir, g.path)), `кадр ${g.us}`).toBe(await md5(ref));
    }
    const size = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(dir, got[0]!.path)]).toString().trim();
    expect(size).toBe("640,360");
  });

  it("отмена прерывает ffmpeg", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(detectCuts(video, { signal: ac.signal })).rejects.toThrow(/отмен/);
  });
});
