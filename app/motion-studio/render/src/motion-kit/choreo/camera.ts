// Камера сцены: ключи { frame, scale, x, y } (MotionSpec.camera) → положение в кадре.
// Движение — по кривой emphasis стиля без перелёта: камера не «отскакивает».
import type { CameraKey } from "@ms/contracts";
import { Easing } from "remotion";
import type { ResolvedStyle } from "../style/resolve.js";
import { type Hold, holdAt } from "./hold.js";

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

/** Размер кадра композиции, px. */
export interface FrameSize {
  width: number;
  height: number;
}

/**
 * Наезд и панорама с размером кадра — по одной оси (`half` — половина кадра, `margin` —
 * поле safe area, px; точка слоя p попадает в s·(p − x)). Край safe area после наезда
 * остаётся внутри кадра хотя бы на половину поля: s·(half − margin + |x|) ≤ half − margin/2.
 */
export function zoomLimit(half: number, margin: number): number {
  return margin > 0 ? (half - margin / 2) / (half - margin) : 1;
}

/**
 * Предел панорамы при масштабе `scale`: не больше запаса слоя во весь кадр (overscan
 * `half·(1 − 1/s)` — иначе открылся бы край фона, Task 13: полосы сверху и справа) и не
 * больше остатка поля safe area (иначе заголовок у края обрезался бы: «ыручка»). Без
 * масштаба запаса нет: панорама при scale = 1 невозможна.
 */
export function panLimit(scale: number, half: number, margin: number): number {
  const overscan = half * (1 - 1 / scale);
  const safe = (half - margin / 2) / scale - (half - margin);
  return Math.max(0, Math.min(overscan, safe));
}

/**
 * Положение камеры в кадре. С `size` (у `<Camera>` — всегда) наезд ограничен `zoomLimit`,
 * панорама — `panLimit`: слой во весь кадр всегда покрывает кадр, safe area не подходит к
 * краю ближе половины поля. Без `size` — сырые ключи (только `max_scale` стиля).
 */
export function cameraAt(
  frame: number,
  keys: CameraKey[],
  style: Pick<ResolvedStyle, "motion" | "camera"> & Partial<Pick<ResolvedStyle, "grid">>,
  size?: FrameSize,
): CameraState {
  const safe = style.grid?.safe_area ?? { x: 0, y: 0 };
  const axes = size
    ? [
        { half: size.width / 2, margin: safe.x * size.width },
        { half: size.height / 2, margin: safe.y * size.height },
      ]
    : [];
  const maxScale = Math.min(style.camera.max_scale, ...axes.map((a) => zoomLimit(a.half, a.margin)));
  const clampScale = (v: number) => (style.camera.allow_zoom ? Math.max(1, Math.min(maxScale, v)) : 1);
  const sorted = [...keys].sort((a, b) => a.frame - b.frame);
  if (sorted.length === 0) return { ...REST };
  const fit = (c: CameraState): CameraState => {
    if (!size) return c;
    const [lx, ly] = axes.map((a) => panLimit(c.scale, a.half, a.margin)) as [number, number];
    // +0 вместо -0: покой камеры — ровно { scale: 1, x: 0, y: 0 }
    return { scale: c.scale, x: Math.max(-lx, Math.min(lx, c.x)) + 0, y: Math.max(-ly, Math.min(ly, c.y)) + 0 };
  };
  const fin = (k: CameraKey) => fit({ scale: clampScale(k.scale), x: k.x, y: k.y });
  if (frame <= sorted[0]!.frame) return fin(sorted[0]!);
  const last = sorted.at(-1)!;
  if (frame >= last.frame) return fin(last);
  let i = 0;
  while (sorted[i + 1]!.frame <= frame) i++;
  const a = sorted[i]!;
  const b = sorted[i + 1]!;
  const t = cameraEase(style)((frame - a.frame) / (b.frame - a.frame));
  const lerp = (u: number, v: number) => u + (v - u) * t;
  return fit({ scale: clampScale(lerp(a.scale, b.scale)), x: lerp(a.x, b.x), y: lerp(a.y, b.y) });
}

/** Множитель движения слоя параллакса: 0 — как камера, 2 — на 30 % сильнее (ближе к зрителю). */
export const parallaxFactor = (layer: number) => 1 + 0.15 * layer;

/** Запас слоя параллакса > 0 за край кадра, px: край не открывается и не мерцает сглаживанием. */
export const PARALLAX_OVERSCAN = 3;

/**
 * Трансформация слоя внутри <Camera>: вместе с камерой слой движется как камера с
 * множителем parallaxFactor(layer). CSS: `translate(x, y) scale(scale)`, origin — центр.
 * С `size` слой > 0 при нужде чуть крупнее (overscan): слой во весь кадр покрывает кадр
 * с запасом PARALLAX_OVERSCAN px — иначе при панораме у предела край ближнего слоя
 * открывался бы на 1–3 px (он едет сильнее камеры). Слой 0 — ровно камера.
 */
export function parallaxTransform(cam: CameraState, layer: number, size?: FrameSize): CameraState {
  const k = parallaxFactor(layer);
  let sk = 1 + (cam.scale - 1) * k;
  if (size && layer > 0 && cam.scale > 1) {
    // итог слоя: точка q (от центра) → sk·(q − k·x); край half + запас должен быть за кадром.
    // Запас набирается за первый 1 % наезда: в покое слой ровно кадр, без скачка на старте
    const pad = PARALLAX_OVERSCAN * Math.min(1, (cam.scale - 1) / 0.01);
    const cover = (half: number, off: number) => (half + pad) / Math.max(1, half - k * Math.abs(off));
    sk = Math.max(sk, cover(size.width / 2, cam.x), cover(size.height / 2, cam.y));
  }
  const r = sk / cam.scale;
  return { scale: r, x: cam.x - r * cam.x * k, y: cam.y - r * cam.y * k };
}

/** CSS-трансформация камеры (origin — центр кадра): точка (x, y) едет к центру. */
export function cameraTransform(cam: CameraState): string {
  return `translate(${(-cam.scale * cam.x).toFixed(3)}px, ${(-cam.scale * cam.y).toFixed(3)}px) scale(${cam.scale.toFixed(5)})`;
}

/** settle-push: доля наезда удержания сверх камеры spec (не больше остатка до предела). */
export const SETTLE_PUSH = 0.04;

/**
 * Камера с финалом settle-push (0.5.0): поверх ключей spec в удержании идёт медленный
 * наезд ещё на SETTLE_PUSH (не дальше предела стиля и safe area) к точке `focus` (px от
 * центра; по умолчанию — куда смотрит камера) — ровно до последнего кадра, без
 * торможения в ноль. Другие режимы и без удержания — `cameraAt` как есть.
 */
export function cameraHoldAt(
  frame: number,
  keys: CameraKey[],
  style: Pick<ResolvedStyle, "motion" | "camera"> & Partial<Pick<ResolvedStyle, "grid">>,
  size: FrameSize,
  hold: (Hold & { focus?: { x: number; y: number } }) | undefined,
  end: number,
): CameraState {
  const cam = cameraAt(frame, keys, style, size);
  if (!hold || hold.mode !== "settle-push" || !style.camera.allow_zoom) return cam;
  const h = holdAt(frame, hold, style as ResolvedStyle, end);
  if (!h.on) return cam;
  const base = cameraAt(hold.beat.start_frame, keys, style, size);
  const fx = hold.focus?.x ?? base.x;
  const fy = hold.focus?.y ?? base.y;
  const scale = cam.scale + SETTLE_PUSH * h.push;
  // точка взгляда плавно уходит к фокусу вместе с наездом; зажим — как у ключа камеры
  return cameraAt(0, [{ frame: 0, scale, x: cam.x + (fx - cam.x) * h.push, y: cam.y + (fy - cam.y) * h.push }], style, size);
}
