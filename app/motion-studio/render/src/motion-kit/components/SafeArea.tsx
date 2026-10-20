// Безопасная зона: всё содержимое сцены — внутри неё (поля из StyleBible.grid.safe_area).
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { type Rect, safeRect } from "../choreo/safe-area.js";
import { useStyle } from "../style.js";
import type { Box } from "../tokens.js";

/**
 * Безопасная зона текущего кадра, px: `{ x, y, w, h }` (как safeRect) и те же числа в
 * CSS-форме `{ left, top, width, height }`. Поля — `grid.safe_area` разрешённого стиля
 * (resolveStyle берёт их из настроек сцены).
 */
export function useSafeArea(): Rect & Box {
  const s = useStyle();
  const { width, height } = useVideoConfig();
  const r = safeRect({ width, height, safe_area: s.grid.safe_area });
  return { ...r, left: r.x, top: r.y, width: r.w, height: r.h };
}

/** Свойства раскладки детей: уходят во внутренний блок, а не во внешний слой с полями. */
const LAYOUT_KEYS = [
  "display", "flexDirection", "flexWrap", "justifyContent", "alignItems", "alignContent",
  "gap", "rowGap", "columnGap", "gridTemplateColumns", "gridTemplateRows", "gridAutoFlow", "placeItems", "placeContent",
] as const;

/**
 * Поля — padding внешнего слоя; дети лежат во внутреннем `position: relative` блоке
 * размером с безопасную зону. Без него `AbsoluteFill` и `position: absolute` внутри
 * отсчитывались бы от края кадра (padding box), а не от безопасной зоны. Внутренний блок —
 * flex-колонка, как `AbsoluteFill`; свойства раскладки из `style` (`justifyContent`,
 * `alignItems`, `flexDirection`, `gap`…) применяются к нему, остальное — к внешнему слою.
 */
export function SafeArea({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  const r = useSafeArea();
  const outer: CSSProperties = { ...style };
  const inner: CSSProperties = { position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" };
  for (const k of LAYOUT_KEYS) {
    if (style && k in style) {
      (inner as Record<string, unknown>)[k] = style[k];
      delete (outer as Record<string, unknown>)[k];
    }
  }
  return (
    <AbsoluteFill style={{ padding: `${r.y}px ${r.x}px`, boxSizing: "border-box", ...outer }}>
      <div style={inner}>{children}</div>
    </AbsoluteFill>
  );
}
