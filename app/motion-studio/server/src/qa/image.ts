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

/**
 * Яркость Y' (Rec. 709 по гамма-кодированным каналам, 0..1): среднее и стандартное
 * отклонение. Не линейная яркость: на тёмных пресетах линеаризация сжимает весь кадр к
 * нулю, и кадр с текстом выглядел бы однотонным. Прозрачные пиксели — как над чёрным.
 */
export function lumaStats(img: Img): { mean: number; std: number } {
  const d = img.data;
  const n = img.width * img.height;
  let sum = 0;
  let sq = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = ((0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255) * (d[i + 3]! / 255);
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

/** Фон: один цвет или цвет фона в точке. */
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

export type Edge = "top" | "right" | "bottom" | "left";
export const EDGES: readonly Edge[] = ["top", "right", "bottom", "left"];

/** Пиксель края: `i` — вдоль края, `d` — глубина от края внутрь кадра. */
function edgeGeometry(img: Img, edge: Edge): { length: number; at: (i: number, d: number) => number } {
  const { width: w, height: h } = img;
  const idx = (x: number, y: number) => (y * w + x) * 4;
  switch (edge) {
    case "top": return { length: w, at: (i, d) => idx(i, d) };
    case "bottom": return { length: w, at: (i, d) => idx(i, h - 1 - d) };
    case "left": return { length: h, at: (i, d) => idx(d, i) };
    case "right": return { length: h, at: (i, d) => idx(w - 1 - d, i) };
  }
}

const median = (v: number[]) => {
  v.sort((a, b) => a - b);
  return v[Math.floor((v.length - 1) / 2)]!;
};

/** Скачок цвета профиля края между точками через одну (доля 0..1): граница объекта, а не свет фона. */
const EDGE_JUMP = 0.08;
/** Участок профиля, отличающийся от цвета углов кадра больше, — объект, даже если касается угла. */
const EDGE_BG_LOOSE = 0.35;
/** Сглаживание фона вдоль края (окно медианы, бинов): тонкие линии фона. */
const EDGE_BG_SMOOTH = 4;

const maxDiff = (a: RGB, b: RGB) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

/**
 * Фон вдоль края по полю за безопасной зоной, устойчивый к крупным объектам.
 * 1. Профиль: в каждой точке края — медиана по глубине поля (`margin` px от края).
 * 2. Профиль режется на участки по скачкам цвета (> 0,08 через одну точку): у объекта
 *    резкие границы, у света aurora и виньетки — нет.
 * 3. Фон — участки, которые доходят до угла кадра (конца края) и по цвету близки к углам
 *    кадра `ref` (≤ 0,35): плавный свет фона связан с углом без скачков. Участок посередине
 *    между скачками — объект любой длины (карточка 600 px, график, карточка в поле).
 * 4. На участках объектов фон — линейно между соседними участками фона; фона на крае нет
 *    совсем (объект во весь край) — `ref`.
 */
export function edgeBackground(img: Img, edge: Edge, margin: number, ref: RGB = backgroundEstimate(img)): RGB[] {
  const g = edgeGeometry(img, edge);
  const depth = Math.max(1, Math.min(margin, edge === "top" || edge === "bottom" ? img.height : img.width));
  const dStep = Math.max(1, Math.floor(depth / 32));
  const bin = Math.max(1, Math.round(g.length / 480));
  const bins = Math.ceil(g.length / bin);
  const profile: RGB[] = [];
  for (let k = 0; k < bins; k++) {
    const ch: number[][] = [[], [], []];
    for (let i = k * bin; i < Math.min(g.length, (k + 1) * bin); i++) {
      for (let d = 0; d < depth; d += dStep) {
        const p = g.at(i, d);
        for (let c = 0; c < 3; c++) ch[c]!.push(img.data[p + c]!);
      }
    }
    profile.push(ch.map(median) as RGB);
  }

  // участки между скачками; бины на скачке — ничьи
  const jump = EDGE_JUMP * 255;
  const cut = new Array<boolean>(bins).fill(false);
  for (let k = 2; k < bins; k++) {
    if (maxDiff(profile[k]!, profile[k - 2]!) > jump) cut[k] = cut[k - 1] = true;
  }
  const segs: [number, number][] = [];
  for (let k = 0; k < bins; ) {
    if (cut[k]) {
      k++;
      continue;
    }
    let j = k;
    while (j < bins && !cut[j]) j++;
    segs.push([k, j]);
    k = j;
  }
  const isBg = new Array<boolean>(bins).fill(false);
  const loose = EDGE_BG_LOOSE * 255;
  for (const [a, b] of segs) {
    if (a !== 0 && b !== bins) continue;
    const mid = [0, 1, 2].map((c) => median(profile.slice(a, b).map((p) => p[c]!))) as RGB;
    if (maxDiff(mid, ref) <= loose) for (let k = a; k < b; k++) isBg[k] = true;
  }

  // фон: сглаженный профиль на участках фона, между ними — интерполяция
  const bgIdx = isBg.flatMap((v, k) => (v ? [k] : []));
  const smooth = (k: number): RGB => {
    const win = profile.slice(Math.max(0, k - EDGE_BG_SMOOTH), Math.min(bins, k + EDGE_BG_SMOOTH + 1)).filter((_, n) => isBg[Math.max(0, k - EDGE_BG_SMOOTH) + n]);
    return [0, 1, 2].map((c) => median(win.map((p) => p[c]!))) as RGB;
  };
  const out: RGB[] = new Array(bins);
  for (const k of bgIdx) out[k] = smooth(k);
  for (let k = 0; k < bins; k++) {
    if (isBg[k]) continue;
    if (bgIdx.length === 0) {
      out[k] = ref;
      continue;
    }
    let lo = -1;
    let hi = -1;
    for (const n of bgIdx) {
      if (n < k) lo = n;
      else if (hi < 0) hi = n;
    }
    const L = lo >= 0 ? out[lo]! : undefined;
    const H = hi >= 0 ? out[hi]! : undefined;
    out[k] = L && H ? ([0, 1, 2].map((c) => L[c]! + ((H[c]! - L[c]!) * (k - lo)) / (hi - lo)) as RGB) : (L ?? H)!;
  }
  return Array.from({ length: g.length }, (_, i) => out[Math.min(bins - 1, Math.floor(i / bin))]!);
}

/** Полоса у края и глубины проверки «чернила продолжаются внутрь», px. */
const EDGE_STRIP = 2;
const INWARD = [2, 3, 4];

/**
 * Обрезка по краю: доля длины края, занятая «сплошными» чернилами — непрерывными отрезками
 * вдоль края, где объект есть в полосе 2 px у края. Отрезок засчитывается, если
 * - в нём есть участок не короче `minRun` (0,4 % края), где объект продолжается на 2–4 px
 *   внутрь (обрезанный штрих, плашка), или
 * - он сам длинный (≥ 1,5 % края, не меньше 10 px): край срезал выпуклость буквы по касательной.
 * Тонкие линии фона (сетка пола), пересекающие край, дают короткие отрезки и внутрь не
 * продолжаются; линия вдоль самого края — тоже.
 */
export function edgeClip(img: Img, edge: Edge, bg: RGB[], threshold = INK_THRESHOLD): { fraction: number; longest: number } {
  const g = edgeGeometry(img, edge);
  const t255 = threshold * 255;
  const ink = (i: number, d: number) => isInk(img.data, g.at(i, d), bg[i]!, t255);
  const minRun = Math.max(3, Math.round(g.length * 0.004));
  const longRun = Math.max(10, Math.round(g.length * 0.015));
  // 0 — нет, 1 — объект в полосе у края, 2 — и продолжается внутрь
  const level = Array.from({ length: g.length }, (_, i) => {
    for (let d = 0; d < EDGE_STRIP; d++) if (!ink(i, d)) return 0;
    return INWARD.filter((d) => ink(i, d)).length >= 2 ? 2 : 1;
  });
  let total = 0;
  let longest = 0;
  for (let i = 0; i < g.length; ) {
    if (level[i] === 0) {
      i++;
      continue;
    }
    let j = i;
    let solid = 0;
    let deep = 0;
    let best = 0;
    for (; j < g.length && level[j]! > 0; j++) {
      deep = level[j] === 2 ? deep + 1 : 0;
      best = Math.max(best, deep);
      solid += level[j] === 2 ? 1 : 0;
    }
    const len = j - i;
    longest = Math.max(longest, len);
    if (len >= longRun) total += len;
    else if (best >= minRun) total += solid;
    i = j;
  }
  return { fraction: total / g.length, longest };
}

/** Уменьшение усреднением блоков k×k (RGBA). */
export function downsample(img: Img, k: number): Img {
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
