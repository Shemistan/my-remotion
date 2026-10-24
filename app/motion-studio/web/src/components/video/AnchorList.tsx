// Якоря смысловой разметки (Task 33): тезисы, числа, акценты — вид и `claim_type` бейджами
// («факт / предположение / мнение»), важность, цитата (словами транскрипта по id); клик — переход к первому слову (source).
// Числа и спорные места — отдельными списками.
import type { SemanticTimeline, TranscriptWord } from "@ms/contracts";
import { t } from "../../i18n/index.js";
import { formatTimecode } from "../../video/use-timeline.js";
import { quoteText } from "../../video/word-index.js";

export interface AnchorListProps {
  semantic: SemanticTimeline;
  words: readonly TranscriptWord[];
  onSeek: (sourceUs: number) => void;
}

export function AnchorList({ semantic, words, onSeek }: AnchorListProps) {
  const at = new Map(words.map((w, i) => [w.id, { us: w.start_us, i }]));
  const pos = (id: string) => at.get(id)?.i ?? Number.MAX_SAFE_INTEGER;
  const anchors = [...semantic.anchors].sort((a, b) => pos(a.start_word_id) - pos(b.start_word_id));
  const jump = (wordId: string) => {
    const w = at.get(wordId);
    return w ? (
      <button type="button" className="link-button mono small" title={t("analysis.goTo", { tc: formatTimecode(w.us) })} onClick={() => onSeek(w.us)}>
        {formatTimecode(w.us)}
      </button>
    ) : null;
  };
  return (
    <div className="anchor-list">
      <h3>{t("analysis.anchors", { n: anchors.length })}</h3>
      {anchors.length === 0 ? <p className="muted small">{t("analysis.noAnchors")}</p> : (
        <ul className="anchors">
          {anchors.map((a) => (
            <li key={a.id} data-testid={`anchor-${a.id}`} className={`anchor claim-${a.claim_type}`}>
              <div className="row wrap">
                {jump(a.start_word_id)}
                <span className="badge">{t(`semantic.kind.${a.kind}`)}</span>
                <span className={`badge claim claim-${a.claim_type}`}>{t(`semantic.claim.${a.claim_type}`)}</span>
                <span className="muted small">{t("analysis.importance", { n: a.importance })}</span>
              </div>
              <p className="anchor-quote">«{quoteText(words, a.start_word_id, a.end_word_id, a.quote)}»</p>
              {a.uncertainty ? <p className="hint">{a.uncertainty}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {semantic.numbers.length > 0 ? (
        <>
          <h3>{t("analysis.numbers", { n: semantic.numbers.length })}</h3>
          <ul className="anchors" data-testid="numbers">
            {semantic.numbers.map((n, i) => (
              <li key={`${n.start_word_id}-${i}`} className="anchor">
                <div className="row wrap">
                  {jump(n.start_word_id)}
                  <strong>{n.value}{n.unit ? ` ${n.unit}` : ""}</strong>
                  <span className={`badge claim claim-${n.claim_type}`}>{t(`semantic.claim.${n.claim_type}`)}</span>
                  <span className="muted small">«{quoteText(words, n.start_word_id, n.end_word_id, n.quote)}»</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {semantic.disputed.length > 0 ? (
        <>
          <h3>{t("analysis.disputed", { n: semantic.disputed.length })}</h3>
          <ul className="anchors disputed" data-testid="disputed">
            {semantic.disputed.map((d, i) => (
              <li key={`${d.start_word_id}-${i}`} className="anchor">
                <div className="row wrap">{jump(d.start_word_id)}<span>{d.why}</span></div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
