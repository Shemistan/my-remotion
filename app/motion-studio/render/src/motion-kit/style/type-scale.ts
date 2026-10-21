// Типографская шкала от высоты кадра: один и тот же уровень читается одинаково в 16:9,
// 9:16 и 1:1. Старая форма typeSize(style, шаг) — шаг шкалы StyleBible в px при 1080.
import type { StyleBible } from "@ms/contracts";

export type TypeLevel = "display" | "h1" | "h2" | "body" | "caption";

/** Доли высоты кадра по уровням. */
export const TYPE_LEVELS: Readonly<Record<TypeLevel, number>> = {
  display: 0.11,
  h1: 0.075,
  h2: 0.055,
  body: 0.042,
  caption: 0.03,
};

export function typeSize(style: StyleBible, level: TypeLevel, frameHeight: number): number;
/** @deprecated v0.1: шаг шкалы StyleBible (px при 1080) — бери уровень и высоту кадра. */
export function typeSize(style: StyleBible, step: number): number;
export function typeSize(style: StyleBible, level: TypeLevel | number, frameHeight?: number): number {
  if (typeof level === "number") {
    const list = style.typography.scale;
    return list[Math.max(0, Math.min(list.length - 1, Math.round(level)))]!;
  }
  const k = TYPE_LEVELS[level];
  if (k === undefined) throw new RangeError(`неизвестный уровень шкалы: ${String(level)}`);
  if (!(typeof frameHeight === "number" && frameHeight > 0)) throw new RangeError(`typeSize: нужна высота кадра > 0, получено ${frameHeight}`);
  return Math.round(frameHeight * k);
}

/**
 * Кегль текста компонента по его `size`: уровень шкалы — от высоты кадра, шаг шкалы v0.1
 * (0..8) — px при 1080, число > 8 — кегль в px. Общий для KineticText и AnimatedNumber.
 */
export function sizePx(style: StyleBible, size: TypeLevel | number, frameHeight: number): number {
  if (typeof size === "string") return typeSize(style, size, frameHeight);
  return size > 8 ? size : typeSize(style, size);
}
