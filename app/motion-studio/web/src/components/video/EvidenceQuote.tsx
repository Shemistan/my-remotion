// Основание сцены плана (Task 33): дословная цитата, таймкоды после монтажа и в исходнике, кадры
// `timeline_fps` (цитата — словами транскрипта по id, `quoteText`); «Проиграть фрагмент» — edited-диапазон цитаты (пауза на конце). Цитата нулевой
// длины (вставленное слово) проигрывается до конца своего кадра.
import { type EditedTimeline, type ScenePlanItem, type TranscriptWord, frameToUs } from "@ms/contracts";
import { t } from "../../i18n/index.js";
import { formatTimecode, frameOf, toSource } from "../../video/use-timeline.js";
import { quoteText } from "../../video/word-index.js";

export interface EvidenceQuoteProps {
  evidence: ScenePlanItem["evidence"][number];
  /** Слова транскрипта: цитата показывается ими (ревью Task 33 M3). */
  words: readonly TranscriptWord[];
  timeline: EditedTimeline;
  onPlay: (editedRange: { start_us: number; end_us: number }) => void;
}

export function EvidenceQuote({ evidence, words, timeline: tl, onPlay }: EvidenceQuoteProps) {
  const { start_us, end_us } = evidence.edited;
  const end = end_us > start_us ? end_us : start_us + frameToUs(1, tl.fps);
  return (
    <div className="evidence" data-testid="evidence">
      <blockquote className="evidence-quote">«{quoteText(words, evidence.start_word_id, evidence.end_word_id, evidence.quote)}»</blockquote>
      <div className="row wrap small muted">
        <span>{t("evidence.edited", { from: formatTimecode(start_us), to: formatTimecode(end_us) })}</span>
        <span>·</span>
        <span>{t("evidence.source", { from: formatTimecode(toSource(tl, start_us)), to: formatTimecode(toSource(tl, end_us)) })}</span>
        <span>·</span>
        <span>{t("evidence.frames", { from: frameOf(start_us, tl.fps), to: frameOf(end_us, tl.fps) })}</span>
        <button type="button" className="link-button small" onClick={() => onPlay({ start_us, end_us: end })}>{t("evidence.play")}</button>
      </div>
    </div>
  );
}
