// Сверка темпа экспорта со сменой fps (F2, R1): настоящий ffmpeg на синтетических роликах.
// Квадрат едет 160 px/с. «Версия» в 30 fps даёт стоп-кадры; экспорт в другом fps либо по времени
// (x = 160·t — темп верный), либо по номеру кадра (как сцена с кадрами в коде: x = 160·n/30).
// Сравниваются только точно совпадающие моменты: n·k целое (24 fps — n кратно 5, 25 — 6, 50 — 3).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findOnPath } from "../src/node/ffprobe.js";
import { type TempoCheckRequest, alignStep, isTempoMismatch, listStills, tempoCheck, tempoDelta, tempoMoments } from "../src/node/tempo.js";
import { makeTmp, removeTmp } from "./helpers.js";

let tmp: string;
let ffmpeg: string;
const W = 320;
const H = 180;
const STILLS = [10, 13, 30, 43, 55, 80];
/** Белый квадрат 40×40 поверх фона, x — выражение от времени t (overlay считает его покадрово). */
const scene = (fps: number, x: string, tail = "") => [
  "-f", "lavfi", "-i", `color=c=0x203040:s=${W}x${H}:r=${fps}:d=3`,
  "-f", "lavfi", "-i", `color=c=white:s=40x40:r=${fps}:d=3`,
  "-filter_complex", `[0][1]overlay=x='${x}':y=60:eval=frame${tail}`,
];

function still(dir: string, n: number): void {
  execFileSync(ffmpeg, ["-v", "error", "-y", ...scene(30, "t*160", `,select=eq(n\\,${n})`), "-fps_mode", "passthrough", "-frames:v", "1", join(dir, "frames", `${n}.png`)]);
}
function video(name: string, fps: number, x: string, codec: "h264" | "prores" = "h264", size = ""): string {
  const out = join(tmp, name);
  const enc = codec === "h264" ? ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18"] : ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le"];
  const args = scene(fps, x);
  if (size) args[args.length - 1] += `,scale=${size}`;
  execFileSync(ffmpeg, ["-v", "error", "-y", ...args, ...enc, out]);
  return out;
}

/** Дорендер стоп-кадров версии: как renderVersion({stills}) в отдельный каталог. */
const rendered: number[][] = [];
async function renderStills(frames: number[]): Promise<string> {
  rendered.push(frames);
  const dir = await mkdtemp(join(tmp, "extra-"));
  mkdirSync(join(dir, "frames"));
  for (const n of frames) still(dir, n);
  return dir;
}

beforeAll(async () => {
  const bin = await findOnPath("ffmpeg");
  if (!bin) throw new Error("ffmpeg не найден в PATH (brew install ffmpeg)");
  ffmpeg = bin;
  tmp = await makeTmp();
  mkdirSync(join(tmp, "v", "frames"), { recursive: true });
  for (const n of STILLS) still(join(tmp, "v"), n);
  mkdirSync(join(tmp, "v13", "frames"), { recursive: true });
  still(join(tmp, "v13"), 13);
});
afterAll(() => removeTmp(tmp));

const req = (exportPath: string, fps: number, o: Partial<TempoCheckRequest> = {}): TempoCheckRequest => ({
  exportPath, versionDir: join(tmp, "v"), versionFps: { num: 30, den: 1 }, exportFps: { num: fps, den: 1 },
  versionFrames: 90, exportFrames: Math.round(3 * fps), width: W, height: H, opaque: true, renderStills, ...o,
});

describe("выравнивание моментов", () => {
  it("alignStep: наименьшее n, при котором n·k целое", () => {
    const f = (num: number, den = 1) => ({ num, den });
    expect(alignStep(f(30), f(60))).toBe(1);
    expect(alignStep(f(30), f(24))).toBe(5);
    expect(alignStep(f(30), f(25))).toBe(6);
    expect(alignStep(f(30), f(50))).toBe(3);
    expect(alignStep(f(60), f(30))).toBe(2);
    expect(alignStep(f(30000, 1001), f(30))).toBe(1000);
  });

  it("tempoMoments: кратные стоп-кадры берутся как есть, остальные — ближайший кратный, его дорендерить", () => {
    expect(tempoMoments(STILLS, 1, 90)).toEqual({ frames: STILLS, render: [] });
    expect(tempoMoments(STILLS, 5, 90)).toEqual({ frames: [10, 15, 30, 45, 55, 80], render: [15, 45] });
    expect(tempoMoments(STILLS, 6, 90)).toEqual({ frames: [12, 30, 42, 54, 78], render: [12, 42, 54, 78] });
    // не выходит за последний кадр версии
    expect(tempoMoments([89], 5, 90)).toEqual({ frames: [85], render: [85] });
  });
});

describe("tempoCheck", () => {
  it("стоп-кадры версии — по номеру", async () => {
    expect(await listStills(join(tmp, "v"))).toEqual(STILLS);
    expect(await listStills(join(tmp, "нет"))).toEqual([]);
  });

  it("60 fps по времени → расхождений нет; кадры экспорта ровно 2n, дорендер не нужен", async () => {
    rendered.length = 0;
    const r = await tempoCheck(req(video("good60.mp4", 60, "t*160"), 60));
    expect(r.samples.map((s) => s.exportFrame)).toEqual([20, 26, 60, 86, 110, 160]);
    expect(r.mismatched).toEqual([]);
    expect(rendered).toEqual([]);
  });

  it("кадры зашиты (60 fps, x = 160·n/30 — вдвое быстрее) → расхождение по всем кадрам", async () => {
    const r = await tempoCheck(req(video("fast60.mp4", 60, "t*320"), 60));
    // на кадре 80 квадрат уже за кадром и там, и там
    expect(r.mismatched).toEqual([10, 13, 30, 43, 55]);
  });

  for (const fps of [24, 25, 50]) {
    it(`${fps} fps по времени → только точно совпадающие моменты, расхождений нет (R1)`, async () => {
      rendered.length = 0;
      const r = await tempoCheck(req(video(`good${fps}.mp4`, fps, "t*160"), fps));
      const step = alignStep({ num: 30, den: 1 }, { num: fps, den: 1 });
      for (const s of r.samples) {
        expect(s.frame % step).toBe(0);
        expect(s.exportFrame).toBe((s.frame * fps) / 30);
      }
      expect(rendered).toEqual([tempoMoments(STILLS, step, 90).render]);
      expect(r.samples.filter((s) => s.rendered).map((s) => s.frame)).toEqual(rendered[0]);
      expect(r.mismatched).toEqual([]);
    });
    it(`${fps} fps, кадры зашиты (x = 160·n/30) → расхождение`, async () => {
      const r = await tempoCheck(req(video(`frames${fps}.mp4`, fps, `n*160/30`), fps));
      expect(r.mismatched.length).toBeGreaterThanOrEqual(r.samples.length - 1);
    });
  }

  it("дорендера нет и кратных стоп-кадров нет — ошибка, а не сверка по невыровненным", async () => {
    const r = req(join(tmp, "good25.mp4"), 25, { renderStills: undefined });
    await expect(tempoCheck({ ...r, versionDir: join(tmp, "v13") })).rejects.toThrow(/стоп-кадр/);
  });

  it("ProRes с альфой тоже сверяется", async () => {
    expect((await tempoCheck(req(video("good.mov", 60, "t*160", "prores"), 60, { opaque: false }))).mismatched).toEqual([]);
    expect((await tempoCheck(req(video("fast.mov", 60, "t*320", "prores"), 60, { opaque: false }))).mismatched.length).toBeGreaterThan(0);
  });

  it("R3: экспорт со scale 0.5 сравнивается в размере экспорта, а не апскейлом до версии", async () => {
    const r = await tempoCheck(req(video("half.mp4", 60, "t*160", "h264", "160:90"), 60, { scale: 0.5 }));
    expect(r.compare).toEqual({ width: 160, height: 90 });
    expect(r.mismatched).toEqual([]);
  });

  it("стоп-кадров нет — пустая сверка, ffmpeg не зовётся", async () => {
    const r = await tempoCheck({ ...req(join(tmp, "нет.mp4"), 60), versionDir: join(tmp, "нет") });
    expect(r.samples).toEqual([]);
    expect(r.mismatched).toEqual([]);
  });
});

describe("tempoDelta и правило расхождения", () => {
  const px = (r: number, a = 255) => Uint8Array.from({ length: 16 * 9 * 4 }, (_, i) => (i % 4 === 3 ? a : r));
  it("одинаковые кадры → 0; разные → доля разницы", () => {
    expect(tempoDelta(px(100), px(100), 16, 9, true)).toEqual({ maxTile: 0, hotTiles: 0, mean: 0 });
    expect(tempoDelta(px(0), px(255), 16, 9, true)).toMatchObject({ hotTiles: 144 });
    expect(tempoDelta(px(0), px(255), 16, 9, true).maxTile).toBeCloseTo(1, 6);
  });
  it("H.264 без альфы: прозрачные у стоп-кадра пиксели не сравниваются", () => {
    expect(tempoDelta(px(0, 0), px(255), 16, 9, true)).toEqual({ maxTile: 0, hotTiles: 0, mean: 0 });
    // ProRes с альфой — сравнение «на чёрном»: прозрачное против прозрачного совпадает
    expect(tempoDelta(px(10, 0), px(200, 0), 16, 9, false).maxTile).toBe(0);
  });
  it("клетки выше 0,03 считаются: 3 клетки по 0,04 → hotTiles 3", () => {
    const got = px(0);
    // клетка 16×9 при кадре 16×9 — один пиксель; 0,04 → |Δ| ≈ 10,2 из 255
    for (const i of [0, 5, 100]) got.fill(11, i * 4, i * 4 + 3);
    const d = tempoDelta(px(0), got, 16, 9, true);
    expect(d.hotTiles).toBe(3);
    expect(d.maxTile).toBeLessThan(0.06);
  });
  it("кадр расходится: худшая > 0,06 или ≥ 3 клеток > 0,03", () => {
    expect(isTempoMismatch({ maxTile: 0.061, hotTiles: 1 })).toBe(true);
    expect(isTempoMismatch({ maxTile: 0.05, hotTiles: 3 })).toBe(true);
    expect(isTempoMismatch({ maxTile: 0.05, hotTiles: 2 })).toBe(false);
    expect(isTempoMismatch({ maxTile: 0.023, hotTiles: 0 })).toBe(false);
  });
});
