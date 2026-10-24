// Ревизии транскрипта: r1 «ASR, оригинал», rN «правка»; открыть любую (только чтение) и
// сравнить с текущей по словам (id сохраняются при правке: изменён текст, удалено, добавлено).
import type { TranscriptDto } from "@ms/contracts";
import { useState } from "react";
import { useTranscript, useTranscriptRevisions } from "../../api/queries.js";
import { errorText, t } from "../../i18n/index.js";
const dateTime = (iso: string) => new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });

export interface RevisionListProps {
  transcriptId: string;
  current: TranscriptDto;
  viewing: number | undefined;
  onView: (revision: number | undefined) => void;
}

function WordDiff({ from, to }: { from: TranscriptDto; to: TranscriptDto }) {
  const before = new Map(from.doc.words.map((w) => [w.id, w.text]));
  const after = new Map(to.doc.words.map((w) => [w.id, w.text]));
  const lines: { key: string; text: string; cls: string }[] = [];
  for (const w of to.doc.words) {
    const old = before.get(w.id);
    if (old === undefined) lines.push({ key: w.id, text: t("transcript.diffAdded", { text: w.text }), cls: "diff-added" });
    else if (old !== w.text) lines.push({ key: w.id, text: t("transcript.diffChanged", { from: old, to: w.text }), cls: "diff-changed" });
  }
  for (const w of from.doc.words) if (!after.has(w.id)) lines.push({ key: `-${w.id}`, text: t("transcript.diffRemoved", { text: w.text }), cls: "diff-removed" });
  return (
    <div className="word-diff" data-testid="word-diff">
      <h3>{t("transcript.diffTitle", { a: from.doc.revision, b: to.doc.revision })}</h3>
      {lines.length === 0 ? <p className="muted">{t("transcript.diffNone")}</p> : (
        <ul className="chips">{lines.map((l) => <li key={l.key} className={`chip ${l.cls}`}>{l.text}</li>)}</ul>
      )}
    </div>
  );
}

export function RevisionList({ transcriptId, current, viewing, onView }: RevisionListProps) {
  const q = useTranscriptRevisions(transcriptId);
  const [compare, setCompare] = useState<number | undefined>(undefined);
  const other = useTranscript(compare === undefined ? undefined : transcriptId, compare);
  return (
    <section className="panel revision-list">
      <h2>{t("transcript.revisions")}</h2>
      {q.isError ? <p className="error">{errorText(q.error)}</p> : null}
      <ul className="history">
        {[...(q.data ?? [])].reverse().map((r) => (
          <li key={r.revision} className={(viewing ?? current.current_revision) === r.revision ? "open" : ""} data-revision={r.revision}>
            <div className="row wrap">
              <strong>{t(r.author === "asr" ? "transcript.rev.asr" : "transcript.rev.user", { n: r.revision })}</strong>
              {r.revision === current.current_revision ? <span className="badge">{t("transcript.rev.current")}</span> : null}
              <span className="muted small">{dateTime(r.created_at)}</span>
              <span className="spacer" />
              {r.revision !== current.current_revision ? (
                <>
                  <button type="button" data-action="view" onClick={() => onView(r.revision)}>{t("transcript.view")}</button>
                  <button type="button" data-action="compare" onClick={() => setCompare(r.revision)}>{t("transcript.compare")}</button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {viewing !== undefined ? (
        <p className="base-note row">
          <span>{t("transcript.viewing", { n: viewing })}</span>
          <button type="button" onClick={() => onView(undefined)}>{t("transcript.backToCurrent")}</button>
        </p>
      ) : null}
      {compare !== undefined && other.data ? <WordDiff from={other.data} to={current} /> : null}
    </section>
  );
}
