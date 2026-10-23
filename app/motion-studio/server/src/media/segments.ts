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

/**
 * Граница внутри куска `[from, to]` (индекс первого слова правой части). Кандидаты — границы,
 * где обе части не короче `maxUs / 4` (если таких нет — все); среди них — наибольшая пауза, при
 * равных паузах — ближайшая к середине куска по времени (ревью Task 26, I1: whisper внутри фразы
 * даёт паузы 0,0, и «первая наибольшая» отщипывала по одному слову).
 */
function splitPoint(words: TranscriptWord[], from: number, to: number, maxUs: number): number {
  const t0 = words[from]!.start_us;
  const t1 = words[to]!.end_us;
  const mid = (t0 + t1) / 2;
  const minPart = maxUs / 4;
  let best = -1;
  let bestGap = -Infinity;
  let bestDist = Infinity;
  for (const strict of [true, false]) {
    for (let i = from + 1; i <= to; i++) {
      if (strict && (words[i - 1]!.end_us - t0 < minPart || t1 - words[i]!.start_us < minPart)) continue;
      const gap = words[i]!.start_us - words[i - 1]!.end_us;
      const dist = Math.abs((words[i - 1]!.end_us + words[i]!.start_us) / 2 - mid);
      if (gap > bestGap || (gap === bestGap && dist < bestDist)) [best, bestGap, bestDist] = [i, gap, dist];
    }
    if (best >= 0) return best;
  }
  return from + 1;
}

/**
 * Индексы первых слов кусков `[from, to]`: кусок длиннее `maxUs` делится (`splitPoint`), пока
 * все части не уложатся. Итеративно — глубина не зависит от числа слов.
 */
function splitLong(words: TranscriptWord[], from: number, to: number, maxUs: number, out: number[]): void {
  const found: number[] = [];
  const stack: [number, number][] = [[from, to]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    if (b <= a || words[b]!.end_us - words[a]!.start_us <= maxUs) continue;
    const k = splitPoint(words, a, b, maxUs);
    found.push(k);
    stack.push([a, k - 1], [k, b]);
  }
  for (const k of found.sort((x, y) => x - y)) out.push(k);
}

/**
 * Разрыв перед словом `i`, если пауза до него ≥ `pauseUs`, либо предыдущее слово кончает
 * предложение и пауза ≥ `sentencePauseUs`; затем каждый кусок длиннее `maxUs` делится по
 * наибольшей паузе внутри (`splitPoint`). id — `seg_0001…`.
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
      end_us: ws.reduce((m, w) => Math.max(m, w.end_us), ws[0]!.end_us),
    };
  });
}
