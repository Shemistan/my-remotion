// Сверка темпа экспорта со сменой fps (Task 19, ruling «экспорт со сменой fps»): кадр
// экспорта, совпадающий по времени со стоп-кадром версии frames/<n>.png, должен совпадать и по
// картинке. Сцена, зашившая кадры в код (`interpolate(frame, [140, 152])`, `<Sequence from={30}>`),
// в другом fps идёт в другом темпе, и совпадение ломается там, где движется зашитое. Gate такое
// не ловит: fps и длительность у файла верные.
//
// Сравниваются только точно совпадающие моменты (R1): n·k целое, k = fps экспорта / fps версии.
// Полкадра сдвига (24 fps: round(13·0,8) = 10 вместо 10,4) в движении даёт клетке до 0,1 — больше
// любого разумного порога, поэтому невыровненные стоп-кадры не сравниваются: вместо них берётся
// ближайший кратный момент, и его стоп-кадр дорендеривается (`renderStills`).
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Fps } from "@ms/contracts";
import { type FfmpegOptions, removeScratch, runFfmpeg, scratchDir } from "./ffmpeg.js";

/**
 * Правило расхождения кадра (калибровка 2026-10-23, task-19-rereview): средняя разница RGB в
 * клетке сетки 16×9 (доля 0..1). Кадр расходится, если худшая клетка > 0,06 ИЛИ клеток > 0,03
 * не меньше трёх. Верный темп (v4 30 → 60 fps): худшая ≤ 0,023, клеток > 0,03 — ни одной;
 * сжатый каскад частиц (base-literal) — 0,058 и 5 клеток; kit-gallery — до 0,39.
 */
export const TEMPO_TILE_THRESHOLD = 0.06;
export const TEMPO_HOT_TILE = 0.03;
export const TEMPO_HOT_TILES_MIN = 3;
/** Сравнение в уменьшенном размере (R3): давит шум H.264 и субпиксели, клетка остаётся ~30 px. */
export const TEMPO_COMPARE_WIDTH = 480;
const TILES_X = 16;
const TILES_Y = 9;

export interface TempoSample {
  /** Кадр версии (стоп-кадр `frames/<frame>.png`). */
  frame: number;
  /** Кадр экспорта в тот же момент: frame·k, целое. */
  exportFrame: number;
  /** Средняя разница в худшей клетке, 0..1. */
  maxTile: number;
  /** Клеток с разницей выше `TEMPO_HOT_TILE`. */
  hotTiles: number;
  /** Средняя разница по кадру, 0..1. */
  mean: number;
  /** Стоп-кадр дорендерен для сверки (у версии такого не было). */
  rendered?: boolean;
}

export interface TempoCheck {
  factor: number;
  threshold: number;
  hotTile: number;
  hotTilesMin: number;
  /** Размер, в котором сравнивались кадры. */
  compare: { width: number; height: number };
  samples: TempoSample[];
  /** Кадры версии с расхождением; пусто — темп совпал. */
  mismatched: number[];
}

/** Номера стоп-кадров версии (`frames/<n>.png`) по возрастанию. */
export async function listStills(versionDir: string): Promise<number[]> {
  const dir = join(versionDir, "frames");
  if (!existsSync(dir)) return [];
  return (await readdir(dir))
    .map((n) => /^(\d+)\.png$/.exec(n)?.[1])
    .filter((x): x is string => x !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** k = to / from несократимой дробью p/q. */
function ratio(from: Fps, to: Fps): { p: number; q: number } {
  const p = to.num * from.den;
  const q = to.den * from.num;
  const g = gcd(p, q);
  return { p: p / g, q: q / g };
}

/** Наименьший шаг кадров версии, на котором время совпадает с кадром экспорта: n·k целое ⇔ n кратно шагу. */
export function alignStep(from: Fps, to: Fps): number {
  return ratio(from, to).q;
}

/**
 * Моменты сверки: стоп-кадры, кратные `step`, — как есть; остальные заменяются ближайшим
 * кратным (не дальше последнего кадра версии), такой стоп-кадр надо дорендерить (`render`).
 */
export function tempoMoments(stills: number[], step: number, versionFrames: number): { frames: number[]; render: number[] } {
  const have = new Set(stills);
  const frames = new Set<number>();
  for (const n of stills) {
    let m = Math.round(n / step) * step;
    if (m > versionFrames - 1) m -= step;
    if (m >= 0) frames.add(m);
  }
  const sorted = [...frames].sort((a, b) => a - b);
  return { frames: sorted, render: sorted.filter((n) => !have.has(n)) };
}

/** Кадр расходится по темпу: худшая клетка выше порога или «горячих» клеток не меньше трёх. */
export function isTempoMismatch(d: { maxTile: number; hotTiles: number }): boolean {
  return d.maxTile > TEMPO_TILE_THRESHOLD || d.hotTiles >= TEMPO_HOT_TILES_MIN;
}

/**
 * Разница двух кадров RGBA одного размера: цвет, умноженный на альфу (сравнение «на чёрном»).
 * `opaqueTarget` — у `got` нет альфы (H.264): пиксели, прозрачные у `ref`, не сравниваются —
 * чем кодек зальёт прозрачный фон, к темпу не относится. Клетки сетки, где сравнимых пикселей
 * меньше четверти, не учитываются.
 */
export function tempoDelta(ref: Uint8Array, got: Uint8Array, width: number, height: number, opaqueTarget: boolean): { maxTile: number; hotTiles: number; mean: number } {
  const n = TILES_X * TILES_Y;
  const sum = new Float64Array(n);
  const cnt = new Float64Array(n);
  const area = new Float64Array(n);
  let total = 0;
  let used = 0;
  for (let y = 0; y < height; y++) {
    const ty = Math.floor((y * TILES_Y) / height) * TILES_X;
    for (let x = 0; x < width; x++) {
      const t = ty + Math.floor((x * TILES_X) / width);
      area[t]!++;
      const i = (y * width + x) * 4;
      const ra = ref[i + 3]!;
      if (opaqueTarget && ra < 255) continue;
      const ga = opaqueTarget ? 255 : got[i + 3]!;
      const d = (Math.abs(ref[i]! * ra - got[i]! * ga) + Math.abs(ref[i + 1]! * ra - got[i + 1]! * ga) + Math.abs(ref[i + 2]! * ra - got[i + 2]! * ga)) / (3 * 255 * 255);
      sum[t]! += d;
      cnt[t]!++;
      total += d;
      used++;
    }
  }
  let maxTile = 0;
  let hotTiles = 0;
  for (let t = 0; t < n; t++) {
    if (cnt[t]! < area[t]! / 4 || cnt[t]! === 0) continue;
    const v = sum[t]! / cnt[t]!;
    maxTile = Math.max(maxTile, v);
    if (v > TEMPO_HOT_TILE) hotTiles++;
  }
  return { maxTile, hotTiles, mean: used > 0 ? total / used : 0 };
}

export interface TempoCheckRequest extends FfmpegOptions {
  exportPath: string;
  versionDir: string;
  versionFps: Fps;
  exportFps: Fps;
  /** Число кадров версии и экспорта. */
  versionFrames: number;
  exportFrames: number;
  /** Размер версии (`settings.width/height`) и масштаб экспорта (`request.scale`, по умолчанию 1). */
  width: number;
  height: number;
  scale?: number;
  /** Файл экспорта без альфы (H.264). */
  opaque: boolean;
  /**
   * Дорендер стоп-кадров версии для кратных моментов, которых у версии нет: возвращает каталог
   * с `frames/<n>.png`. Без него сверка идёт только по имеющимся кратным стоп-кадрам.
   */
  renderStills?: (frames: number[]) => Promise<string>;
}

/** Размер сравнения: не больше `TEMPO_COMPARE_WIDTH` и не больше размера экспорта, пропорции версии. */
function compareSize(req: TempoCheckRequest): { width: number; height: number } {
  const width = Math.max(16, Math.min(TEMPO_COMPARE_WIDTH, Math.round(req.width * (req.scale ?? 1))));
  return { width, height: Math.max(9, Math.round((width * req.height) / req.width)) };
}

/**
 * Сверка темпа: кадры экспорта в точно совпадающие моменты (одним проходом ffmpeg) против
 * стоп-кадров версии, оба — в уменьшенном размере. Невыровненные стоп-кадры заменяются
 * ближайшими кратными и дорендериваются `renderStills`; без него — только имеющиеся кратные,
 * а если их нет — ошибка (сверять по невыровненным нельзя: ложный отказ). Ошибки ffmpeg —
 * `FfmpegError` (с `run` процессы в реестре попытки, отмена — `signal`).
 */
export async function tempoCheck(req: TempoCheckRequest): Promise<TempoCheck> {
  const { p, q } = ratio(req.versionFps, req.exportFps);
  const compare = compareSize(req);
  const out: TempoCheck = {
    factor: p / q, threshold: TEMPO_TILE_THRESHOLD, hotTile: TEMPO_HOT_TILE, hotTilesMin: TEMPO_HOT_TILES_MIN, compare, samples: [], mismatched: [],
  };
  const stills = await listStills(req.versionDir);
  if (stills.length === 0) return out;
  let { frames, render } = tempoMoments(stills, q, req.versionFrames);
  if (!req.renderStills) {
    frames = frames.filter((n) => !render.includes(n));
    render = [];
    if (frames.length === 0) throw new Error(`сверка темпа: нет стоп-кадров версии, кратных ${q} (точно совпадающих по времени с кадрами экспорта), и нечем дорендерить`);
  }
  const extraDir = render.length > 0 ? await req.renderStills!(render) : undefined;
  const pairs = frames
    .map((frame) => ({ frame, exportFrame: (frame / q) * p, rendered: render.includes(frame) }))
    .filter((x) => x.exportFrame <= req.exportFrames - 1);
  const { width: w, height: h } = compare;
  const size = w * h * 4;
  const scale = `scale=${w}:${h}:flags=area`;
  const dir = await scratchDir(req, "tempo");
  try {
    const exp = join(dir, "export.rgba");
    const select = pairs.map((x) => `eq(n\\,${x.exportFrame})`).join("+");
    await runFfmpeg([
      "-v", "error", "-nostdin", "-y", "-i", req.exportPath,
      "-vf", `select=${select},${scale}`,
      "-fps_mode", "passthrough", "-frames:v", String(pairs.length),
      "-pix_fmt", "rgba", "-f", "rawvideo", exp,
    ], dir, req);
    const got = await readFile(exp);
    if (got.length < pairs.length * size) throw new Error(`сверка темпа: в ${req.exportPath} нет кадров ${pairs.map((x) => x.exportFrame).join(", ")} (получено ${Math.floor(got.length / size)})`);
    for (const [k, x] of pairs.entries()) {
      const png = join(x.rendered ? extraDir! : req.versionDir, "frames", `${x.frame}.png`);
      const still = join(dir, `still-${x.frame}.rgba`);
      await runFfmpeg(["-v", "error", "-nostdin", "-y", "-i", png, "-vf", scale, "-frames:v", "1", "-pix_fmt", "rgba", "-f", "rawvideo", still], dir, req);
      const ref = await readFile(still);
      if (ref.length < size) throw new Error(`сверка темпа: стоп-кадр ${x.frame} не прочитан`);
      const d = tempoDelta(ref, got.subarray(k * size, (k + 1) * size), w, h, req.opaque);
      out.samples.push({ frame: x.frame, exportFrame: x.exportFrame, maxTile: round4(d.maxTile), hotTiles: d.hotTiles, mean: round4(d.mean), ...(x.rendered ? { rendered: true } : {}) });
      if (isTempoMismatch(d)) out.mismatched.push(x.frame);
    }
    return out;
  } finally {
    await removeScratch(dir);
  }
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
