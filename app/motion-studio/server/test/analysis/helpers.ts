// Кадры детектора для юнит-тестов анализа видеоряда (координаты — сверху слева).
import type { NormRect } from "@ms/contracts";
import type { VisionFrame } from "../../src/analysis/vision.js";

const empty = (k: number): VisionFrame => ({ path: `/d/frames/${k}.png`, width: 640, height: 360, faces: [], humans: [], hands: [], saliency: [] });

/** `total` кадров (по умолчанию `n`), лицо `face` — на первых `n`. */
export function framesWithFace(face: NormRect, n: number, o: { total?: number } = {}): VisionFrame[] {
  return Array.from({ length: o.total ?? n }, (_, k) => ({ ...empty(k), faces: k < n ? [{ ...face, confidence: 0.95 }] : [] }));
}

/** `n` кадров с рукой `hand` и без лица. */
export function framesWithHands(hand: NormRect, n: number): VisionFrame[] {
  return Array.from({ length: n }, (_, k) => ({ ...empty(k), hands: [{ ...hand, confidence: 0.8 }] }));
}
