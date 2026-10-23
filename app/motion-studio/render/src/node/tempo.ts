// Сверка темпа экспорта со сменой fps (Task 19, ruling «экспорт со сменой fps»): кадр
// экспорта round(n·k) должен совпадать со стоп-кадром версии frames/<n>.png. Сцена, зашившая
// кадры в код (`interpolate(frame, [140, 152])`, `<Sequence from={30}>`), при 60 fps идёт
// быстрее, и совпадение ломается там, где движется зашитое. Gate такое не ловит: fps и
// длительность у файла верные.
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { type FfmpegOptions, removeScratch, runFfmpeg, scratchDir } from "./ffmpeg.js";

/**
 * Порог расхождения: средняя разница RGB в худшей клетке сетки 16×9, доля 0..1. Калибровка
 * (2026-10-23, 1920×1080): реальная сцена v4 30 → 60 fps — не больше 0,024 на 8 стоп-кадрах
 * (шум H.264 и субпиксели); kit-gallery с кадрами в коде — до 0,37, сравнение «кадр в кадр»
 * у v4 (ускорение вдвое) — 0,116…0,152. Порог с запасом ×2,5 над шумом.
 */
export const TEMPO_TILE_THRESHOLD = 0.06;
const TILES_X = 16;
const TILES_Y = 9;

export interface TempoSample {
  /** Кадр версии (стоп-кадр `frames/<frame>.png`). */
  frame: number;
  /** Кадр экспорта, совпадающий с ним по времени: round(frame·k). */
  exportFrame: number;
  /** Средняя разница в худшей клетке, 0..1. */
  maxTile: number;
  /** Средняя разница по кадру, 0..1. */
  mean: number;
}

export interface TempoCheck {
  factor: number;
  threshold: number;
  samples: TempoSample[];
  /** Кадры версии с расхождением выше порога; пусто — темп совпал. */
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

/**
 * Разница двух кадров RGBA одного размера: цвет, умноженный на альфу (сравнение «на чёрном»).
 * `opaqueTarget` — у `got` нет альфы (H.264): пиксели, прозрачные у `ref`, не сравниваются —
 * чем кодек зальёт прозрачный фон, к темпу не относится. Клетки сетки, где сравнимых пикселей
 * меньше четверти, не учитываются.
 */
export function tempoDelta(ref: Uint8Array, got: Uint8Array, width: number, height: number, opaqueTarget: boolean): { maxTile: number; mean: number } {
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
  for (let t = 0; t < n; t++) if (cnt[t]! >= area[t]! / 4 && cnt[t]! > 0) maxTile = Math.max(maxTile, sum[t]! / cnt[t]!);
  return { maxTile, mean: used > 0 ? total / used : 0 };
}

export interface TempoCheckRequest extends FfmpegOptions {
  exportPath: string;
  versionDir: string;
  /** Новый fps / fps версии. */
  factor: number;
  /** Число кадров экспорта. */
  exportFrames: number;
  /** Размер стоп-кадров версии (полное разрешение настроек): кадр экспорта масштабируется к нему. */
  width: number;
  height: number;
  /** Файл экспорта без альфы (H.264). */
  opaque: boolean;
  threshold?: number;
}

/**
 * Сверка темпа: кадры экспорта round(n·k) (одним проходом ffmpeg) против стоп-кадров версии.
 * Ошибки ffmpeg — `FfmpegError` (с `run` процессы в реестре попытки, отмена — `signal`).
 */
export async function tempoCheck(req: TempoCheckRequest): Promise<TempoCheck> {
  const threshold = req.threshold ?? TEMPO_TILE_THRESHOLD;
  const stills = await listStills(req.versionDir);
  const pairs = stills.map((frame) => ({ frame, exportFrame: Math.min(req.exportFrames - 1, Math.round(frame * req.factor)) }));
  const wanted = [...new Set(pairs.map((p) => p.exportFrame))].sort((a, b) => a - b);
  const out: TempoCheck = { factor: req.factor, threshold, samples: [], mismatched: [] };
  if (pairs.length === 0) return out;
  const { width: w, height: h } = req;
  const size = w * h * 4;
  const dir = await scratchDir(req, "tempo");
  try {
    const exp = join(dir, "export.rgba");
    const select = wanted.map((n) => `eq(n\\,${n})`).join("+");
    await runFfmpeg([
      "-v", "error", "-nostdin", "-y", "-i", req.exportPath,
      "-vf", `select=${select},scale=${w}:${h}:flags=bicubic`,
      "-fps_mode", "passthrough", "-frames:v", String(wanted.length),
      "-pix_fmt", "rgba", "-f", "rawvideo", exp,
    ], dir, req);
    const frames = await readFile(exp);
    if (frames.length < wanted.length * size) throw new Error(`сверка темпа: в ${req.exportPath} нет кадров ${wanted.join(", ")} (получено ${Math.floor(frames.length / size)})`);
    for (const p of pairs) {
      const still = join(dir, `still-${p.frame}.rgba`);
      await runFfmpeg([
        "-v", "error", "-nostdin", "-y", "-i", join(req.versionDir, "frames", `${p.frame}.png`),
        "-vf", `scale=${w}:${h}:flags=bicubic`, "-frames:v", "1", "-pix_fmt", "rgba", "-f", "rawvideo", still,
      ], dir, req);
      const ref = await readFile(still);
      if (ref.length < size) throw new Error(`сверка темпа: стоп-кадр ${p.frame} не прочитан`);
      const k = wanted.indexOf(p.exportFrame);
      const d = tempoDelta(ref, frames.subarray(k * size, (k + 1) * size), w, h, req.opaque);
      const sample = { ...p, maxTile: round4(d.maxTile), mean: round4(d.mean) };
      out.samples.push(sample);
      if (d.maxTile > threshold) out.mismatched.push(p.frame);
    }
    return out;
  } finally {
    await removeScratch(dir);
  }
}

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
