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

/**
 * Выделение внутри `root` → блок и смещения символов; выделения нет или оно пустое — null;
 * концы в разных блоках — `"cross_block"`. Текст блока в DOM должен совпадать с `text` блока
 * (номера сцен — псевдоэлементами CSS, в тексте их нет).
 */
export function domSelectionRange(root: Element, sel: Selection | null): BlockRange | "cross_block" | null {
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  const a = blockOf(r.startContainer, root);
  const b = blockOf(r.endContainer, root);
  if (!a && !b) return null;
  if (!a || !b || a !== b) return "cross_block";
  const start = offsetIn(a, r.startContainer, r.startOffset);
  const end = offsetIn(a, r.endContainer, r.endOffset);
  return { blockId: a.dataset.blockId!, start: Math.min(start, end), end: Math.max(start, end) };
}
