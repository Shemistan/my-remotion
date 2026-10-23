// alphaAtCorner: альфа пикселя кадра ProRes 4444 через системный ffmpeg.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { alphaAtCorner } from "../src/node/alpha.js";
import { findOnPath } from "../src/node/ffprobe.js";
import { makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let ffmpeg: string;

/** Короткий ProRes 4444: левая половина прозрачная, правая — непрозрачный белый. */
function makeMov(path: string): void {
  execFileSync(ffmpeg, [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", "color=c=white@0.0:s=32x16:r=30:d=0.2,format=rgba",
    "-f", "lavfi", "-i", "color=c=white:s=16x16:r=30:d=0.2,format=rgba",
    "-filter_complex", "[0][1]overlay=16:0:format=auto,format=yuva444p10le",
    "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", path,
  ]);
}

beforeAll(async () => {
  const bin = await findOnPath("ffmpeg");
  if (!bin) throw new Error("ffmpeg не найден в PATH (brew install ffmpeg)");
  ffmpeg = bin;
  tmp = await makeTmp();
  makeMov(join(tmp, "a.mov"));
});
afterAll(() => removeTmp(tmp));

it("прозрачный угол → 0, непрозрачный пиксель → 255", async () => {
  const mov = join(tmp, "a.mov");
  expect(await alphaAtCorner(mov, 3)).toBe(0);
  expect(await alphaAtCorner(mov, 3, { x: 24, y: 8 })).toBe(255);
});

it("кадр вне файла — ошибка, а не 0", async () => {
  await expect(alphaAtCorner(join(tmp, "a.mov"), 500)).rejects.toThrow(/кадр 500/);
  await expect(alphaAtCorner(join(tmp, "нет.mov"), 0)).rejects.toThrow(/ffmpeg/);
});
