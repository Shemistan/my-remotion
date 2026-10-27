// Транскрипт по сегментам: слово — спан (клик → переход, Shift+клик — выделение диапазона для
// «Вырезать»); правка текста сегмента → `replace_span` от текущей ревизии (новая ревизия на
// сервере, таймкоды сохраняются). 409 — сообщение и перезагрузка. Старая ревизия — только чтение.
// Во вкладке «План» (Task 33) выделение слов — «Добавить сцену» (`onAddScene`), даже только для чтения.
// Клавиатура: в порядке Tab одно слово (roving tabindex), ←/→ и Home/End — по словам, Enter/Space —
// переход.
import { type TranscriptDto, type TranscriptWord, type WordMapping, gluesToPrevious } from "@ms/contracts";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { ApiError, api } from "../../api/client.js";
import { errorText, t } from "../../i18n/index.js";
import { useUnsavedGuard } from "../../ui/unsaved.js";
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
  /** Сцена плана по выделенным словам (Task 33). */
  onAddScene?: (startWordId: string, endWordId: string) => void;
  onSaved?: (t: TranscriptDto) => void;
  onConflict?: () => void;
}

export function TranscriptEditor({ transcript, wordMap, currentUs, readOnly, onSeek, onCut, onAddScene, onSaved, onConflict }: TranscriptEditorProps) {
  const { doc } = transcript;
  const byId = useMemo(() => new Map(doc.words.map((w, i) => [w.id, { w, i }])), [doc.words]);
  const current = wordAt(doc.words, currentUs);
  const [editing, setEditing] = useState<{ seg: string; text: string } | null>(null);
  useUnsavedGuard(editing !== null);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const [conflict, setConflict] = useState(false);
  // roving tabindex: одна остановка Tab на транскрипт — слово, на котором был фокус, иначе текущее
  const root = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const stop = Math.min(Math.max(0, focused ?? current), Math.max(0, doc.words.length - 1));
  const nav = (w: TranscriptWord, key: string): boolean => {
    const i = byId.get(w.id)!.i;
    const last = doc.words.length - 1;
    const to = key === "ArrowRight" ? Math.min(i + 1, last)
      : key === "ArrowLeft" ? Math.max(i - 1, 0)
      : key === "Home" ? 0
      : key === "End" ? last
      : undefined;
    if (to === undefined) return false;
    setFocused(to);
    const id = doc.words[to]!.id;
    [...(root.current?.querySelectorAll<HTMLElement>("[data-word-id]") ?? [])].find((el) => el.dataset.wordId === id)?.focus();
    return true;
  };
  const onWordFocus = (w: TranscriptWord) => setFocused(byId.get(w.id)!.i);

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
    <div className="transcript-editor" ref={root}>
      <p className="hint">{t("transcript.selectHint")} {t("transcript.noConfidence")}</p>
      {conflict ? <p className="error" role="alert">{t("transcript.conflict")}</p> : null}
      {save.isError && !conflict ? <p className="error">{errorText(save.error)}</p> : null}
      {sel && ((onCut && !readOnly) || onAddScene) ? (
        <div className="row selection-bar">
          {onCut && !readOnly ? (
            <button type="button" className="primary" onClick={() => { onCut(doc.words[sel.a]!.id, doc.words[sel.b]!.id); setSel(null); }}>
              {t("transcript.cutSelection", { n: selCount })}
            </button>
          ) : null}
          {onAddScene ? (
            <button type="button" className="primary" onClick={() => { onAddScene(doc.words[sel.a]!.id, doc.words[sel.b]!.id); setSel(null); }}>
              {t("plan.addScene", { n: selCount })}
            </button>
          ) : null}
          <button type="button" onClick={() => setSel(null)}>{t("transcript.clearSelection")}</button>
        </div>
      ) : null}
      <div className="segments" tabIndex={0} aria-label={t("video.tab.transcript")}>
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
                  {words.map((w, k) => {
                    const i = byId.get(w.id)!.i;
                    // «MAC» + «-адреса», «что» + «-то», пунктуация — без пробела и без зазора отступов
                    // слов (`.glued`, ревью Task 33 V3)
                    const glued = k > 0 && gluesToPrevious(w.text);
                    return (
                      <span key={w.id} className={glued ? "glued" : undefined}>
                        {k > 0 && !glued ? " " : null}
                        <WordSpan word={w} mapping={wordMap?.[w.id]} current={i === current} selected={sel !== null && i >= sel.a && i <= sel.b} tabStop={i === stop} onClick={click} onNav={nav} onFocus={onWordFocus} />
                      </span>
                    );
                  })}
                  {!readOnly && words.length > 0 ? " " : null}
                  {!readOnly && words.length > 0 ? (
                    // поле правки — слова через пробел, не `joinWords`: сервер разбирает текст по
                    // пробелам, и «MAC-адреса» слило бы «MAC» и «-адреса» в одно слово (ревью Task 33 M5)
                    <button type="button" className="link-button small" onClick={() => setEditing({ seg: seg.id, text: words.map((w) => w.text.trim()).join(" ") })}>
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
