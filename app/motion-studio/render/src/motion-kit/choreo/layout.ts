// Раскладка без ручных координат: колонки сетки StyleBible и слоистая схема-граф.
import type { StyleBible } from "@ms/contracts";
import type { Rect } from "./safe-area.js";

export type { Rect } from "./safe-area.js";

/** n равных колонок во всю ширину rect с gutter сетки стиля. */
export function gridColumns(style: StyleBible, rect: Rect, n: number): { x: number; w: number }[] {
  const count = Math.max(1, Math.floor(n));
  const gutter = style.grid.gutter;
  const w = (rect.w - gutter * (count - 1)) / count;
  if (!(w > 0)) throw new RangeError(`gridColumns: ${count} колонок с gutter ${gutter} не влезают в ширину ${rect.w}`);
  return Array.from({ length: count }, (_, i) => ({ x: rect.x + i * (w + gutter), w }));
}

/**
 * Слои — по топологическому порядку (самый длинный путь от истока), слева направо.
 * Обратные рёбра цикла в слоях не учитываются. Внутри слоя узлы — столбиком по центру
 * вертикали rect, в порядке средних позиций предков (меньше пересечений рёбер). Колонка
 * слоя шириной с самый широкий узел, узел центрирован в ней; вся схема — по центру rect.
 * Не влезает — RangeError, а не наложение.
 */
export function layoutLayered(
  nodes: { id: string; w: number; h: number }[],
  edges: { from: string; to: string }[],
  rect: Rect,
  gap: { x: number; y: number },
): Record<string, Rect> {
  const index = new Map(nodes.map((nd, i) => [nd.id, i]));
  for (const e of edges) {
    for (const id of [e.from, e.to]) if (!index.has(id)) throw new RangeError(`layoutLayered: ребро ${e.from} → ${e.to} ссылается на неизвестный узел ${id}`);
  }

  // топологический порядок Кана; в цикле берётся самый ранний по входу узел
  const preds = new Map<string, string[]>(nodes.map((nd) => [nd.id, []]));
  const indeg = new Map(nodes.map((nd) => [nd.id, 0]));
  for (const e of edges) {
    if (e.from === e.to) continue;
    preds.get(e.to)!.push(e.from);
    indeg.set(e.to, indeg.get(e.to)! + 1);
  }
  const placed = new Set<string>();
  const layer = new Map<string, number>();
  while (placed.size < nodes.length) {
    const free = nodes.filter((nd) => !placed.has(nd.id) && indeg.get(nd.id) === 0);
    const next = free[0] ?? nodes.find((nd) => !placed.has(nd.id))!;
    placed.add(next.id);
    const done = preds.get(next.id)!.filter((p) => layer.has(p));
    layer.set(next.id, done.length === 0 ? 0 : Math.max(...done.map((p) => layer.get(p)! + 1)));
    for (const e of edges) if (e.from === next.id && e.to !== next.id && !placed.has(e.to)) indeg.set(e.to, indeg.get(e.to)! - 1);
  }

  const count = Math.max(...layer.values()) + 1;
  const layers: { id: string; w: number; h: number }[][] = Array.from({ length: count }, () => []);
  for (const nd of nodes) layers[layer.get(nd.id)!]!.push(nd);

  const colW = layers.map((l) => Math.max(...l.map((nd) => nd.w)));
  const totalW = colW.reduce((a, b) => a + b, 0) + gap.x * (count - 1);
  if (totalW > rect.w + 1e-9) throw new RangeError(`layoutLayered: схема шириной ${Math.ceil(totalW)} px не влезает в ширину ${rect.w} px`);

  const out: Record<string, Rect> = {};
  const centerY = (id: string) => out[id]!.y + out[id]!.h / 2;
  let x = rect.x + (rect.w - totalW) / 2;
  layers.forEach((l, li) => {
    // порядок в слое: средний центр уже расставленных предков, затем порядок входа
    const key = (nd: { id: string }) => {
      const ps = preds.get(nd.id)!.filter((p) => out[p] !== undefined);
      return ps.length > 0 ? ps.reduce((a, p) => a + centerY(p), 0) / ps.length : 0;
    };
    const sorted = [...l].sort((a, b) => key(a) - key(b) || index.get(a.id)! - index.get(b.id)!);
    const totalH = sorted.reduce((a, nd) => a + nd.h, 0) + gap.y * (sorted.length - 1);
    if (totalH > rect.h + 1e-9) throw new RangeError(`layoutLayered: слой ${li} высотой ${Math.ceil(totalH)} px не влезает в высоту ${rect.h} px`);
    let y = rect.y + (rect.h - totalH) / 2;
    for (const nd of sorted) {
      out[nd.id] = { x: x + (colW[li]! - nd.w) / 2, y, w: nd.w, h: nd.h };
      y += nd.h + gap.y;
    }
    x += colW[li]! + gap.x;
  });
  return out;
}
