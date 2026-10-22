// Раскладка узла FlowGraph (0.4.0, чистые функции): зоны внутри и вокруг карточки —
// подпись, полоса данных (slot / inbox), место статуса — и облик по роли узла (`kind`).
// Зоны не пересекаются: токен, легший в узел, и статус у узла не закрывают подпись.
import type { StyleBible } from "@ms/contracts";
import type { Rect } from "../choreo/safe-area.js";
import { type CubicSegment, edgeSegment } from "../geometry.js";
import { typeSize } from "../style/type-scale.js";
import { space } from "../tokens.js";

/**
 * Роль узла — свой облик: `service` — карточка (по умолчанию), `queue` — горизонтальный
 * буфер FIFO с ячейками (вход слева, выход справа), `store` — цилиндр хранилища, `cache` —
 * сетка ячеек-ключей, заполняется на записи, `client` — окно устройства с панелью, `llm` —
 * акцентное ядро-сфера в градиентной кромке.
 */
export type FlowNodeKind = "service" | "queue" | "store" | "cache" | "client" | "llm";

export const FLOW_KINDS: readonly FlowNodeKind[] = ["service", "queue", "store", "cache", "client", "llm"];

/** Узел для раскладки: геометрия, роль и слот. */
export interface FlowBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind?: FlowNodeKind;
  slot?: boolean;
  /** `queue`: ёмкость буфера — число ячеек (по умолчанию — сколько влезает по ширине). */
  cells?: number;
}

/** Слот данных узла, px графа: прямоугольник под токен и сколько высоты карточки он забирает. */
export interface FlowSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Высота полосы слота снизу карточки (с отступом от кромки). */
  reserve: number;
  /** `queue`: заданная ёмкость буфера (FlowNode.cells). */
  cells?: number;
}

/** Место статуса у узла: снаружи карточки, со стороны без рёбер. */
export interface FlowStatusSlot {
  side: "top" | "bottom" | "right";
  /** Точка крепления плашки (середина стороны, отступ `gap`). */
  x: number;
  y: number;
  /** Прямоугольник, который плашка кегля caption занимает при ширине узла. */
  rect: Rect;
}

/** Высота DataToken кегля `px`: строка 1.15 и поля 0.3 em сверху и снизу. */
export const tokenHeight = (px: number) => px * 1.75;

/** Высота StatusChip кегля `px`: строка 1.2 и поля 0.38 em. */
export const statusHeight = (px: number) => px * 1.96;

/** Узлы с полосой данных всегда: буфер, хранилище и память ключей держат записи внутри. */
const BAND_KINDS = new Set<FlowNodeKind>(["queue", "store", "cache"]);

/** Есть ли у узла полоса данных (slot / inbox). */
export const hasBand = (n: Pick<FlowBox, "kind" | "slot">) => n.slot === true || BAND_KINDS.has(n.kind ?? "service");

/** Полуоси эллипса крышки цилиндра (`store`): ry — от ширины, не больше 14 % высоты. */
export function storeCap(n: Pick<FlowBox, "w" | "h">): number {
  return Math.round(Math.min(n.w * 0.1, n.h * 0.14));
}

/** Высота панели окна (`client`) при кадре `frameH`. */
export const clientBar = (frameH: number) => Math.round((28 * frameH) / 1080);

/**
 * Полоса данных узла (чистая функция): внизу карточки под токен кегля caption, по ширине —
 * между полями; отступ от нижней кромки 0.4 caption (не меньше 8 px при 1080), у цилиндра —
 * ещё нижняя дуга. null — полосы нет (нет `slot`, роль без буфера).
 */
export function flowSlot(n: FlowBox, s: StyleBible, frameH: number): FlowSlot | null {
  if (!hasBand(n)) return null;
  const cap = typeSize(s, "caption", frameH);
  const h = tokenHeight(cap);
  const inset = Math.max((8 * frameH) / 1080, cap * 0.4) + (n.kind === "store" ? storeCap(n) : 0);
  const padX = space(s, 0.5) + (n.kind === "queue" ? cap * 0.9 : 0);
  const out: FlowSlot = { x: n.x + padX, y: n.y + n.h - inset - h, w: n.w - 2 * padX, h, reserve: h + inset };
  if (n.kind === "queue" && n.cells !== undefined) out.cells = Math.max(1, Math.round(n.cells));
  return out;
}

/** Зона подписи узла: внутри полей, над полосой данных, под панелью окна и крышкой цилиндра. */
export function flowLabelZone(n: FlowBox, s: StyleBible, frameH: number): Rect {
  const padX = space(s, 0.5);
  const top = n.kind === "client" ? clientBar(frameH) : n.kind === "store" ? storeCap(n) * 2 : 0;
  const band = flowSlot(n, s, frameH)?.reserve ?? 0;
  return { x: n.x + padX, y: n.y + top, w: n.w - 2 * padX, h: Math.max(0, n.h - top - band) };
}

/** Где ребро касается узлов: «top» / «bottom» / «left» / «right» для обоих концов. */
export function portSides(seg: CubicSegment, a: FlowBox, b: FlowBox): [string, string] {
  const side = (p: { x: number; y: number }, n: FlowBox) =>
    Math.abs(p.y - n.y) < 0.5 ? "top" : Math.abs(p.y - (n.y + n.h)) < 0.5 ? "bottom" : Math.abs(p.x - n.x) < 0.5 ? "left" : "right";
  return [side(seg[0], a), side(seg[3], b)];
}

/**
 * Место статуса узла (чистая функция): над карточкой; если сверху в узел входит ребро — под
 * ней; занято и снизу — справа. Снаружи карточки — плашка не ложится на подпись, а токены по
 * горизонтальным рёбрам (порты — середины боковых сторон) проходят мимо.
 */
export function flowStatusSlot(n: FlowBox, used: ReadonlySet<string>, s: StyleBible, frameH: number, gap = 12): FlowStatusSlot {
  const h = statusHeight(typeSize(s, "caption", frameH));
  const g = (gap * frameH) / 1080;
  if (!used.has("top")) return { side: "top", x: n.x + n.w / 2, y: n.y - g, rect: { x: n.x, y: n.y - g - h, w: n.w, h } };
  if (!used.has("bottom")) return { side: "bottom", x: n.x + n.w / 2, y: n.y + n.h + g, rect: { x: n.x, y: n.y + n.h + g, w: n.w, h } };
  return { side: "right", x: n.x + n.w + g, y: n.y + n.h / 2, rect: { x: n.x + n.w + g, y: n.y + n.h / 2 - h / 2, w: n.w, h } };
}

/**
 * Порты ребра: горизонтально (правый край → левый), если узлы разнесены по x хотя бы
 * на 16 px — схемы читаются слева направо; иначе вертикально (низ → верх).
 */
export function edgePath(a: Pick<FlowBox, "x" | "y" | "w" | "h">, b: Pick<FlowBox, "x" | "y" | "w" | "h">): CubicSegment {
  const gapX = b.x >= a.x + a.w ? b.x - (a.x + a.w) : a.x >= b.x + b.w ? a.x - (b.x + b.w) : -1;
  if (gapX >= 16) {
    const right = b.x >= a.x;
    return edgeSegment({ x: right ? a.x + a.w : a.x, y: a.y + a.h / 2 }, { x: right ? b.x : b.x + b.w, y: b.y + b.h / 2 }, "h");
  }
  const down = b.y >= a.y;
  return edgeSegment({ x: a.x + a.w / 2, y: down ? a.y + a.h : a.y }, { x: b.x + b.w / 2, y: down ? b.y : b.y + b.h }, "v");
}

/** Занятые рёбрами стороны каждого узла. */
export function usedSides(nodes: FlowBox[], edges: { from: string; to: string }[]): Map<string, Set<string>> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map(nodes.map((n) => [n.id, new Set<string>()]));
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const [sa, sb] = portSides(edgePath(a, b), a, b);
    out.get(a.id)!.add(sa);
    out.get(b.id)!.add(sb);
  }
  return out;
}

/**
 * Ячейки буфера `queue` в полосе: число и ширина. По умолчанию — сколько влезает (ячейка ≈ 3.2
 * высоты полосы — под короткий ярлык сообщения, не меньше 2); `FlowNode.cells` задаёт ёмкость —
 * буфер держит все сообщения, ячейки сужаются.
 */
export function queueCells(slot: FlowSlot): { count: number; w: number; gap: number } {
  const gap = Math.max(4, slot.h * 0.18);
  const count = slot.cells ?? Math.max(2, Math.floor((slot.w + gap) / (slot.h * 3.2 + gap)));
  return { count, w: (slot.w - gap * (count - 1)) / count, gap };
}

/** Ячейка уже — ярлык сообщения не читается (доля высоты полосы). */
const QUEUE_CELL_MIN = 1.6;

/**
 * Центр ячейки `i` буфера: ячейка 0 — у выхода (справа), дальше к входу — FIFO читается
 * без слов: старое сообщение ближе к выходу. Ячейка за ёмкостью не прижимается к последней
 * (сообщение легло бы поверх соседа) — встаёт дальше к входу; это ошибка, см. queueCellIssue.
 */
export function queueCellCenter(slot: FlowSlot, i: number): { x: number; y: number } {
  const c = queueCells(slot);
  const k = Math.max(0, Math.round(i));
  return { x: slot.x + slot.w - c.w / 2 - k * (c.w + c.gap), y: slot.y + slot.h / 2 };
}

/**
 * Ячейка вне буфера `node` (чистая функция): сообщение ошибки kit или null. Переполнение не
 * молчит (S2-fix I1): прежде токен прижимался к последней ячейке поверх соседа (held-queue,
 * «#4811» под «#4812»).
 */
export function queueCellIssue(node: string, slot: FlowSlot, cell: number): string | null {
  const c = queueCells(slot);
  const k = Math.round(cell);
  if (k >= 0 && k < c.count) return null;
  return `DataToken: ячейка ${k} очереди "${node}" вне буфера (ячеек ${c.count}) — сообщение не ложится в очередь. Задай узлу cells: ${Math.max(k + 1, c.count)} (буфер держит все сообщения, ячейки уже) или освобождай ячейку (until) и ставь следующее сообщение в неё.`;
}

/** Полоса, которую занимает токен в режиме `slot`: узел, ячейка и окно кадров [from, to). */
export interface TokenSlotUse {
  node: string;
  cell: number;
  from: number;
  to: number;
}

/** Токен в книге графа (S2-fix2): метка, старт полёта и занятая полоса. */
export interface TokenEntry {
  label: string;
  start: number;
  slot?: TokenSlotUse;
}

const sameEntry = (a: TokenEntry, b: TokenEntry) =>
  a.label === b.label && a.start === b.start && a.slot?.node === b.slot?.node && a.slot?.cell === b.slot?.cell && a.slot?.from === b.slot?.from && a.slot?.to === b.slot?.to;

/**
 * Книга токенов графа (S2-fix2): DataToken записывает себя при рендере, чтобы правила между
 * токенами (одна копия текста в кадре, один токен в полосе) не зависели от порядка в дереве.
 * `version` растёт только при изменении — по ней токен, отрисованный раньше соседей, один раз
 * перерисовывается в том же коммите (useLayoutEffect), и кадр детерминирован.
 */
export class TokenBook implements Iterable<[string, TokenEntry]> {
  private items = new Map<string, TokenEntry>();
  version = 0;
  put(id: string, e: TokenEntry): void {
    const prev = this.items.get(id);
    if (prev && sameEntry(prev, e)) return;
    this.items.set(id, e);
    this.version++;
  }
  drop(id: string): void {
    if (this.items.delete(id)) this.version++;
  }
  get(id: string): TokenEntry | undefined {
    return this.items.get(id);
  }
  [Symbol.iterator]() {
    return this.items[Symbol.iterator]();
  }
}

/** Ближайший старт другого токена с той же меткой после старта `id` (чистая функция). */
export function nextSameLabel(book: TokenBook, id: string): number | undefined {
  const me = book.get(id);
  if (!me) return undefined;
  let next: number | undefined;
  for (const [k, e] of book) if (k !== id && e.label === me.label && e.start > me.start && (next === undefined || e.start < next)) next = e.start;
  return next;
}

/**
 * Второй токен в занятую полосу (S2-fix2, m3): сообщение ошибки kit или null. Токен в полосе
 * лежит до `until` (+ `leave` кадров ухода); следующий в ту же полосу (ячейку queue) лёг бы
 * поверх. Сообщает поздний из двух (по старту).
 */
export function slotBusyIssue(book: TokenBook, id: string, leave = 10): string | null {
  const me = book.get(id);
  const a = me?.slot;
  if (!me || !a) return null;
  for (const [k, e] of book) {
    const b = e.slot;
    if (k === id || !b || b.node !== a.node || b.cell !== a.cell) continue;
    if (e.start > me.start || (e.start === me.start && k > id)) continue;
    if (!(a.from < b.to && b.from < a.to)) continue;
    const till = Number.isFinite(b.to) ? `до кадра ${b.to}` : "до конца сцены";
    return `DataToken «${me.label}»: полоса узла "${a.node}"${a.cell > 0 ? ` (ячейка ${a.cell})` : ""} занята токеном «${e.label}» (лежит с кадра ${b.from} ${till}) — «${me.label}» лёг бы поверх с кадра ${a.from}. В полосе один токен за раз: прежнему задай until не позже кадра ${a.from - leave}, или этот поглоти узлом (consume), или у queue — другая ячейка (cell).`;
  }
  return null;
}

/** Ячейки уже предела читаемости — сообщение (не ошибка: ярлык сократится многоточием). */
export function queueNarrowIssue(node: string, slot: FlowSlot): string | null {
  const c = queueCells(slot);
  if (c.w >= slot.h * QUEUE_CELL_MIN) return null;
  return `FlowGraph: у очереди "${node}" ${c.count} ячеек по ${Math.round(c.w)} px — ярлыки сообщений не прочитать. Расширь узел (w) или уменьши cells.`;
}
