// Ореол текста в transparent-режиме (S6, Р18): сцена без фона ложится поверх видео, и текст
// должен читаться и на светлом, и на тёмном кадре — вокруг глифов тень цвета palette.bg.
// Без transparent ничего не меняется.
import type { CSSProperties } from "react";
import { alpha, mix } from "../tokens.js";
import type { ResolvedStyle } from "./resolve.js";

/** CSS-переменная ореола: компоненты со своей тенью добавляют её через `withHalo`. */
export const HALO_VAR = "--ms-halo";

/**
 * Ореол текста (transparent): плотный контур у глифа (0.08em, 0.9 — подписи и основной текст
 * держат край и на пёстром кадре), мягкий ореол вокруг и широкая слабая подложка — в em,
 * растёт с кеглем. Без transparent — `undefined`.
 */
export function textHalo(s: ResolvedStyle): string | undefined {
  if (!s.transparent) return undefined;
  const bg = s.palette.bg;
  return `0 0 0.08em ${alpha(bg, 0.9)}, 0 0 0.18em ${alpha(bg, 0.65)}, 0 0.02em 0.5em ${alpha(bg, 0.4)}`;
}

/**
 * Приглушение текста на долю `amount` (0..1). В transparent — цветом к `palette.muted`, opacity 1:
 * opacity гасит и ореол, а сдвиг к `palette.bg` слил бы глиф с ореолом того же цвета (поверх
 * видео приглушённый текст терял бы край); `muted` — нижняя граница приглушения. Без
 * transparent — как было: цвет тот же, opacity `1 − amount`.
 */
export function dimText(s: ResolvedStyle, color: string, amount: number): { color: string; opacity: number } {
  if (amount <= 0) return { color, opacity: 1 };
  return s.transparent ? { color: mix(color, s.palette.muted, amount), opacity: 1 } : { color, opacity: 1 - amount };
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
