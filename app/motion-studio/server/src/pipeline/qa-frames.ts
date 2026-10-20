// Кадры QA (06-motion-engine.md §6) по битам спецификации.
import type { MotionSpec } from "@ms/contracts";

export const MAX_QA_FRAMES = 6;
/** Кадры ближе этого расстояния считаются дублями. */
export const MIN_QA_GAP = 10;

const ENTRANCE = /(entrance|enter|intro|reveal|appear|(^|-)in$)/i;
const ACCENT = /(emphasis|accent|final|climax|peak|highlight|payoff)/i;
const HOLD = /hold/i;
// основное действие («chart-draw-in», «hero-count-in») — не вход, даже с суффиксом -in
const ACTION = /(draw|count|grow|flow|build|fanout|return|pulse)/i;

/**
 * Обязательные кадры: конец последнего бита входа (все входы завершены; биты основного
 * действия вроде `chart-draw-in` входами не считаются), середина
 * бита акцента (последний бит emphasis/accent/final…; нет такого — последний бит до hold),
 * последний кадр. Остальное — середины битов, жадно по наибольшему расстоянию до уже
 * выбранных; кадры ближе MIN_QA_GAP отбрасываются; не больше MAX_QA_FRAMES. Кадры
 * внутри входа текстового элемента (заголовок наполовину вошёл) не берутся.
 */
export function qaFrames(spec: MotionSpec, durationFrames: number): number[] {
  const last = durationFrames - 1;
  const clamp = (f: number) => Math.max(0, Math.min(last, Math.round(f)));
  const mid = (b: { start_frame: number; end_frame: number }) => clamp((b.start_frame + b.end_frame) / 2);
  const beats = [...spec.beats].sort((a, b) => a.start_frame - b.start_frame || a.end_frame - b.end_frame);
  const kind = new Map(spec.elements.map((e) => [e.id, e.kind]));

  const entrances = beats.filter((b) => ENTRANCE.test(b.action) && !ACCENT.test(b.action) && !ACTION.test(b.action));
  const textEntrances = entrances.filter((b) => b.element_ids.some((id) => kind.get(id) === "text"));
  const insideTextEntrance = (f: number) => textEntrances.some((b) => f > b.start_frame && f < b.end_frame);

  const entranceEnd = clamp(entrances.length > 0 ? Math.max(...entrances.map((b) => b.end_frame)) : (beats[0]?.end_frame ?? 0));
  const accents = beats.filter((b) => ACCENT.test(b.action) && !HOLD.test(b.action));
  const nonHold = beats.filter((b) => !HOLD.test(b.action));
  const accentBeat = accents.at(-1) ?? nonHold.at(-1) ?? beats.at(-1);

  // обязательные — без проверки расстояния (только без точных дублей)
  const chosen = [...new Set([last, entranceEnd, ...(accentBeat ? [mid(accentBeat)] : [])])];

  // середины чистых входов (элемент ещё проявляется) не берём
  const pool = [...new Set(beats.filter((b) => !entrances.includes(b)).map(mid))].filter((f) => !insideTextEntrance(f));
  while (chosen.length < MAX_QA_FRAMES) {
    let best: number | undefined;
    let bestDist = -1;
    for (const f of pool) {
      const d = Math.min(...chosen.map((c) => Math.abs(c - f)));
      if (d >= MIN_QA_GAP && d > bestDist) {
        best = f;
        bestDist = d;
      }
    }
    if (best === undefined) break;
    chosen.push(best);
  }
  return chosen.sort((a, b) => a - b);
}
