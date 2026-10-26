// Границы сцены плана по словам (S21): начало и конец сдвигаются на соседнее услышанное слово
// («← слово» / «слово →»); вырезанные монтажом слова пропускаются, начало не позже конца. Каждый
// сдвиг — операция `modify` (новая ревизия плана; сервер пересчитывает время, цитату и окно речи).
// Граница на вырезанном слове (stale anchor_cut) тоже сдвигается — на ближайшее услышанное.
import { type EditedTimeline, type PlanOp, type ScenePlanItem, type TranscriptWord, mapWords } from "@ms/contracts";
import { useMemo } from "react";
import { type TKey, t } from "../../i18n/index.js";
import { formatTimecode } from "../../video/use-timeline.js";

export interface SceneBoundsProps {
  item: ScenePlanItem;
  words: readonly TranscriptWord[];
  timeline: EditedTimeline;
  busy: boolean;
  onOps: (ops: PlanOp[]) => void;
}

type Key = "start_word_id" | "end_word_id";

export function SceneBounds({ item: x, words, timeline, busy, onOps }: SceneBoundsProps) {
  const map = useMemo(() => mapWords(timeline, [...words]), [words, timeline]);
  const heard = (i: number) => {
    const m = map[words[i]!.id];
    return m !== undefined && m.state !== "removed";
  };
  const si = words.findIndex((w) => w.id === x.start_word_id);
  const ei = words.findIndex((w) => w.id === x.end_word_id);
  if (si < 0 || ei < si) return null;
  /** Ближайшее услышанное слово от `from` в сторону `dir` в пределах `[lo, hi]`; нет — −1. */
  const step = (from: number, dir: -1 | 1, lo: number, hi: number): number => {
    for (let i = from + dir; i >= lo && i <= hi; i += dir) if (heard(i)) return i;
    return -1;
  };
  const targets = {
    startEarlier: step(si, -1, 0, words.length - 1),
    startLater: step(si, 1, 0, ei),
    endEarlier: step(ei, -1, si, words.length - 1),
    endLater: step(ei, 1, 0, words.length - 1),
  };
  const label = (i: number, k: TKey) => {
    const m = map[words[i]!.id];
    return t(k, { word: words[i]!.text, tc: m !== undefined && m.state !== "removed" ? formatTimecode(m.edited_start_us) : "—" });
  };
  const btn = (key: Key, to: number, aria: TKey, text: TKey) => (
    <button type="button" className="small" aria-label={t(aria)} disabled={busy || to < 0}
      onClick={() => onOps([{ op: "modify", item_id: x.id, patch: { [key]: words[to]!.id } }])}>{t(text)}</button>
  );
  return (
    <fieldset className="scene-bounds" aria-label={t("planBounds.title")}>
      <legend>{t("planBounds.title")}</legend>
      <div className="row wrap scene-bound">
        <span>{label(si, "planBounds.start")}</span>
        {btn("start_word_id", targets.startEarlier, "planBounds.startEarlier", "planBounds.earlier")}
        {btn("start_word_id", targets.startLater, "planBounds.startLater", "planBounds.later")}
      </div>
      <div className="row wrap scene-bound">
        <span>{label(ei, "planBounds.end")}</span>
        {btn("end_word_id", targets.endEarlier, "planBounds.endEarlier", "planBounds.earlier")}
        {btn("end_word_id", targets.endLater, "planBounds.endLater", "planBounds.later")}
      </div>
      <p className="muted small">{t("planBounds.hint")}</p>
    </fieldset>
  );
}
