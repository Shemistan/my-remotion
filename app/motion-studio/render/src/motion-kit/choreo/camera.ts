// Камера сцены: ключи { frame, scale, x, y } (MotionSpec.camera) → положение в кадре.
// Движение — по кривой emphasis стиля без перелёта: камера не «отскакивает».
import type { CameraKey } from "@ms/contracts";
import { Easing } from "remotion";
import type { ResolvedStyle } from "../style/resolve.js";

/** Ключ камеры (MotionSpec.camera): наезд scale и точка интереса x, y — px от центра кадра. */
export type { CameraKey };

export interface CameraState {
  scale: number;
  x: number;
  y: number;
}

const REST: CameraState = { scale: 1, x: 0, y: 0 };
const c01 = (v: number) => Math.max(0, Math.min(1, v));

/** Кривая emphasis стиля с зажатыми в [0, 1] ординатами: характер роли, но монотонно. */
function cameraEase(style: Pick<ResolvedStyle, "motion">): (t: number) => number {
  const [a, b, c, d] = style.motion.easing.emphasis;
  return Easing.bezier(a, c01(b), c, c01(d));
}

export function cameraAt(frame: number, keys: CameraKey[], style: Pick<ResolvedStyle, "motion" | "camera">): CameraState {
  const clampScale = (v: number) => (style.camera.allow_zoom ? Math.max(1, Math.min(style.camera.max_scale, v)) : 1);
  const sorted = [...keys].sort((a, b) => a.frame - b.frame);
  if (sorted.length === 0) return { ...REST };
  const fin = (k: CameraKey) => ({ scale: clampScale(k.scale), x: k.x, y: k.y });
  if (frame <= sorted[0]!.frame) return fin(sorted[0]!);
  const last = sorted.at(-1)!;
  if (frame >= last.frame) return fin(last);
  let i = 0;
  while (sorted[i + 1]!.frame <= frame) i++;
  const a = sorted[i]!;
  const b = sorted[i + 1]!;
  const t = cameraEase(style)((frame - a.frame) / (b.frame - a.frame));
  const lerp = (u: number, v: number) => u + (v - u) * t;
  return { scale: clampScale(lerp(a.scale, b.scale)), x: lerp(a.x, b.x), y: lerp(a.y, b.y) };
}

/** Множитель движения слоя параллакса: 0 — как камера, 2 — на 30 % сильнее (ближе к зрителю). */
export const parallaxFactor = (layer: number) => 1 + 0.15 * layer;

/**
 * Трансформация слоя внутри <Camera>: вместе с камерой слой движется как камера с
 * множителем parallaxFactor(layer). CSS: `translate(x, y) scale(scale)`, origin — центр.
 */
export function parallaxTransform(cam: CameraState, layer: number): CameraState {
  const k = parallaxFactor(layer);
  const sk = 1 + (cam.scale - 1) * k;
  const r = sk / cam.scale;
  return { scale: r, x: cam.x - r * cam.x * k, y: cam.y - r * cam.y * k };
}

/** CSS-трансформация камеры (origin — центр кадра): точка (x, y) едет к центру. */
export function cameraTransform(cam: CameraState): string {
  return `translate(${(-cam.scale * cam.x).toFixed(3)}px, ${(-cam.scale * cam.y).toFixed(3)}px) scale(${cam.scale.toFixed(5)})`;
}
