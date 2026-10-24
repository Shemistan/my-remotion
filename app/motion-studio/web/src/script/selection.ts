// Выделение текста сценария мышью → слова (S8, спека §8): смещения символов в тексте блока
// переводятся в id слов через `words[].start/end`. Выделение через границу блоков не берётся.
import type { ScriptRevisionDoc } from "@ms/contracts";

export interface WordRange {
  start_word_id: string;
  end_word_id: string;
}

/** Слова блока, пересекающиеся с [start, end); ни одного (пробел, тире, пусто) — null. */
export function selectionToWords(doc: Pick<ScriptRevisionDoc, "words">, blockId: string, start: number, end: number): WordRange | null {
  if (end <= start) return null;
  const hit = doc.words.filter((w) => w.block_id === blockId && w.start < end && w.end > start);
  if (hit.length === 0) return null;
  return { start_word_id: hit[0]!.id, end_word_id: hit.at(-1)!.id };
}

export interface BlockRange {
  blockId: string;
  start: number;
  end: number;
}

const blockOf = (n: Node | null, root: Element): HTMLElement | null => {
  const el = n instanceof Element ? n : n?.parentElement ?? null;
  const b = el?.closest<HTMLElement>("[data-block-id]") ?? null;
  return b && root.contains(b) ? b : null;
};

/** Смещение точки DOM в тексте блока: длина текста от начала блока до точки. */
function offsetIn(block: HTMLElement, node: Node, offset: number): number {
  const r = document.createRange();
  r.setStart(block, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

/** Блок, к которому относится точка вне блоков: ближайший следующий (для начала) или предыдущий (для конца). */
function nearestBlock(root: Element, node: Node, offset: number, dir: "next" | "prev"): HTMLElement | null {
  const blocks = [...root.querySelectorAll<HTMLElement>("[data-block-id]")];
  const point = document.createRange();
  point.setStart(node, offset);
  const before = (b: HTMLElement) => point.comparePoint(b, 0) <= 0; // блок начинается не позже точки
  return dir === "next" ? (blocks.find((b) => !before(b) || b.contains(node)) ?? null) : ([...blocks].reverse().find(before) ?? null);
}

/**
 * Выделение внутри `root` → блок и смещения символов; выделения нет или в нём нет текста блоков —
 * null. Конец вне блока (тройной клик, выделение с заголовка) обрезается по границе блока;
 * конец в начале следующего блока (смещение 0) — тоже. Текст в двух блоках — `"cross_block"`.
 * Текст блока в DOM должен совпадать с `text` блока (номера сцен — псевдоэлементами CSS).
 */
export function domSelectionRange(root: Element, sel: Selection | null): BlockRange | "cross_block" | null {
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  let a = blockOf(r.startContainer, root);
  let b = blockOf(r.endContainer, root);
  let start = a ? offsetIn(a, r.startContainer, r.startOffset) : 0;
  let end = b ? offsetIn(b, r.endContainer, r.endOffset) : -1;
  if (!a) {
    a = root.contains(r.startContainer) ? nearestBlock(root, r.startContainer, r.startOffset, "next") : null;
    start = 0;
  }
  if (b && b !== a && end === 0) {
    // конец ровно в начале следующего блока — выделение до конца предыдущего
    const blocks = [...root.querySelectorAll<HTMLElement>("[data-block-id]")];
    b = blocks[blocks.indexOf(b) - 1] ?? null;
    end = b ? (b.textContent ?? "").length : -1;
  } else if (!b) {
    b = root.contains(r.endContainer) ? nearestBlock(root, r.endContainer, r.endOffset, "prev") : null;
    end = b ? (b.textContent ?? "").length : -1;
  }
  if (!a || !b) return null;
  if (a !== b) return "cross_block";
  return { blockId: a.dataset.blockId!, start: Math.min(start, end), end: Math.max(start, end) };
}
