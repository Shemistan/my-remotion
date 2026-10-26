// Границы сцены плана по словам (S21): начало и конец сдвигаются на соседнее услышанное слово
// («← слово» / «слово →»); вырезанные монтажом слова пропускаются, начало не позже конца. Каждый
// сдвиг — операция `modify` (новая ревизия плана; сервер пересчитывает время, цитату и окно речи).
// Ревью S21: граница не заходит на соседнюю сцену (не отклонённую, не stale anchor_cut) — иначе
// blocking `scene_overlap`; граница на вырезанном слове — сначала её (другую сервер не примет:
// `anchor_in_cut`); сдвиг, после которого ключевое слово окажется вне сцены (`key_term_outside`), —
// только после подтверждения.
import { type EditedTimeline, type PlanOp, type ScenePlanItem, type TranscriptWord, mapWords } from "@ms/contracts";
import { useEffect, useMemo, useState } from "react";
import { type TKey, t } from "../../i18n/index.js";
import { formatTimecode } from "../../video/use-timeline.js";

export interface SceneBoundsProps {
  item: ScenePlanItem;
  /** Сцены плана — соседи ограничивают сдвиг. */
  items?: readonly ScenePlanItem[];
  words: readonly TranscriptWord[];
  timeline: EditedTimeline;
  busy: boolean;
  onOps: (ops: PlanOp[]) => void;
}

type Key = "start_word_id" | "end_word_id";
interface Move { key: Key; to: number; terms: string[] }

export function SceneBounds({ item: x, items = [], words, timeline, busy, onOps }: SceneBoundsProps) {
  const map = useMemo(() => mapWords(timeline, [...words]), [words, timeline]);
  const [confirm, setConfirm] = useState<Move | null>(null);
  useEffect(() => setConfirm(null), [x.id, x.start_word_id, x.end_word_id]);
  const idx = useMemo(() => new Map(words.map((w, i) => [w.id, i])), [words]);
  const heard = (i: number) => {
    const m = map[words[i]!.id];
    return m !== undefined && m.state !== "removed";
  };
  const si = idx.get(x.start_word_id) ?? -1;
  const ei = idx.get(x.end_word_id) ?? -1;
  if (si < 0 || ei < si) return null;
  const last = words.length - 1;

  // соседи: предыдущая (начинается раньше) — её конец, следующая — её начало
  let prev: { id: string; end: number } | undefined;
  let next: { id: string; start: number } | undefined;
  for (const y of items) {
    if (y.id === x.id || y.status === "rejected" || (y.status === "stale" && y.stale_reason === "anchor_cut")) continue;
    const ys = idx.get(y.start_word_id);
    const ye = idx.get(y.end_word_id);
    if (ys === undefined || ye === undefined) continue;
    if (ys < si) {
      if (!prev || ye > prev.end) prev = { id: y.id, end: ye };
    } else if (ys > si && (!next || ys < next.start)) next = { id: y.id, start: ys };
  }

  /** Ближайшее услышанное слово от `from` в сторону `dir` в пределах `[lo, hi]`; нет — −1. */
  const step = (from: number, dir: -1 | 1, lo: number, hi: number): number => {
    for (let i = from + dir; i >= lo && i <= hi; i += dir) if (heard(i)) return i;
    return -1;
  };
  const startHeard = heard(si);
  const endHeard = heard(ei);
  const hints: string[] = [];
  let startEarlier = step(si, -1, 0, last);
  if (startEarlier >= 0 && prev && startEarlier <= prev.end) {
    startEarlier = -1;
    hints.push(t("planBounds.prevLimit", { id: prev.id }));
  }
  let endLater = step(ei, 1, 0, last);
  if (endLater >= 0 && next && endLater >= next.start) {
    endLater = -1;
    hints.push(t("planBounds.nextLimit", { id: next.id }));
  }
  const targets = { startEarlier, startLater: step(si, 1, 0, ei), endEarlier: step(ei, -1, si, last), endLater };
  // граница на вырезанном слове: сначала она (вторую сервер не примет — диапазон с вырезанным краем)
  const startLocked = startHeard && !endHeard;
  const endLocked = !startHeard;
  if (!startHeard) hints.push(t("planBounds.startCut"));
  else if (!endHeard) hints.push(t("planBounds.endCut"));

  const label = (i: number, k: TKey) => {
    const m = map[words[i]!.id];
    return t(k, { word: words[i]!.text, tc: m !== undefined && m.state !== "removed" ? formatTimecode(m.edited_start_us) : "—" });
  };
  const send = (key: Key, to: number) => onOps([{ op: "modify", item_id: x.id, patch: { [key]: words[to]!.id } }]);
  const request = (key: Key, to: number) => {
    const ns = key === "start_word_id" ? to : si;
    const ne = key === "end_word_id" ? to : ei;
    const terms = x.key_terms.filter((k) => {
      const i = idx.get(k.word_id);
      return i !== undefined && i >= si && i <= ei && (i < ns || i > ne);
    }).map((k) => k.text);
    if (terms.length > 0) setConfirm({ key, to, terms });
    else send(key, to);
  };
  const btn = (key: Key, to: number, locked: boolean, aria: TKey, text: TKey) => (
    <button type="button" className="small" aria-label={t(aria)} disabled={busy || locked || to < 0 || confirm !== null}
      onClick={() => request(key, to)}>{t(text)}</button>
  );
  return (
    <fieldset className="scene-bounds" aria-label={t("planBounds.title")}>
      <legend>{t("planBounds.title")}</legend>
      <div className="row wrap scene-bound">
        <span>{label(si, "planBounds.start")}</span>
        {btn("start_word_id", targets.startEarlier, startLocked, "planBounds.startEarlier", "planBounds.earlier")}
        {btn("start_word_id", targets.startLater, startLocked, "planBounds.startLater", "planBounds.later")}
      </div>
      <div className="row wrap scene-bound">
        <span>{label(ei, "planBounds.end")}</span>
        {btn("end_word_id", targets.endEarlier, endLocked, "planBounds.endEarlier", "planBounds.earlier")}
        {btn("end_word_id", targets.endLater, endLocked, "planBounds.endLater", "planBounds.later")}
      </div>
      {hints.map((h) => <p key={h} className="hint small" data-testid="bounds-hint">{h}</p>)}
      {confirm ? (
        <div className="row wrap" role="alert">
          <span>{t("planBounds.keyTermOutside", { text: confirm.terms.join(", ") })}</span>
          <button type="button" className="small" disabled={busy} onClick={() => { send(confirm.key, confirm.to); setConfirm(null); }}>{t("planBounds.confirm")}</button>
          <button type="button" className="small" onClick={() => setConfirm(null)}>{t("planBounds.cancel")}</button>
        </div>
      ) : null}
      <p className="muted small">{t("planBounds.hint")}</p>
    </fieldset>
  );
}
