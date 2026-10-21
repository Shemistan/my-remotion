// Пиксельные примитивы QA по реальным кадрам (PNG renderStill). Только чтение, без LLM.
import { readFile } from "node:fs/promises";
import type { Rect } from "@ms/render";
import { PNG } from "pngjs";

/** Кадр: RGBA по 8 бит, строки подряд. */
export interface Img {
  width: number;
  height: number;
  data: Uint8Array;
}
export type RGB = [number, number, number];

/** Порог «чернил»: отличие от фона по худшему каналу, доля 0..1. */
export const INK_THRESHOLD = 0.12;

/** PNG любого цветового типа приводится к RGBA (pngjs нормализует при чтении). */
export async function loadPng(path: string): Promise<Img> {
  const png = PNG.sync.read(await readFile(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength) };
}

// sRGB → линейная яркость: таблица на 256 значений
const LINEAR = Float64Array.from({ length: 256 }, (_, v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/**
 * Относительная яркость пикселей (WCAG, 0..1): среднее и стандартное отклонение.
 * Прозрачные пиксели — как над чёрным фоном.
 */
export function lumaStats(img: Img): { mean: number; std: number } {
  const d = img.data;
  const n = img.width * img.height;
  let sum = 0;
  let sq = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = (0.2126 * LINEAR[d[i]!]! + 0.7152 * LINEAR[d[i + 1]!]! + 0.0722 * LINEAR[d[i + 2]!]!) * (d[i + 3]! / 255);
    sum += y;
    sq += y * y;
  }
  const mean = sum / n;
  return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
}

function sameSize(a: Img, b: Img): void {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`qa: кадры разного размера: ${a.width}×${a.height} и ${b.width}×${b.height}`);
  }
}

/** Средняя абсолютная разница RGB по всему кадру, 0..1. */
export function frameDelta(a: Img, b: Img): number {
  sameSize(a, b);
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    sum += Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!);
  }
  return sum / (a.width * a.height * 3 * 255);
}

/** Цвет фона: медиана по каналам пикселей четырёх угловых патчей 8×8. */
export function backgroundEstimate(img: Img): RGB {
  const p = Math.min(8, img.width, img.height);
  const ch: number[][] = [[], [], []];
  for (const [x0, y0] of [[0, 0], [img.width - p, 0], [0, img.height - p], [img.width - p, img.height - p]] as const) {
    for (let y = y0; y < y0 + p; y++) {
      for (let x = x0; x < x0 + p; x++) {
        const i = (y * img.width + x) * 4;
        for (let c = 0; c < 3; c++) ch[c]!.push(img.data[i + c]!);
      }
    }
  }
  return ch.map((v) => {
    v.sort((a, b) => a - b);
    return v[Math.floor((v.length - 1) / 2)]!;
  }) as RGB;
}

/** Пиксель отличается от фона больше порога (худший канал). */
function isInk(d: Uint8Array, i: number, bg: RGB, t255: number): boolean {
  return Math.abs(d[i]! - bg[0]) > t255 || Math.abs(d[i + 1]! - bg[1]) > t255 || Math.abs(d[i + 2]! - bg[2]) > t255;
}

/** Фон: один цвет или цвет фона в точке (модель `backgroundModel`). */
export type Bg = RGB | ((x: number, y: number) => RGB);

/** Пикселей «чернил» в области (обрезается по кадру) и всего пикселей в ней. */
export function inkCount(img: Img, region: Rect, bg: Bg, threshold = INK_THRESHOLD): { ink: number; total: number } {
  const x0 = Math.max(0, Math.round(region.x));
  const y0 = Math.max(0, Math.round(region.y));
  const x1 = Math.min(img.width, Math.round(region.x + region.w));
  const y1 = Math.min(img.height, Math.round(region.y + region.h));
  const t255 = threshold * 255;
  let ink = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) if (isInk(img.data, (y * img.width + x) * 4, typeof bg === "function" ? bg(x, y) : bg, t255)) ink++;
  }
  return { ink, total: Math.max(0, x1 - x0) * Math.max(0, y1 - y0) };
}

/** Доля пикселей области, отличающихся от фона больше порога; пустая область — 0. */
export function inkFraction(img: Img, region: Rect, bg: Bg, threshold = INK_THRESHOLD): number {
  const { ink, total } = inkCount(img, region, bg, threshold);
  return total === 0 ? 0 : ink / total;
}

/** Узлов сетки модели фона по каждой оси; окно медианы узла — четверть кадра. */
const BG_GRID = 8;
const BG_WINDOW = 0.25;

/**
 * Модель фона с плавными градиентами (aurora, виньетка, световые пятна): медианы по
 * каналам в окнах ¼ × ¼ кадра вокруг узлов сетки 8 × 8, между узлами — билинейно.
 * Объект, занимающий меньше половины окна (текст, карточка, обрезанная строка), в
 * медиану не попадает и остаётся «чернилами»; плавный свет фона — нет.
 */
export function backgroundModel(img: Img): (x: number, y: number) => RGB {
  const { width: w, height: h } = img;
  const hw = Math.max(1, Math.round((w * BG_WINDOW) / 2));
  const hh = Math.max(1, Math.round((h * BG_WINDOW) / 2));
  const step = Math.max(1, Math.round(Math.min(w, h) / 270)); // прореживание пикселей окна
  const node = (gx: number, gy: number): RGB => {
    const cx = Math.round((gx * (w - 1)) / (BG_GRID - 1));
    const cy = Math.round((gy * (h - 1)) / (BG_GRID - 1));
    const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    let n = 0;
    for (let y = Math.max(0, cy - hh); y < Math.min(h, cy + hh + 1); y += step) {
      for (let x = Math.max(0, cx - hw); x < Math.min(w, cx + hw + 1); x += step) {
        const i = (y * w + x) * 4;
        hist[0]![img.data[i]!]!++;
        hist[1]![img.data[i + 1]!]!++;
        hist[2]![img.data[i + 2]!]!++;
        n++;
      }
    }
    return hist.map((hc) => {
      let acc = 0;
      for (let v = 0; v < 256; v++) if ((acc += hc[v]!) * 2 >= n) return v;
      return 255;
    }) as RGB;
  };
  const grid: RGB[][] = Array.from({ length: BG_GRID }, (_, gy) => Array.from({ length: BG_GRID }, (_, gx) => node(gx, gy)));
  return (x, y) => {
    const fx = (x / Math.max(1, w - 1)) * (BG_GRID - 1);
    const fy = (y / Math.max(1, h - 1)) * (BG_GRID - 1);
    const x0 = Math.min(BG_GRID - 2, Math.floor(fx));
    const y0 = Math.min(BG_GRID - 2, Math.floor(fy));
    const tx = fx - x0;
    const ty = fy - y0;
    const [a, b, c, d] = [grid[y0]![x0]!, grid[y0]![x0 + 1]!, grid[y0 + 1]![x0]!, grid[y0 + 1]![x0 + 1]!];
    return [0, 1, 2].map((k) => (a[k]! * (1 - tx) + b[k]! * tx) * (1 - ty) + (c[k]! * (1 - tx) + d[k]! * tx) * ty) as RGB;
  };
}

/** Уменьшение усреднением блоков k×k (RGBA). */
function downsample(img: Img, k: number): Img {
  if (k <= 1) return img;
  const w = Math.floor(img.width / k);
  const h = Math.floor(img.height / k);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0, 0];
      for (let yy = 0; yy < k; yy++) {
        for (let xx = 0; xx < k; xx++) {
          const i = ((y * k + yy) * img.width + x * k + xx) * 4;
          for (let c = 0; c < 4; c++) acc[c]! += img.data[i + c]!;
        }
      }
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] = Math.round(acc[c]! / (k * k));
    }
  }
  return { width: w, height: h, data: out };
}

/** Ширина, до которой уменьшаются кадры для objectDelta. */
const OBJECT_DELTA_WIDTH = 480;
/** Поиск общего сдвига камеры: ± доля ширины кадра. */
const MAX_SHIFT = 0.015;

/**
 * Изменение объектов между кадрами без общего дрейфа камеры и фона: кадры уменьшаются
 * до ~480 px; пиксели, где оба кадра — фон (отличие от своего `backgroundEstimate` не
 * больше порога), не считаются; из сдвигов кадра b на ±1,5 % ширины берётся лучший.
 * Нормировка как у frameDelta — на все пиксели области сравнения, 0..1.
 */
export function objectDelta(a: Img, b: Img): number {
  sameSize(a, b);
  const k = Math.max(1, Math.round(a.width / OBJECT_DELTA_WIDTH));
  const A = downsample(a, k);
  const B = downsample(b, k);
  const bgA = backgroundEstimate(A);
  const bgB = backgroundEstimate(B);
  const t255 = INK_THRESHOLD * 255;
  const s = Math.max(1, Math.round(A.width * MAX_SHIFT));
  let best = Infinity;
  for (let dy = -s; dy <= s; dy++) {
    for (let dx = -s; dx <= s; dx++) {
      let sum = 0;
      let n = 0;
      for (let y = Math.max(0, -dy); y < Math.min(A.height, A.height - dy); y++) {
        for (let x = Math.max(0, -dx); x < Math.min(A.width, A.width - dx); x++) {
          n++;
          const i = (y * A.width + x) * 4;
          const j = ((y + dy) * B.width + x + dx) * 4;
          if (!isInk(A.data, i, bgA, t255) && !isInk(B.data, j, bgB, t255)) continue;
          sum += Math.abs(A.data[i]! - B.data[j]!) + Math.abs(A.data[i + 1]! - B.data[j + 1]!) + Math.abs(A.data[i + 2]! - B.data[j + 2]!);
        }
      }
      if (n > 0) best = Math.min(best, sum / (n * 3 * 255));
      if (best === 0) return 0;
    }
  }
  return best === Infinity ? 0 : best;
}
