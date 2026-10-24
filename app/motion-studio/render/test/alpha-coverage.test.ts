// alphaCoverage (S6, Р17): доля непрозрачных (α ≥ 0,5) и «дымки» (0 < α < 0,5) по кадрам
// ProRes 4444 через системный ffmpeg; overlayFrames — кадры проверки по окну речи и hold.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { MotionSpec } from "@ms/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alphaCoverage, overlayFrames } from "../src/node/alpha.js";
import { findOnPath } from "../src/node/ffprobe.js";
import { makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let ffmpeg: string;

/** ProRes 4444 64×36, 3 кадра: левая половина непрозрачна, правая прозрачна. */
function makeHalf(path: string): void {
  execFileSync(ffmpeg, [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", "color=c=white@0.0:s=64x36:r=30:d=0.1,format=rgba",
    "-f", "lavfi", "-i", "color=c=white:s=32x36:r=30:d=0.1,format=rgba",
    "-filter_complex", "[0][1]overlay=0:0:format=auto,format=yuva444p10le",
    "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", path,
  ]);
}
/** ProRes 4444 64×36 с одной альфой `a` на всю площадь. */
function makeFlat(path: string, a: number): void {
  execFileSync(ffmpeg, [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", `color=c=white@${a}:s=64x36:r=30:d=0.1,format=rgba,format=yuva444p10le`,
    "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", path,
  ]);
}

beforeAll(async () => {
  const bin = await findOnPath("ffmpeg");
  if (!bin) throw new Error("ffmpeg не найден в PATH (brew install ffmpeg)");
  ffmpeg = bin;
  tmp = await makeTmp();
  makeHalf(join(tmp, "half.mov"));
  makeFlat(join(tmp, "clear.mov"), 0);
  makeFlat(join(tmp, "haze.mov"), 0.25);
});
afterAll(() => removeTmp(tmp));

describe("alphaCoverage", () => {
  it("половина кадра непрозрачна → opaque ≈ 0,5", async () => {
    const c = await alphaCoverage(join(tmp, "half.mov"), [0]);
    expect(c.opaque).toBeCloseTo(0.5, 1);
    expect(c.haze).toBeLessThan(0.05);
  });

  it("пустой кадр → 0 и 0", async () => {
    expect(await alphaCoverage(join(tmp, "clear.mov"), [0])).toMatchObject({ opaque: 0, haze: 0 });
  });

  it("α = 64 на всю площадь → дымка ≈ 1, непрозрачного нет", async () => {
    expect(await alphaCoverage(join(tmp, "haze.mov"), [0])).toMatchObject({ opaque: 0, haze: expect.closeTo(1, 1) });
  });

  it("по кадру на каждый запрошенный, итог — максимум", async () => {
    const c = await alphaCoverage(join(tmp, "half.mov"), [0, 1, 2]);
    expect(c.perFrame.map((x) => x.frame)).toEqual([0, 1, 2]);
    expect(c.opaque).toBe(Math.max(...c.perFrame.map((x) => x.opaque)));
  });

  it("кадра нет в файле — ошибка, а не 0", async () => {
    await expect(alphaCoverage(join(tmp, "half.mov"), [0, 500])).rejects.toThrow(/кадр/);
  });

  it("PNG без альфы читается как непрозрачный (проверка кадра в fix-loop)", async () => {
    const png = join(tmp, "rgb.png");
    execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=32x18,format=rgb24", "-frames:v", "1", png]);
    expect((await alphaCoverage(png, [0])).opaque).toBe(1);
  });
});

/** Spec сцены сценария с финальным удержанием с кадра `hold` (null — без hold). */
function specWithHold(hold: number | null, total = 237): MotionSpec {
  const beats = [
    { id: "b1", element_ids: ["e1"], action: "enter", start_frame: 0, end_frame: 40, phase: "p1" },
    { id: "b2", element_ids: ["e1"], action: "count", start_frame: 40, end_frame: hold ?? total, phase: "p2" },
    ...(hold === null ? [] : [{ id: "b3", element_ids: ["e1"], action: "hold", start_frame: hold, end_frame: total, phase: "p3" }]),
  ];
  return {
    title: "t", purpose: "p", duration_frames: total, fps: { num: 30, den: 1 }, style_preset: "dark-premium",
    elements: [{ id: "e1", kind: "text", role: "заголовок" }],
    phases: [
      { id: "p1", role: "setup", weight: 1, element_ids: ["e1"] },
      { id: "p2", role: "action", weight: 3, element_ids: ["e1"] },
      ...(hold === null ? [] : [{ id: "p3", role: "hold" as const, weight: 1, element_ids: ["e1"] }]),
    ],
    beats,
  } as unknown as MotionSpec;
}

describe("overlayFrames", () => {
  it("речь > 6 с: середина речи, конец речи, начало hold", () => {
    expect(overlayFrames(specWithHold(207), { lead: 15, speech: 192, tail: 30, total: 237 })).toEqual([111, 206, 207]);
  });
  it("речь ≤ 6 с — 2 кадра", () => {
    expect(overlayFrames(specWithHold(80, 105), { lead: 15, speech: 60, tail: 30, total: 105 })).toEqual([45, 80]);
  });
  it("без hold — последний кадр сцены; повторы схлопываются", () => {
    expect(overlayFrames(specWithHold(null, 105), { lead: 15, speech: 60, tail: 30, total: 105 })).toEqual([45, 104]);
    expect(overlayFrames(specWithHold(45, 105), { lead: 15, speech: 60, tail: 30, total: 105 })).toEqual([45]);
  });
});
