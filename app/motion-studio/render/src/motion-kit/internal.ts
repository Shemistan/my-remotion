// Мелкие помощники компонентов kit (не экспортируются из index).
import { useId } from "react";

/** Опции interpolate по кадру: всегда clamp (по умолчанию Remotion — extend). */
export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** id для SVG (градиенты, фильтры): useId без символов, ломающих url(#…). */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
