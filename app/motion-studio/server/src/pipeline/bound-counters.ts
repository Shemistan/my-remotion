// Счётчик, привязанный к голове линии (`content.bound_to: "<chart>.head"`, значение —
// `lineChartHead(...).value`): его бит счёта пайплайн ставит ровно на окно движения головы
// (`lineDrawWindow` бита рисования графика — то же, что `lineChartHead().startFrame /
// endFrame`). Director формулу окна не считает; QA-кадр «от» и OCR берутся по этому биту.
import type { Beat, Element, MotionSpec } from "@ms/contracts";
import { lineDrawWindow } from "@ms/render";
import { countBeat } from "./qa-frames.js";

const HEAD = /^(.+)\.head$/;

/** Счётчик и окно головы линии, к которой он привязан. */
export interface BoundCounter {
  number: string;
  chart: string;
  /** Бит счёта числа и бит рисования графика (id). */
  beat: string;
  chartBeat: string;
  startFrame: number;
  endFrame: number;
}

/** Бит рисования графика: первый с `draw` в действии, иначе первый бит графика. */
function chartBeatOf(spec: MotionSpec, chart: Element): Beat | undefined {
  const beats = spec.beats.filter((b) => b.element_ids.includes(chart.id)).sort((a, b) => a.start_frame - b.start_frame);
  return beats.find((b) => /draw/i.test(b.action)) ?? beats[0];
}

/** Числа с `bound_to: "<chart>.head"` на существующий график; счёт в бите самого графика — не в счёт. */
export function boundCounters(spec: MotionSpec): BoundCounter[] {
  const out: BoundCounter[] = [];
  for (const e of spec.elements.filter((x) => x.kind === "number")) {
    const m = typeof e.content.bound_to === "string" ? HEAD.exec(e.content.bound_to.trim()) : null;
    const chart = m ? spec.elements.find((x) => x.id === m[1] && x.kind === "chart") : undefined;
    if (!chart) continue;
    const beat = countBeat(spec, e);
    const chartBeat = chartBeatOf(spec, chart);
    if (!beat || !chartBeat || beat.id === chartBeat.id) continue;
    const w = lineDrawWindow(chartBeat);
    out.push({ number: e.id, chart: chart.id, beat: beat.id, chartBeat: chartBeat.id, startFrame: w.startFrame, endFrame: w.endFrame });
  }
  return out;
}

/** Биты счёта привязанных счётчиков — по окну головы линии. Новая spec и список правок. */
export function normalizeBoundCounters(spec: MotionSpec): { spec: MotionSpec; changes: string[] } {
  const changes: string[] = [];
  const fix = new Map<string, { start: number; end: number }>();
  for (const c of boundCounters(spec)) {
    const b = spec.beats.find((x) => x.id === c.beat)!;
    if (b.start_frame === c.startFrame && b.end_frame === c.endFrame) continue;
    if (fix.has(b.id)) continue;
    fix.set(b.id, { start: c.startFrame, end: c.endFrame });
    changes.push(`бит ${b.id} ${b.start_frame}–${b.end_frame} → ${c.startFrame}–${c.endFrame}: счётчик ${c.number} идёт за головой ${c.chart} (бит ${c.chartBeat})`);
  }
  if (fix.size === 0) return { spec, changes };
  const beats = spec.beats.map((b) => {
    const f = fix.get(b.id);
    return f ? { ...b, start_frame: f.start, end_frame: f.end } : b;
  });
  return { spec: { ...spec, beats }, changes };
}
