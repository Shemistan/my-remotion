// Контраст WCAG 2 для правки палитры в UI (Task 33): та же формула, что `contrastRatio` motion-kit
// (сервер проверяет стиль при сохранении сам; здесь — мгновенная подсказка при выборе цвета).

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** `#rgb` / `#rrggbb` → относительная яркость; не hex — `undefined`. */
export function luminance(hex: string): number | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

/** Контраст двух цветов (1…21); не hex — `undefined`. */
export function contrast(a: string, b: string): number | undefined {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === undefined || lb === undefined) return undefined;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
