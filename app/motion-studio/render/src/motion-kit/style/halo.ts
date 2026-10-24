// Ореол текста в transparent-режиме (S6, Р18): сцена без фона ложится поверх видео, и текст
// должен читаться и на светлом, и на тёмном кадре — вокруг глифов тень цвета palette.bg.
// Без transparent ничего не меняется.
import type { CSSProperties } from "react";
import { alpha } from "../tokens.js";
import type { ResolvedStyle } from "./resolve.js";

/** CSS-переменная ореола: компоненты со своей тенью добавляют её через `withHalo`. */
export const HALO_VAR = "--ms-halo";

/**
 * Ореол текста (transparent): плотный контур у глифа, мягкий ореол вокруг и широкая слабая
 * подложка — в em, растёт с кеглем. Без transparent — `undefined`.
 */
export function textHalo(s: ResolvedStyle): string | undefined {
  if (!s.transparent) return undefined;
  const bg = s.palette.bg;
  return `0 0 0.05em ${alpha(bg, 0.85)}, 0 0 0.18em ${alpha(bg, 0.65)}, 0 0.02em 0.5em ${alpha(bg, 0.4)}`;
}

/**
 * Стиль слоя-обёртки StyleProvider (transparent): `display: contents` — бокса нет, раскладка
 * сцены та же; `text-shadow` наследуется всем текстом сцены (и тексту кода Engineer). Без
 * transparent — `null`: обёртки нет, DOM прежний.
 */
export function haloLayerStyle(s: ResolvedStyle): CSSProperties | null {
  const h = textHalo(s);
  if (!h) return null;
  return { display: "contents", textShadow: h, [HALO_VAR]: h } as CSSProperties;
}

/** Своя тень компонента вместе с ореолом (свой `text-shadow` иначе гасит наследуемый). */
export function withHalo(s: ResolvedStyle, shadow: string | undefined): string | undefined {
  if (!s.transparent) return shadow;
  return shadow ? `var(${HALO_VAR}), ${shadow}` : `var(${HALO_VAR})`;
}

/** Сброс ореола в слое с прозрачными глифами (силуэт кадра-постера): иначе видны тени без букв. */
export const NO_HALO = { textShadow: "none", [HALO_VAR]: "0 0 0 transparent" } as CSSProperties;
