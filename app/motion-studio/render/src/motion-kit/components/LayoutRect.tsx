// Прямоугольник графики видеосцены (motion-kit 0.5.9, Р-V5): сцена видеопроекта рендерится на
// весь кадр (поверх видео — прозрачно), а рисует только внутри `props.layout.rect` — зоны плана.
// Без rect — весь кадр: вид существующих сцен не меняется.
import { type CSSProperties, type ReactNode, createContext, useContext } from "react";
import { useVideoConfig } from "remotion";

/** Прямоугольник в долях кадра (`NormRect` контрактов): `x + w ≤ 1`, `y + h ≤ 1`. */
export interface LayoutNormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Прямоугольник в px кадра. */
export interface LayoutRectPx {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Доли кадра → px: края округляются к целому пикселю по отдельности (соседние зоны стыкуются
 * без зазора); нет rect — весь кадр.
 */
export function layoutRectPx(rect: LayoutNormRect | undefined, width: number, height: number): LayoutRectPx {
  if (!rect) return { left: 0, top: 0, width, height };
  const left = Math.round(rect.x * width);
  const top = Math.round(rect.y * height);
  return { left, top, width: Math.round((rect.x + rect.w) * width) - left, height: Math.round((rect.y + rect.h) * height) - top };
}

const LayoutRectContext = createContext<LayoutRectPx | null>(null);

/** Прямоугольник графики, px: внутри `<LayoutRect>` — его размер, вне — весь кадр. */
export function useLayoutRect(): LayoutRectPx {
  const inner = useContext(LayoutRectContext);
  const { width, height } = useVideoConfig();
  return inner ?? { left: 0, top: 0, width, height };
}

/**
 * Абсолютный контейнер по `rect` (обычно `props.layout?.rect`): дети отсчитываются от его края,
 * `useLayoutRect()` внутри даёт его размер. Содержимое не обрезается — выход графики за rect
 * ловит проверка кадров (`outside_zone`).
 */
export function LayoutRect({ rect, children, style }: { rect?: LayoutNormRect; children?: ReactNode; style?: CSSProperties }) {
  const { width, height } = useVideoConfig();
  const px = layoutRectPx(rect, width, height);
  return (
    <LayoutRectContext.Provider value={px}>
      <div data-ms-layout-rect="true" style={{ position: "absolute", left: px.left, top: px.top, width: px.width, height: px.height, ...style }}>
        {children}
      </div>
    </LayoutRectContext.Provider>
  );
}
