// Безопасная зона: всё содержимое сцены — внутри неё (поля из StyleBible.grid.safe_area).
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { useStyle } from "../style.js";
import { type Rect, safeAreaPx } from "../tokens.js";

/** Прямоугольник безопасной зоны текущего кадра, px. */
export function useSafeArea(): Rect {
  const s = useStyle();
  const { width, height } = useVideoConfig();
  return safeAreaPx(s, width, height);
}

export function SafeArea({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  const r = useSafeArea();
  return <AbsoluteFill style={{ padding: `${r.top}px ${r.left}px`, boxSizing: "border-box", ...style }}>{children}</AbsoluteFill>;
}
