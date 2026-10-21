// Реестр раскладки (0.4.0), чистая часть: свод видимого текста кадра. Компоненты kit метят
// свой текст `data-ms-layout="<роль>"` (token, label, status, text, number); текст сцены без
// метки — отдельные элементы с ролью `scene`. Мерит DOM и печатает строку
// `[motion-kit:layout] {frame, height, items, ghosts}` проба рендера на QA-кадрах
// (render/src/probe/layout-probe.tsx — код пайплайна, не сцены); QA (server/src/qa/layout.ts)
// превращает её в text_overlap, token_on_label, ghost_text и min_font.

export const LAYOUT_TAG = "[motion-kit:layout]";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Текстовый элемент кадра: прямой текст одного DOM-элемента. */
export interface RawText {
  /** Владелец — ближайший предок с data-ms-layout (null — текст сцены). */
  owner: string | null;
  role: string;
  text: string;
  rect: Box;
  /** Кегль в px кадра (с учётом масштаба камеры). */
  fontPx: number;
  /** Итоговая прозрачность (произведение по предкам). */
  opacity: number;
}

export interface LayoutItem {
  id: string;
  role: string;
  text: string;
  rect: Box;
  fontPx: number;
  opacity: number;
}

export interface LayoutFrame {
  frame: number;
  height: number;
  items: LayoutItem[];
  /** Повторы одного текста друг на друге в кадре («призраки» следа). */
  ghosts: { text: string; count: number }[];
}

/** Ниже этой прозрачности текст не считается видимым (силуэты, приглушённый кикер, уходящий статус). */
export const VISIBLE_OPACITY = 0.35;

const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);
export function intersect(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}
const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Свод кадра (чистая функция): видимый текст по владельцам (прямоугольник — объединение,
 * кегль — наименьший, текст — склейка) и «призраки» — один и тот же текст, видимый дважды и
 * больше с перекрытием ≥ 30 % (след из копий карточки).
 */
export function summarizeLayout(frame: number, height: number, raw: RawText[]): LayoutFrame {
  const vis = raw.filter((r) => r.opacity >= VISIBLE_OPACITY && area(r.rect) > 0 && r.text.trim() !== "");
  const groups = new Map<string, LayoutItem>();
  vis.forEach((r, i) => {
    const id = r.owner ?? `${r.role}#${i}`;
    const g = groups.get(id);
    if (!g) groups.set(id, { id, role: r.role, text: r.text.trim(), rect: r.rect, fontPx: r.fontPx, opacity: r.opacity });
    else {
      g.rect = union(g.rect, r.rect);
      g.fontPx = Math.min(g.fontPx, r.fontPx);
      g.opacity = Math.max(g.opacity, r.opacity);
      // буквы набора — без пробелов между ними, слова и строки — через пробел
      const t = r.text.trim();
      if (g.text.length < 80) g.text = `${g.text}${t.length > 1 && !g.text.endsWith(" ") ? " " : ""}${t}`.slice(0, 80);
    }
  });
  const ghosts = new Map<string, number>();
  for (let i = 0; i < vis.length; i++) {
    const a = vis[i]!;
    const t = a.text.trim();
    if (t.length < 2) continue;
    let n = 1;
    for (let j = i + 1; j < vis.length; j++) {
      const b = vis[j]!;
      if (b.text.trim() !== t) continue;
      if (intersect(a.rect, b.rect) >= 0.3 * Math.min(area(a.rect), area(b.rect))) n++;
    }
    if (n > 1) ghosts.set(t, Math.max(ghosts.get(t) ?? 0, n));
  }
  const items = [...groups.values()].map((g) => ({ ...g, rect: { x: r1(g.rect.x), y: r1(g.rect.y), w: r1(g.rect.w), h: r1(g.rect.h) }, fontPx: r1(g.fontPx), opacity: r1(g.opacity) }));
  return { frame, height, items, ghosts: [...ghosts].map(([text, count]) => ({ text, count })) };
}
