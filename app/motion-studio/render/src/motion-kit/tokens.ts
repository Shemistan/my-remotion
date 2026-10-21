// Производные токены StyleBible: цвет, тени, размеры, safe area, интенсивность.
// Компоненты kit берут оформление только отсюда — сцена меняет стиль одним пресетом.
import type { StyleBible } from "@ms/contracts";
import { safeRect } from "./choreo/safe-area.js";

export { type Intensity, intensityScale } from "./style/intensity.js";
export { typeSize } from "./style/type-scale.js";

export type FontRef = StyleBible["typography"]["display"];

export type Elevation = 0 | 1 | 2 | 3;

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

function parseHex(c: string): [number, number, number] | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return undefined;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((ch) => ch + ch).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const hex2 = (v: number) => clampInt(v, 0, 255).toString(16).padStart(2, "0");

/** Цвет с прозрачностью: hex → rgba, прочие CSS-цвета — через color-mix. */
export function alpha(color: string, a: number): string {
  const rgb = parseHex(color);
  const k = Math.max(0, Math.min(1, a));
  if (rgb) return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Number(k.toFixed(3))})`;
  return `color-mix(in srgb, ${color} ${Number((k * 100).toFixed(1))}%, transparent)`;
}

/** Смешение a → b на долю t (hex); прочие цвета — color-mix. */
export function mix(a: string, b: string, t: number): string {
  const ra = parseHex(a);
  const rb = parseHex(b);
  const k = Math.max(0, Math.min(1, t));
  if (ra && rb) return `#${hex2(ra[0] + (rb[0] - ra[0]) * k)}${hex2(ra[1] + (rb[1] - ra[1]) * k)}${hex2(ra[2] + (rb[2] - ra[2]) * k)}`;
  return `color-mix(in srgb, ${a} ${Number(((1 - k) * 100).toFixed(1))}%, ${b})`;
}

/** Относительная яркость hex-цвета 0..1 (для неизвестных форматов — 0). */
export function luminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Тёмная тема: фон темнее середины. */
export const isDark = (s: StyleBible) => luminance(s.palette.bg) < 0.2;

/** Акцент по индексу (по кругу: палитра может быть переопределена короче). */
export const accent = (s: StyleBible, i = 0) => s.palette.accent[((i % s.palette.accent.length) + s.palette.accent.length) % s.palette.accent.length]!;

/** CSS box-shadow уровня 0..3 (зажим). */
export function shadow(s: StyleBible, elevation: number): string {
  const list = s.surfaces.elevation;
  if (list.length === 0) return "none";
  return list[clampInt(elevation, 0, list.length - 1)]!;
}

/** Радиус уровня (0 — мелкие элементы, 3 — крупные карточки). */
export function radius(s: StyleBible, level: number): number {
  const list = s.surfaces.radius;
  if (list.length === 0) return 0;
  return list[clampInt(level, 0, list.length - 1)]!;
}

/**
 * Цвет поверхности на высоте: на тёмной теме светлее с высотой; на светлой уровень 0 —
 * «вдавлен» к цвету фона, выше — чистая поверхность (глубину дают тени).
 */
export function surfaceAt(s: StyleBible, elevation: number): string {
  const e = clampInt(elevation, 0, 3);
  return isDark(s) ? mix(s.palette.surface, s.palette.text, [0, 0.035, 0.08, 0.12][e]!) : mix(s.palette.surface, s.palette.bg, [0.55, 0, 0, 0][e]!);
}

/** CSS font-family для FontRef: локальный шрифт kit + системный запасной. */
export function fontFamily(ref: FontRef): string {
  const generic = /mono/i.test(ref.family) ? "ui-monospace, monospace" : "system-ui, sans-serif";
  return `"${ref.family}", ${generic}`;
}

/** Трекинг роли (em). */
export const tracking = (s: StyleBible, role: string) => s.typography.tracking[role] ?? 0;

/** Отступ: n долей gutter сетки. */
export const space = (s: StyleBible, n = 1) => s.grid.gutter * n;

/** Прямоугольник в px в стиле CSS (v0.1); новая раскладка — `Rect` { x, y, w, h }. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Безопасная зона кадра в пикселях по StyleBible (расчёт — safeRect). */
export function safeAreaPx(s: StyleBible, width: number, height: number): Box {
  const r = safeRect({ width, height, safe_area: s.grid.safe_area });
  return { left: r.x, top: r.y, width: r.w, height: r.h };
}

