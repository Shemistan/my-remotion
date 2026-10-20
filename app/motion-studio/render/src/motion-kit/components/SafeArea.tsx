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
    <AbsoluteFill style={{ padding: `${r.top}px ${r.left}px`, boxSizing: "border-box", ...outer }}>
      <div style={inner}>{children}</div>
    </AbsoluteFill>
  );
}
