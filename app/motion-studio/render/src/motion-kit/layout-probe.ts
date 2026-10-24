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
  /** Ключ DOM-элемента (S2-fix2): строки и узлы одного элемента друг с другом не сравниваются. */
  el?: string;
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
  /** Ключ DOM-элемента текста сцены без владельца (см. RawText.el). */
  el?: string;
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
  /**
   * Режимы удержания, которые в этом кадре ведёт hold engine (`useHold` носителей kit и своих
   * слоёв, S3-fix): пусто — финал не на hold engine. Нет поля — проба старого kit.
   */
  holds?: string[];
  /** Контейнеры kit с признаком содержимого (0.5.5); нет поля — проба старого kit. */
  boxes?: LayoutBox[];
  /** Доли кадра под текстом и под графикой (0.5.5, `areaShares`). */
  areas?: { text: number; graphic: number };
}

/**
 * Метки hold engine для пробы (S3-fix I3, S3-fix2): носитель движения финала (импульс
 * steady-flow в пути, волна now-pulse героя, повтор repeat-result, блик data-shimmer, наезд
 * settle-push, `useHold` своего слоя) отмечает режим, когда в этом кадре он и правда ведёт
 * финал. Пиксели N−20…N−1 не отличают «дышит только ореол узла» от волны now-pulse — отличает
 * то, что финал ведёт kit. Метки привязаны к кадру: обёртка пробы объявляет кадр рендера
 * (`beginHoldFrame`), метки ложатся в него, проба читает метки своего кадра — поддерево,
 * которое React не перерисовал в этом коммите (memo), не стирает метки кадра.
 */
// состояние модуля: проба и kit — один бандл, один экземпляр модуля (без глобалов окружения)
const marks: { frame: number | null; byFrame: Map<number, Set<string>> } = { frame: null, byFrame: new Map() };
/** Кадр рендера (обёртка пробы): метки других кадров отбрасываются, метки этого — остаются. */
export function beginHoldFrame(frame: number): void {
  for (const f of [...marks.byFrame.keys()]) if (f !== frame) marks.byFrame.delete(f);
  marks.frame = frame;
}
/** Полный сброс (тесты; вне пробы меток нет). */
export function resetHoldMarks(): void {
  marks.frame = null;
  marks.byFrame.clear();
}
export function markHold(mode: string): void {
  if (marks.frame === null) return;
  const set = marks.byFrame.get(marks.frame) ?? new Set<string>();
  set.add(mode);
  marks.byFrame.set(marks.frame, set);
}
/** Режимы кадра `frame` (по умолчанию — объявленного), по алфавиту. */
export function holdMarks(frame: number | null = marks.frame): string[] {
  const set = frame === null ? undefined : marks.byFrame.get(frame);
  return set ? [...set].sort() : [];
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
    if (!g) groups.set(id, { id, role: r.role, ...(r.owner === null && r.el ? { el: r.el } : {}), text: r.text.trim(), rect: r.rect, fontPx: r.fontPx, opacity: r.opacity });
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
      if (b.text.trim() !== t || (a.el !== undefined && a.el === b.el)) continue;
      if (intersect(a.rect, b.rect) >= 0.3 * Math.min(area(a.rect), area(b.rect))) n++;
    }
    if (n > 1) ghosts.set(t, Math.max(ghosts.get(t) ?? 0, n));
  }
  const items = [...groups.values()].map((g) => ({ ...g, rect: { x: r1(g.rect.x), y: r1(g.rect.y), w: r1(g.rect.w), h: r1(g.rect.h) }, fontPx: r1(g.fontPx), opacity: r1(g.opacity) }));
  return { frame, height, items, ghosts: [...ghosts].map(([text, count]) => ({ text, count })) };
}

/**
 * Контейнер kit (0.5.5, S14): корень с `data-ms-box` (карточка, узел графа, панель сравнения).
 * `graphic` — внутри есть svg/img/canvas заметного размера (≥ 6 % площади контейнера).
 */
export interface RawBox {
  id: string;
  kind: string;
  rect: Box;
  /** Итоговая прозрачность (произведение по предкам). */
  opacity: number;
  graphic: boolean;
}

/** Контейнер в реестре: `filled` — внутри видимый текст или графика. */
export interface LayoutBox {
  id: string;
  kind: string;
  rect: Box;
  filled: boolean;
  graphic: boolean;
}

/** Контейнер меньше этой доли кадра — деталь (маркер, чип), не рамка под содержимое. */
export const BOX_MIN_SHARE = 0.004;

const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const inside = (p: { x: number; y: number }, b: Box) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

/** Видимые контейнеры кадра (чистая функция): пустой — ни текста (центр строки внутри), ни графики. */
export function summarizeBoxes(raw: RawBox[], items: LayoutItem[], frame: { w: number; h: number }): LayoutBox[] {
  const min = BOX_MIN_SHARE * frame.w * frame.h;
  return raw
    .filter((b) => b.opacity >= VISIBLE_OPACITY && area(b.rect) >= min)
    .map((b) => ({
      id: b.id, kind: b.kind, graphic: b.graphic,
      rect: { x: r1(b.rect.x), y: r1(b.rect.y), w: r1(b.rect.w), h: r1(b.rect.h) },
      filled: b.graphic || items.some((it) => inside(center(it.rect), b.rect)),
    }));
}

/** Крупное число (герой hero-number) — графика кадра, а не подпись: кегль ≥ этой доли высоты. */
export const HERO_NUMBER_SHARE = 0.1;
/** Сетка подсчёта долей площади: клеток по ширине (по высоте — в пропорции кадра). */
const GRID_W = 96;

/**
 * Доли кадра под текстом и под графикой (0.5.5, S14; чистая функция): клетки сетки, которые
 * накрывают строки текста и контейнеры только с текстом, — текст; svg/img/canvas сцены (без
 * фона), контейнеры с графикой и крупное число — графика (клетка графики текстом не
 * считается). Перекрытия не удваиваются.
 */
export function areaShares(items: LayoutItem[], boxes: LayoutBox[], graphics: Box[], frame: { w: number; h: number }): { text: number; graphic: number } {
  const gw = GRID_W;
  const gh = Math.max(1, Math.round((GRID_W * frame.h) / Math.max(1, frame.w)));
  const cw = frame.w / gw;
  const ch = frame.h / gh;
  const cells = new Uint8Array(gw * gh);
  const mark = (b: Box, v: 1 | 2) => {
    const x0 = Math.max(0, Math.floor(b.x / cw));
    const y0 = Math.max(0, Math.floor(b.y / ch));
    const x1 = Math.min(gw, Math.ceil((b.x + b.w) / cw));
    const y1 = Math.min(gh, Math.ceil((b.y + b.h) / ch));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cells[y * gw + x] = Math.max(cells[y * gw + x]!, v) as 1 | 2;
  };
  const big = (it: LayoutItem) => it.role === "number" && it.fontPx >= HERO_NUMBER_SHARE * frame.h;
  for (const it of items) mark(it.rect, big(it) ? 2 : 1);
  // узел графа — часть схемы (графика), карточка и панель с одним текстом — текст
  for (const b of boxes) if (b.filled || b.kind === "node") mark(b.rect, b.graphic || b.kind === "node" ? 2 : 1);
  for (const g of graphics) mark(g, 2);
  let t = 0;
  let g = 0;
  for (const c of cells) {
    if (c === 1) t++;
    else if (c === 2) g++;
  }
  const n = gw * gh;
  return { text: Math.round((t / n) * 1000) / 1000, graphic: Math.round((g / n) * 1000) / 1000 };
}

/** Прямоугольник строки текста в координатах окна (DOMRect / ClientRect). */
export interface LineRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Элементы реестра одного текстового узла (чистая функция, S2-fix2 N3): по прямоугольнику на
 * строку (`range.getClientRects()`), а не один общий. Узел, начатый посреди строки и
 * перенесённый, общим прямоугольником накрывал всю ширину обеих строк — и соседний узел той
 * же строки (ложный text_overlap). Пустые прямоугольники пропускаются.
 */
export function textLineItems(base: Omit<RawText, "text" | "rect">, text: string, rects: Iterable<LineRect>, origin: { x: number; y: number }): RawText[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  const out: RawText[] = [];
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) continue;
    out.push({ ...base, text: t, rect: { x: r.left - origin.x, y: r.top - origin.y, w: r.width, h: r.height } });
  }
  return out;
}
