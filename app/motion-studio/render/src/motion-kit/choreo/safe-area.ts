// Безопасная зона кадра в px — общий расчёт для SafeArea, раскладки и QA.
import type { Settings } from "@ms/contracts";

/** Прямоугольник в px: левый верхний угол и размер. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Поля — доли ширины и высоты кадра (округление до px), зона симметрична. */
export function safeRect(settings: Pick<Settings, "width" | "height" | "safe_area">): Rect {
  const x = Math.round(settings.width * settings.safe_area.x);
  const y = Math.round(settings.height * settings.safe_area.y);
  return { x, y, w: settings.width - 2 * x, h: settings.height - 2 * y };
}
