// Безопасные зоны кадра (Task 30): занятые области по детектору (лицо, руки, человек без лица)
// и свободная доля зон размещения анимации. Координаты — доли кадра, начало слева сверху.
// Лицо считает код (Apple Vision), не LLM; агент может только добавить занятые области
// (`footage-merge.ts`).
import { type NormRect, type Zone, ZONE_RECTS } from "@ms/contracts";
import type { VisionFrame } from "./vision.js";

/** Округление координат до 1e-6: без хвостов плавающей точки (0.48750000000000004). */
export const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Прямоугольник, обрезанный кадром [0,1]²; пустой — `undefined`. */
export function clipRect(r: { x: number; y: number; w: number; h: number }): NormRect | undefined {
  const x0 = r6(Math.max(0, r.x));
  const y0 = r6(Math.max(0, r.y));
  const x1 = r6(Math.min(1, r.x + r.w));
  const y1 = r6(Math.min(1, r.y + r.h));
  if (!(x1 > x0) || !(y1 > y0)) return undefined;
  return { x: x0, y: y0, w: r6(x1 - x0), h: r6(y1 - y0) };
}

/** Расширение на долю `m` своего размера с каждой стороны, обрезка кадром. */
export function expandRect(r: NormRect, m: number): NormRect | undefined {
  return clipRect({ x: r.x - r.w * m, y: r.y - r.h * m, w: r.w * (1 + 2 * m), h: r.h * (1 + 2 * m) });
}

/** Охватывающий прямоугольник. */
export function bboxOf(rs: readonly NormRect[]): NormRect | undefined {
  if (rs.length === 0) return undefined;
  const x0 = Math.min(...rs.map((r) => r.x));
  const y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w));
  const y1 = Math.max(...rs.map((r) => r.y + r.h));
  return clipRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}

function intersect(a: NormRect, b: NormRect): NormRect | undefined {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : undefined;
}

/** Площадь объединения прямоугольников (сжатие координат; без двойного счёта перекрытий). */
export function unionArea(rs: readonly NormRect[]): number {
  if (rs.length === 0) return 0;
  const xs = [...new Set(rs.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i]!;
    const b = xs[i + 1]!;
    const mid = (a + b) / 2;
    const ys = rs.filter((r) => r.x <= mid && mid < r.x + r.w).map((r) => [r.y, r.y + r.h] as const).sort((p, q) => p[0] - q[0]);
    let cov = 0;
    let cur: [number, number] | undefined;
    for (const [s, e] of ys) {
      if (!cur || s > cur[1]) {
        if (cur) cov += cur[1] - cur[0];
        cur = [s, e];
      } else cur[1] = Math.max(cur[1], e);
    }
    if (cur) cov += cur[1] - cur[0];
    area += cov * (b - a);
  }
  return area;
}

/** Геометрия зон размещения — в `@ms/contracts` (общая с UI). */
export { ZONE_RECTS };

/** Зоны, которые оцениваются по умолчанию. */
export const DEFAULT_ZONES: Zone[] = ["left_third", "right_third", "top_band", "lower_third"];

/** Свободная доля зоны: `1 − area(∪ occupied ∩ zone) / area(zone)`. */
export function freeZones(occupied: readonly NormRect[], zones: Zone[] = DEFAULT_ZONES): { zone: Zone; rect: NormRect; free_ratio: number }[] {
  return zones.map((zone) => {
    const rect = ZONE_RECTS[zone];
    const inside = occupied.map((o) => intersect(o, rect)).filter((x): x is NormRect => x !== undefined);
    const free = 1 - unionArea(inside) / (rect.w * rect.h);
    return { zone, rect, free_ratio: Math.min(1, Math.max(0, Math.round(free * 1e6) / 1e6)) };
  });
}

export interface OccupiedOptions {
  /** Поле вокруг лица, доля размера рамки с каждой стороны (`planning.faceMargin`). */
  faceMargin: number;
  handMargin: number;
  /** Лицо найдено на меньшей доле кадров шота — пометка неуверенности. */
  minDetectRatio: number;
  /** Шум детектора рук: рамка меньше этой доли площади крупнейшего лица кадра отбрасывается. */
  handMinFaceShare: number;
  /** Шум детектора рук: рамка меньше этой доли кадра отбрасывается (и без лица). */
  handMinArea: number;
}

export const OCCUPIED_DEFAULTS: OccupiedOptions = { faceMargin: 0.25, handMargin: 0.1, minDetectRatio: 0.3, handMinFaceShare: 0.25, handMinArea: 0.002 };

/**
 * Руки кадра без шума детектора (прогон на реальном ролике: «рука» 0,016×0,03 у картины на
 * стене): рамка < `handMinFaceShare` площади крупнейшего лица кадра или < `handMinArea` кадра.
 */
export function handsOf<T extends NormRect>(f: { faces: readonly NormRect[]; hands: readonly T[] }, o: OccupiedOptions): T[] {
  const face = Math.max(0, ...f.faces.map((d) => d.w * d.h));
  const min = Math.max(o.handMinArea, face * o.handMinFaceShare);
  return f.hands.filter((h) => h.w * h.h >= min);
}

export interface OccupiedRegions {
  /** Объединение лиц шота (каждое расширено на `faceMargin`). */
  face?: NormRect;
  hands?: NormRect;
  /** Человек без лица ни на одном кадре шота (занят, с пометкой). */
  body?: NormRect;
  faceRatio: number;
  handsRatio: number;
  occupied: NormRect[];
  uncertain: string[];
}

export const UNCERTAIN_FACE_RARE = (o: OccupiedOptions): string => `лицо найдено менее чем на ${Math.round(o.minDetectRatio * 100)} % кадров`;
export const UNCERTAIN_BODY_NO_FACE = "человек в кадре без лица";

/**
 * Занятые области шота по кадрам детектора: лица и руки расширяются каждое на своё поле и
 * объединяются охватывающей рамкой по всем кадрам шота (лицо двигается — рамка покрывает все
 * положения). Человек без лица ни на одном кадре (спиной, вполоборота) — его рамка тоже
 * занята, с пометкой. Салиентность не занимает места (подсказка агенту). Шум рук отсеян
 * (`handsOf`). Это худший случай за весь шот; по времени — `windowOccupancy`.
 */
export function occupiedRegions(frames: readonly VisionFrame[], o: OccupiedOptions = OCCUPIED_DEFAULTS): OccupiedRegions {
  const n = frames.length;
  const faces = frames.flatMap((f) => f.faces.map((d) => expandRect(d, o.faceMargin))).filter((x): x is NormRect => x !== undefined);
  const faceRatio = n === 0 ? 0 : frames.filter((f) => f.faces.length > 0).length / n;
  const handsRatio = n === 0 ? 0 : frames.filter((f) => handsOf(f, o).length > 0).length / n;
  const face = bboxOf(faces);
  const handsBox = handsBoxOf(frames, o);
  const occupied: NormRect[] = [];
  const uncertain: string[] = [];
  let body: NormRect | undefined;
  if (face) occupied.push(face);
  if (handsBox) occupied.push(handsBox);
  if (face && faceRatio < o.minDetectRatio) uncertain.push(UNCERTAIN_FACE_RARE(o));
  if (!face) {
    body = bboxOf(frames.flatMap((f) => f.humans.map((d) => clipRect(d))).filter((x): x is NormRect => x !== undefined));
    if (body) {
      occupied.push(body);
      uncertain.push(UNCERTAIN_BODY_NO_FACE);
    }
  }
  return { ...(face ? { face } : {}), ...(handsBox ? { hands: handsBox } : {}), ...(body ? { body } : {}), faceRatio, handsRatio, occupied, uncertain };
}

/** Охватывающая рамка рук кадров (каждая без шума и расширена на `handMargin`). */
function handsBoxOf(frames: readonly VisionFrame[], o: OccupiedOptions): NormRect | undefined {
  return bboxOf(frames.flatMap((f) => handsOf(f, o).map((d) => expandRect(d, o.handMargin))).filter((x): x is NormRect => x !== undefined));
}

/** Окна ~`windowUs`: шот делится на `max(1, round(длина / windowUs))` равных окон без зазоров. */
export function timeWindows(startUs: number, endUs: number, windowUs: number): { start_us: number; end_us: number }[] {
  const dur = endUs - startUs;
  if (!(dur > 0)) return [];
  const n = Math.max(1, Math.round(dur / Math.max(1, windowUs)));
  return Array.from({ length: n }, (_, k) => ({ start_us: startUs + Math.round((k * dur) / n), end_us: startUs + Math.round(((k + 1) * dur) / n) }));
}

export type FreeZone = ReturnType<typeof freeZones>[number];

export interface OccupancyWindow {
  start_us: number;
  end_us: number;
  occupied: NormRect[];
  hands?: NormRect;
  free_zones: FreeZone[];
}

function sameRect(a: NormRect, b: NormRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** Объединение списков рамок без повторов (порядок первого появления). */
export function dedupRects(rs: readonly NormRect[]): NormRect[] {
  const out: NormRect[] = [];
  for (const r of rs) if (!out.some((x) => sameRect(x, r))) out.push(r);
  return out;
}

type TimedFrame = { us: number; frame: VisionFrame };

/**
 * Занятость по окнам времени шота (прогон на реальном ролике: автор жестикулирует обеими руками,
 * рамка рук за весь шот закрывала кадр целиком, хотя в каждый момент руки занимают малую часть).
 * Руки — охватывающая рамка только кадров окна; окно без кадров берёт ближайшие кадры до и после
 * (между ключевыми кадрами руки неизвестны — консервативно). `fixed` (лицо, человек без лица,
 * важные объекты — по всему шоту) занят в каждом окне.
 */
export function windowOccupancy(
  shot: { start_us: number; end_us: number },
  frames: readonly TimedFrame[],
  fixed: readonly NormRect[],
  o: OccupiedOptions & { windowUs: number },
  zones: Zone[] = DEFAULT_ZONES,
): OccupancyWindow[] {
  const sorted = [...frames].sort((a, b) => a.us - b.us);
  return timeWindows(shot.start_us, shot.end_us, o.windowUs).map((w) => {
    let inside = sorted.filter((f) => f.us >= w.start_us && f.us < w.end_us);
    if (inside.length === 0) {
      const before = sorted.filter((f) => f.us < w.start_us).at(-1);
      const after = sorted.find((f) => f.us >= w.end_us);
      inside = [before, after].filter((x): x is TimedFrame => x !== undefined);
    }
    const hands = handsBoxOf(inside.map((f) => f.frame), o);
    const occupied = dedupRects([...fixed, ...(hands ? [hands] : [])]);
    return { ...w, occupied, ...(hands ? { hands } : {}), free_zones: freeZones(occupied, zones) };
  });
}

/**
 * Занятость кадра на интервале исходника `[startUs, endUs)` в пределах шота (Task 32: графика
 * сцены живёт на интервале): объединение `occupied` окон, пересекающих интервал, и свободные
 * зоны по нему. Окон нет или интервал вне окон — худший случай шота (`occupied`/`free_zones`).
 */
export function occupancyForRange(
  shot: { windows: readonly { start_us: number; end_us: number; occupied: readonly NormRect[] }[]; occupied: readonly NormRect[]; free_zones: readonly FreeZone[] },
  startUs: number,
  endUs: number,
  zones: Zone[] = DEFAULT_ZONES,
): { occupied: NormRect[]; free_zones: FreeZone[] } {
  const hit = shot.windows.filter((w) => w.start_us < endUs && startUs < w.end_us);
  if (hit.length === 0) return { occupied: [...shot.occupied], free_zones: [...shot.free_zones] };
  const occupied = dedupRects(hit.flatMap((w) => w.occupied));
  return { occupied, free_zones: freeZones(occupied, zones) };
}
