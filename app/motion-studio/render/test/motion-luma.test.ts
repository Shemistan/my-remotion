// previewLuma (S15b): яркость превью каждого N-го кадра на сетке пробы (96 × 54) — энергия
// движения временного прохода считается по этим сэмплам.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { findOnPath } from "../src/node/ffprobe.js";
import { previewLuma } from "../src/node/motion.js";
import { makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let ffmpeg: string;

beforeAll(async () => {
  const bin = await findOnPath("ffmpeg");
  if (!bin) throw new Error("ffmpeg не найден в PATH (brew install ffmpeg)");
  ffmpeg = bin;
  tmp = await makeTmp();
});
afterAll(() => removeTmp(tmp));

it("сэмплы кадров 0, 6, 12, … в размере сетки; стоящий кадр даёт одинаковые сэмплы, движение — разные", async () => {
  const still = join(tmp, "still.mp4");
  const moving = join(tmp, "moving.mp4");
  // 1 с при 30 fps: серый кадр без движения; белый квадрат, едущий слева направо
  execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=192x108:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", still]);
  execFileSync(ffmpeg, [
    "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=black:s=192x108:r=30:d=1", "-f", "lavfi", "-i", "color=c=white:s=40x40:r=30:d=1",
    "-filter_complex", "[0][1]overlay=x=t*150:y=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", moving,
  ]);
  const a = await previewLuma(still, { every: 6, w: 96, h: 54 });
  expect(a.frames).toEqual([0, 6, 12, 18, 24]);
  expect(a.luma).toHaveLength(5);
  expect(a.luma[0]).toHaveLength(96 * 54);
  const diff = (x: Uint8Array, y: Uint8Array) => x.reduce((s, v, i) => s + Math.abs(v - y[i]!), 0) / x.length;
  expect(diff(a.luma[0]!, a.luma[4]!)).toBeLessThan(1);
  const b = await previewLuma(moving, { every: 6, w: 96, h: 54 });
  expect(diff(b.luma[0]!, b.luma[1]!)).toBeGreaterThan(2);
});

it("нет файла — ошибка ffmpeg, а не пустой результат", async () => {
  await expect(previewLuma(join(tmp, "нет.mp4"), { every: 6, w: 96, h: 54 })).rejects.toThrow(/ffmpeg/);
});
