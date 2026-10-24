// Детектор пауз чернового монтажа (Task 28): промежуток между словами не короче
// `pauseMinUs` → вырезка его середины. Слева остаётся `keepAfterWordUs` (после конца
// предложения `[.?!…]` — `sentenceKeepAfterUs`), справа — `keepBeforeWordUs` перед следующим
// словом. Тишина до первого слова и после последнего — тоже паузы (края записи): вырезка от
// начала исходника и до его конца. Звук в паузе (громче `loudDbfs` дольше 200 мс по waveform) —
// не пауза: там смех, вдох в микрофон, звук демонстрации — решает человек, детектор молчит.
import { type EditDecision, type Fps, type TranscriptWord, snapUsToFrame } from "@ms/contracts";
import type { RoughcutConfig } from "../config.js";
import { WAVEFORM_BUCKET_MS } from "../media/waveform.js";

/** Громкий звук в паузе дольше этого — пауза не режется. */
export const LOUD_MIN_US = 200_000;
/** Пауза от этой длины — уверенная вырезка. */
const LONG_GAP_US = 1_500_000;
const SENTENCE_END = /[.?!…]["»”)\]]*$/u;

export type PauseConfig = Pick<RoughcutConfig, "pauseMinUs" | "keepAfterWordUs" | "sentenceKeepAfterUs" | "keepBeforeWordUs" | "loudDbfs">;

export interface PauseOptions {
  /** Длительность исходника: пауза после последнего слова — до конца записи. Без неё — по waveform. */
  sourceDurationUs?: number;
  /** Ведро waveform, мс (10). */
  bucketMs?: number;
  /** id решений: `<prefix><k>` (по умолчанию `pause_`). */
  idPrefix?: string;
}

/**
 * Есть ли в `[startUs, endUs)` звук громче `loudDbfs` дольше `LOUD_MIN_US` подряд. `peaks` —
 * пары min/max Int8 на ведро (`peaksFromPcm`, масштаб `/256`): уровень ведра —
 * `max(|min|, |max|) / 128` от полной шкалы.
 */
export function loudIn(peaks: Int8Array, startUs: number, endUs: number, loudDbfs: number, bucketMs = WAVEFORM_BUCKET_MS): boolean {
  const bucketUs = bucketMs * 1000;
  const threshold = 128 * 10 ** (loudDbfs / 20);
  const buckets = peaks.length / 2;
  const from = Math.max(0, Math.floor(startUs / bucketUs));
  const to = Math.min(buckets, Math.ceil(endUs / bucketUs));
  const need = Math.ceil(LOUD_MIN_US / bucketUs);
  let run = 0;
  for (let b = from; b < to; b++) {
    const level = Math.max(Math.abs(peaks[2 * b]!), Math.abs(peaks[2 * b + 1]!));
    run = level > threshold ? run + 1 : 0;
    if (run >= need) return true;
  }
  return false;
}

/**
 * Паузы → предложения вырезок `reason: "pause"`, `origin: "detector"`, `status: "proposed"`;
 * якорей-слов нет (вырезка между словами). Перекрывающиеся слова и нулевые промежутки whisper —
 * не паузы. Уверенность — 0.9 для паузы от 1,5 с, иначе 0.7.
 */
export function detectPauses(words: Pick<TranscriptWord, "text" | "start_us" | "end_us">[], peaks: Int8Array, cfg: PauseConfig, fps: Fps, o: PauseOptions = {}): EditDecision[] {
  const bucketMs = o.bucketMs ?? WAVEFORM_BUCKET_MS;
  const duration = o.sourceDurationUs ?? Math.round((peaks.length / 2) * bucketMs * 1000);
  const prefix = o.idPrefix ?? "pause_";
  const out: EditDecision[] = [];
  const push = (gapStart: number, gapEnd: number, cutStart: number, cutEnd: number, where: string): void => {
    const gap = gapEnd - gapStart;
    if (gap < cfg.pauseMinUs) return;
    const start = snapUsToFrame(Math.max(0, cutStart), fps);
    const end = cutEnd >= duration ? duration : snapUsToFrame(cutEnd, fps);
    if (end <= start) return;
    if (loudIn(peaks, start, end, cfg.loudDbfs, bucketMs)) return;
    out.push({
      id: `${prefix}${out.length + 1}`, reason: "pause", origin: "detector", status: "proposed",
      source_start_us: start, source_end_us: end, confidence: gap >= LONG_GAP_US ? 0.9 : 0.7,
      explanation: `пауза ${(gap / 1e6).toFixed(1)} с ${where}`,
    });
  };
  if (words.length === 0) return out;
  const first = words[0]!;
  push(0, first.start_us, 0, first.start_us - cfg.keepBeforeWordUs, "в начале записи");
  let prevEnd = first.end_us;
  let prevText = first.text;
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    const keepAfter = SENTENCE_END.test(prevText.trim()) ? cfg.sentenceKeepAfterUs : cfg.keepAfterWordUs;
    push(prevEnd, w.start_us, prevEnd + keepAfter, w.start_us - cfg.keepBeforeWordUs, "между словами");
    // слово внутри предыдущего (перекрытие whisper) не сдвигает конец речи назад
    if (w.end_us >= prevEnd) {
      prevEnd = w.end_us;
      prevText = w.text;
    }
  }
  if (duration > prevEnd) {
    const keepAfter = SENTENCE_END.test(prevText.trim()) ? cfg.sentenceKeepAfterUs : cfg.keepAfterWordUs;
    push(prevEnd, duration, prevEnd + keepAfter, duration, "в конце записи");
  }
  return out;
}
