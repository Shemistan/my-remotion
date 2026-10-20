// Контраст по WCAG 2.x: программная проверка палитры (пресеты, правки палитры, QA).

function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new RangeError(`контраст считается только для hex-цвета: ${hex}`);
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((ch) => ch + ch).join("");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Относительная яркость WCAG 2.x (0 — чёрный, 1 — белый). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Контраст двух цветов 1..21 (порядок не важен). */
export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
