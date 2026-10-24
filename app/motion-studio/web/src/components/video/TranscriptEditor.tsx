// Транскрипт по сегментам: слово — спан (клик → переход, Shift+клик — выделение диапазона для
// «Вырезать»); правка текста сегмента → `replace_span` от текущей ревизии (новая ревизия на
// сервере, таймкоды сохраняются). 409 — сообщение и перезагрузка. Старая ревизия — только чтение.
import type { TranscriptDto, TranscriptWord, WordMapping } from "@ms/contracts";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError, api } from "../../api/client.js";
import { errorText, t } from "../../i18n/index.js";
import { wordAt } from "../../video/word-index.js";
import { WordSpan } from "./WordSpan.js";

export interface TranscriptEditorProps {
  transcript: TranscriptDto;
  /** Положение слов в edited (EDL); нет — монтажа ещё нет. */
  wordMap?: Record<string, WordMapping>;
  /** Время плеера в source, µs. */
  currentUs: number;
  /** Открыта не текущая ревизия — правка недоступна. */
  readOnly?: boolean;
  onSeek: (sourceUs: number) => void;
  onCut?: (startWordId: string, endWordId: string) => void;
  onSaved?: (t: TranscriptDto) => void;
  onConflict?: () => void;
}

export function TranscriptEditor({ transcript, wordMap, currentUs, readOnly, onSeek, onCut, onSaved, onConflict }: TranscriptEditorProps) {
  const { doc } = transcript;
  const byId = useMemo(() => new Map(doc.words.map((w, i) => [w.id, { w, i }])), [doc.words]);
  const current = wordAt(doc.words, currentUs);
  const [editing, setEditing] = useState<{ seg: string; text: string } | null>(null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const [conflict, setConflict] = useState(false);

  const save = useMutation({
    mutationFn: (v: { start: string; end: string; text: string }) =>
      api.saveTranscript(transcript.id, transcript.current_revision, [{ op: "replace_span", start_word_id: v.start, end_word_id: v.end, text: v.text }]),
    onSuccess: (r) => {
      setEditing(null);
      setConflict(false);
      onSaved?.(r);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "revision_conflict") {
        setConflict(true);
        setEditing(null);
        onConflict?.();
      }
    },
  });

  const click = (w: TranscriptWord, e: { shiftKey: boolean }) => {
    const i = byId.get(w.id)!.i;
    if (e.shiftKey && sel) setSel({ a: Math.min(sel.a, i), b: Math.max(sel.a, i) });
    else setSel({ a: i, b: i });
    onSeek(w.start_us);
  };
  const selCount = sel ? sel.b - sel.a + 1 : 0;

  return (
    <div className="transcript-editor">
      <p className="hint">{t("transcript.selectHint")} {t("transcript.noConfidence")}</p>
      {conflict ? <p className="error" role="alert">{t("transcript.conflict")}</p> : null}
      {save.isError && !conflict ? <p className="error">{errorText(save.error)}</p> : null}
      {sel && onCut && !readOnly ? (
        <div className="row selection-bar">
          <button type="button" className="primary" onClick={() => { onCut(doc.words[sel.a]!.id, doc.words[sel.b]!.id); setSel(null); }}>
            {t("transcript.cutSelection", { n: selCount })}
          </button>
          <button type="button" onClick={() => setSel(null)}>{t("transcript.clearSelection")}</button>
        </div>
      ) : null}
      <div className="segments">
        {doc.segments.map((seg) => {
          const words = seg.word_ids.map((id) => byId.get(id)?.w).filter((w): w is TranscriptWord => Boolean(w));
          const isEditing = editing?.seg === seg.id;
          return (
            <div key={seg.id} className="segment" data-segment-id={seg.id}>
              {isEditing ? (
                <form
                  className="row segment-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate({ start: words[0]!.id, end: words.at(-1)!.id, text: editing.text });
                  }}
                >
                  <input
                    className="grow"
                    aria-label={t("transcript.segmentText")}
                    value={editing.text}
                    onChange={(e) => setEditing({ seg: seg.id, text: e.target.value })}
                    autoFocus
                  />
                  <button type="submit" className="primary" disabled={save.isPending}>{t("transcript.save")}</button>
                  <button type="button" onClick={() => setEditing(null)}>{t("transcript.cancel")}</button>
                </form>
              ) : (
                <p className="segment-text">
                  {words.map((w) => {
                    const i = byId.get(w.id)!.i;
                    return (
                      <span key={w.id}>
                        <WordSpan word={w} mapping={wordMap?.[w.id]} current={i === current} selected={sel !== null && i >= sel.a && i <= sel.b} onClick={click} />{" "}
                      </span>
                    );
                  })}
                  {!readOnly && words.length > 0 ? (
                    <button type="button" className="link-button small" onClick={() => setEditing({ seg: seg.id, text: words.map((w) => w.text).join(" ") })}>
                      {t("transcript.edit")}
                    </button>
                  ) : null}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
