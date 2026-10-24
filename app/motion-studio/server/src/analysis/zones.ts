// Безопасные зоны кадра (Task 30): занятые области по детектору (лицо, руки, человек без лица)
// и свободная доля зон размещения анимации. Координаты — доли кадра, начало слева сверху.
// Лицо считает код (Apple Vision), не LLM; агент может только добавить занятые области
// (`footage-merge.ts`).
import type { NormRect, Zone } from "@ms/contracts";
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

const PIP = 0.3;
const PIP_MARGIN = 0.04;

/** Геометрия зон размещения (план Task 30). */
export const ZONE_RECTS: Record<Zone, NormRect> = {
  left_third: { x: 0.04, y: 0.08, w: 0.30, h: 0.84 },
  right_third: { x: 0.66, y: 0.08, w: 0.30, h: 0.84 },
  top_band: { x: 0.04, y: 0.04, w: 0.92, h: 0.22 },
  lower_third: { x: 0.04, y: 0.70, w: 0.92, h: 0.24 },
  full: { x: 0, y: 0, w: 1, h: 1 },
  split_left: { x: 0, y: 0, w: 0.5, h: 1 },
  split_right: { x: 0.5, y: 0, w: 0.5, h: 1 },
  pip_tl: { x: PIP_MARGIN, y: PIP_MARGIN, w: PIP, h: PIP },
  pip_tr: { x: r6(1 - PIP_MARGIN - PIP), y: PIP_MARGIN, w: PIP, h: PIP },
  pip_bl: { x: PIP_MARGIN, y: r6(1 - PIP_MARGIN - PIP), w: PIP, h: PIP },
  pip_br: { x: r6(1 - PIP_MARGIN - PIP), y: r6(1 - PIP_MARGIN - PIP), w: PIP, h: PIP },
};

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
}

export const OCCUPIED_DEFAULTS: OccupiedOptions = { faceMargin: 0.25, handMargin: 0.1, minDetectRatio: 0.3 };

export interface OccupiedRegions {
  /** Объединение лиц шота (каждое расширено на `faceMargin`). */
  face?: NormRect;
  hands?: NormRect;
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
 * занята, с пометкой. Салиентность не занимает места (подсказка агенту).
 */
export function occupiedRegions(frames: readonly VisionFrame[], o: OccupiedOptions = OCCUPIED_DEFAULTS): OccupiedRegions {
  const n = frames.length;
  const faces = frames.flatMap((f) => f.faces.map((d) => expandRect(d, o.faceMargin))).filter((x): x is NormRect => x !== undefined);
  const hands = frames.flatMap((f) => f.hands.map((d) => expandRect(d, o.handMargin))).filter((x): x is NormRect => x !== undefined);
  const faceRatio = n === 0 ? 0 : frames.filter((f) => f.faces.length > 0).length / n;
  const handsRatio = n === 0 ? 0 : frames.filter((f) => f.hands.length > 0).length / n;
  const face = bboxOf(faces);
  const handsBox = bboxOf(hands);
  const occupied: NormRect[] = [];
  const uncertain: string[] = [];
  if (face) occupied.push(face);
  if (handsBox) occupied.push(handsBox);
  if (face && faceRatio < o.minDetectRatio) uncertain.push(UNCERTAIN_FACE_RARE(o));
  if (!face) {
    const body = bboxOf(frames.flatMap((f) => f.humans.map((d) => clipRect(d))).filter((x): x is NormRect => x !== undefined));
    if (body) {
      occupied.push(body);
      uncertain.push(UNCERTAIN_BODY_NO_FACE);
    }
  }
  return { ...(face ? { face } : {}), ...(handsBox ? { hands: handsBox } : {}), faceRatio, handsRatio, occupied, uncertain };
}
