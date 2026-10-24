// Слово под курсором плеера: бинарный поиск по началам слов (слова по возрастанию start_us).
// В паузе между словами — предыдущее слово (подсветка не мигает); до первого слова — -1.
// `quoteText` — цитата агента словами транскрипта.
import { joinWords } from "@ms/contracts";

export function wordAt(words: readonly { start_us: number }[], us: number): number {
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid]!.start_us <= us) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * Цитата по id слов: тексты слов `startId…endId` транскрипта через `joinWords` (как транскрипт:
 * «MAC-адреса», без пробелов ASR). Слов нет или порядок обратный — сырой текст агента `fallback`.
 */
export function quoteText(words: readonly { id: string; text: string }[], startId: string, endId: string, fallback: string): string {
  const i = words.findIndex((w) => w.id === startId);
  const j = i < 0 ? -1 : words.findIndex((w, k) => k >= i && w.id === endId);
  if (i < 0 || j < 0) return fallback;
  return joinWords(words.slice(i, j + 1).map((w) => w.text)) || fallback;
}
