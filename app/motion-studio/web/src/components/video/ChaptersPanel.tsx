// Главы смысловой разметки (Task 33): по порядку, с кратким содержанием; клик — переход к первому
// слову главы (source).
import type { SemanticTimeline, TranscriptWord } from "@ms/contracts";
import { t } from "../../i18n/index.js";
import { formatTimecode } from "../../video/use-timeline.js";

export interface ChaptersPanelProps {
  semantic: SemanticTimeline;
  words: readonly TranscriptWord[];
  onSeek: (sourceUs: number) => void;
}

export function ChaptersPanel({ semantic, words, onSeek }: ChaptersPanelProps) {
  const at = new Map(words.map((w) => [w.id, w.start_us]));
  return (
    <div className="chapters" data-testid="chapters">
      <h3>{t("analysis.chapters", { n: semantic.chapters.length })}</h3>
      {semantic.chapters.length === 0 ? <p className="muted small">{t("analysis.noChapters")}</p> : (
        <ol className="chapter-list">
          {semantic.chapters.map((c) => {
            const us = at.get(c.start_word_id);
            return (
              <li key={c.id}>
                <button type="button" className="chapter" disabled={us === undefined} onClick={() => us !== undefined && onSeek(us)}>
                  <span className="mono small">{us === undefined ? "—" : formatTimecode(us)}</span>
                  <span className="strong">{c.title}</span>
                </button>
                {c.summary ? <p className="muted small">{c.summary}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
