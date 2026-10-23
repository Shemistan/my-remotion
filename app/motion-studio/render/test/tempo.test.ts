// Сверка темпа экспорта со сменой fps (F2): настоящий ffmpeg на синтетических роликах.
// Квадрат едет 80 px/с. «Версия» в 30 fps даёт стоп-кадры; экспорт в 60 fps либо по времени
// (x = 80·t — темп верный), либо по номеру кадра (x = 160·t — как сцена с кадрами в коде, вдвое быстрее).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findOnPath } from "../src/node/ffprobe.js";
import { listStills, tempoCheck, tempoDelta } from "../src/node/tempo.js";
import { makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let ffmpeg: string;
const W = 320;
const H = 180;
/** Белый квадрат 40×40 поверх фона, x — выражение от времени t (overlay считает его покадрово). */
const scene = (fps: number, x: string, tail = "") => [
  "-f", "lavfi", "-i", `color=c=0x203040:s=${W}x${H}:r=${fps}:d=3`,
  "-f", "lavfi", "-i", `color=c=white:s=40x40:r=${fps}:d=3`,
  "-filter_complex", `[0][1]overlay=x='${x}':y=60:eval=frame${tail}`,
];

function still(n: number): void {
  execFileSync(ffmpeg, ["-v", "error", "-y", ...scene(30, "t*80", `,select=eq(n\\,${n})`), "-fps_mode", "passthrough", "-frames:v", "1", join(tmp, "v", "frames", `${n}.png`)]);
}
function video(name: string, x: string, codec: "h264" | "prores"): string {
  const out = join(tmp, name);
  const enc = codec === "h264" ? ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18"] : ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le"];
  execFileSync(ffmpeg, ["-v", "error", "-y", ...scene(60, x), ...enc, out]);
  return out;
}

beforeAll(async () => {
  const bin = await findOnPath("ffmpeg");
  if (!bin) throw new Error("ffmpeg не найден в PATH (brew install ffmpeg)");
  ffmpeg = bin;
  tmp = await makeTmp();
  mkdirSync(join(tmp, "v", "frames"), { recursive: true });
  for (const n of [10, 30, 55, 80]) still(n);
});
afterAll(() => removeTmp(tmp));

const req = (exportPath: string, opaque = true) => ({ exportPath, versionDir: join(tmp, "v"), factor: 2, exportFrames: 180, width: W, height: H, opaque });

describe("tempoCheck", () => {
  it("стоп-кадры версии — по номеру", async () => {
    expect(await listStills(join(tmp, "v"))).toEqual([10, 30, 55, 80]);
    expect(await listStills(join(tmp, "нет"))).toEqual([]);
  });

  it("темп по времени (60 fps, x = 80·t) → расхождений нет", async () => {
    const r = await tempoCheck(req(video("good.mp4", "t*80", "h264")));
    expect(r.samples.map((s) => s.exportFrame)).toEqual([20, 60, 110, 160]);
    expect(r.mismatched).toEqual([]);
    for (const s of r.samples) expect(s.maxTile).toBeLessThan(r.threshold);
  });

  it("кадры зашиты (x = 160·t: при 60 fps прежние 80 px за 30 кадров — вдвое быстрее) → fps_tempo_mismatch по всем движущимся кадрам", async () => {
    const r = await tempoCheck(req(video("fast.mp4", "t*160", "h264")));
    expect(r.mismatched).toEqual([10, 30, 55, 80]);
  });

  it("ProRes с альфой тоже сверяется", async () => {
    expect((await tempoCheck(req(video("good.mov", "t*80", "prores"), false))).mismatched).toEqual([]);
    expect((await tempoCheck(req(video("fast.mov", "t*160", "prores"), false))).mismatched.length).toBeGreaterThan(0);
  });

  it("стоп-кадров нет — пустая сверка, ffmpeg не зовётся", async () => {
    const r = await tempoCheck({ ...req(join(tmp, "нет.mp4")), versionDir: join(tmp, "нет") });
    expect(r).toEqual({ factor: 2, threshold: r.threshold, samples: [], mismatched: [] });
  });
});

describe("tempoDelta", () => {
  const px = (r: number, a = 255) => Uint8Array.from({ length: 16 * 9 * 4 }, (_, i) => (i % 4 === 3 ? a : r));
  it("одинаковые кадры → 0; разные → доля разницы", () => {
    expect(tempoDelta(px(100), px(100), 16, 9, true)).toEqual({ maxTile: 0, mean: 0 });
    expect(tempoDelta(px(0), px(255), 16, 9, true).maxTile).toBeCloseTo(1, 6);
  });
  it("H.264 без альфы: прозрачные у стоп-кадра пиксели не сравниваются", () => {
    expect(tempoDelta(px(0, 0), px(255), 16, 9, true)).toEqual({ maxTile: 0, mean: 0 });
    // ProRes с альфой — сравнение «на чёрном»: прозрачное против прозрачного совпадает
    expect(tempoDelta(px(10, 0), px(200, 0), 16, 9, false).maxTile).toBe(0);
  });
});
