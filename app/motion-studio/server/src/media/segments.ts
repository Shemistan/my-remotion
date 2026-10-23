// Сегменты транскрипта (Task 26): куски речи для UI и справочных `segment_ids` плана.
// Якоря сцен и вырезок — слова, не сегменты (`05` §2).
import type { TranscriptSegment, TranscriptWord } from "@ms/contracts";

export interface SegmentOptions {
  /** Разрыв при паузе не короче, µs. */
  pauseUs: number;
  /** Разрыв после конца предложения при паузе не короче, µs. */
  sentencePauseUs: number;
  /** Сегмент длиннее делится по наибольшей паузе внутри, µs. */
  maxUs: number;
}

export const SEGMENT_DEFAULTS: SegmentOptions = { pauseUs: 700_000, sentencePauseUs: 250_000, maxUs: 12_000_000 };

/** Конец предложения: `.?!…`, за ними — закрывающие кавычки и скобки. */
const SENTENCE_END = /[.?!…]["'»”’)\]]*$/u;

/** Индексы первых слов кусков `[from, to]`, длиннее `maxUs` — делятся по наибольшей паузе. */
function splitLong(words: TranscriptWord[], from: number, to: number, maxUs: number, out: number[]): void {
  if (to <= from || words[to]!.end_us - words[from]!.start_us <= maxUs) return;
  let best = from + 1;
  let bestGap = -Infinity;
  for (let i = from + 1; i <= to; i++) {
    const gap = words[i]!.start_us - words[i - 1]!.end_us;
    if (gap > bestGap) [best, bestGap] = [i, gap];
  }
  splitLong(words, from, best - 1, maxUs, out);
  out.push(best);
  splitLong(words, best, to, maxUs, out);
}

/**
 * Разрыв перед словом `i`, если пауза до него ≥ `pauseUs`, либо предыдущее слово кончает
 * предложение и пауза ≥ `sentencePauseUs`; затем каждый кусок длиннее `maxUs` делится по
 * наибольшей паузе внутри (рекурсивно). id — `seg_0001…`.
 */
export function buildSegments(words: TranscriptWord[], o: SegmentOptions = SEGMENT_DEFAULTS): TranscriptSegment[] {
  if (words.length === 0) return [];
  const starts = [0];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i]!.start_us - words[i - 1]!.end_us;
    if (gap >= o.pauseUs || (gap >= o.sentencePauseUs && SENTENCE_END.test(words[i - 1]!.text))) starts.push(i);
  }
  const all: number[] = [];
  starts.forEach((s, k) => {
    const end = (starts[k + 1] ?? words.length) - 1;
    all.push(s);
    splitLong(words, s, end, o.maxUs, all);
  });
  return all.map((s, k) => {
    const end = (all[k + 1] ?? words.length) - 1;
    const ws = words.slice(s, end + 1);
    return {
      id: `seg_${String(k + 1).padStart(4, "0")}`,
      word_ids: ws.map((w) => w.id),
      start_us: ws[0]!.start_us,
      end_us: Math.max(...ws.map((w) => w.end_us)),
    };
  });
}
