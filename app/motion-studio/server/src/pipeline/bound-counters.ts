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

/** Бит рисования графика — бит графика с `draw` в действии (по времени первый). */
function chartBeatOf(spec: MotionSpec, chart: Element): Beat | undefined {
  return spec.beats.filter((b) => b.element_ids.includes(chart.id) && /draw/i.test(b.action)).sort((a, b) => a.start_frame - b.start_frame)[0];
}

/** Привязанные счётчики и предупреждения о тех, что нельзя привязать. */
function scan(spec: MotionSpec): { counters: BoundCounter[]; warnings: string[] } {
  const counters: BoundCounter[] = [];
  const warnings: string[] = [];
  for (const e of spec.elements.filter((x) => x.kind === "number")) {
    const m = typeof e.content.bound_to === "string" ? HEAD.exec(e.content.bound_to.trim()) : null;
    const chart = m ? spec.elements.find((x) => x.id === m[1] && x.kind === "chart") : undefined;
    if (!chart) continue;
    const beat = countBeat(spec, e);
    const chartBeat = chartBeatOf(spec, chart);
    if (!chartBeat) {
      warnings.push(`счётчик ${e.id} привязан к ${chart.id}.head, но у ${chart.id} нет бита с draw в действии — бит счёта не выровнен по голове линии`);
      continue;
    }
    if (!beat || beat.id === chartBeat.id) continue;
    const w = lineDrawWindow(chartBeat);
    const endFrame = Math.min(w.endFrame, spec.duration_frames);
    if (endFrame <= w.startFrame) {
      warnings.push(`счётчик ${e.id}: окно головы ${chart.id} (${w.startFrame}–${w.endFrame}) вне сцены (${spec.duration_frames} кадров) — бит ${beat.id} не тронут`);
      continue;
    }
    counters.push({ number: e.id, chart: chart.id, beat: beat.id, chartBeat: chartBeat.id, startFrame: w.startFrame, endFrame });
  }
  return { counters, warnings };
}

/** Числа с `bound_to: "<chart>.head"` на график с битом рисования; счёт в бите самого графика — не в счёт. */
export function boundCounters(spec: MotionSpec): BoundCounter[] {
  return scan(spec).counters;
}

/** Свободный id бита счёта: `<number>-count`, при совпадении — с номером. */
function freeBeatId(beats: readonly Beat[], number: string): string {
  const taken = new Set(beats.map((b) => b.id));
  let id = `${number}-count`;
  for (let k = 2; taken.has(id); k++) id = `${number}-count-${k}`;
  return id;
}

/**
 * Биты счёта привязанных счётчиков — по окну головы линии. Бит только этого числа
 * переписывается на месте; бит, который делят другие элементы, не меняется: число уходит
 * из него в свой бит счёта. Новая spec, список правок и предупреждения.
 */
export function normalizeBoundCounters(spec: MotionSpec): { spec: MotionSpec; changes: string[]; warnings: string[] } {
  const { counters, warnings } = scan(spec);
  const changes: string[] = [];
  let beats = spec.beats;
  for (const c of counters) {
    const b = beats.find((x) => x.id === c.beat)!;
    if (b.start_frame === c.startFrame && b.end_frame === c.endFrame) continue;
    if (b.element_ids.every((id) => id === c.number)) {
      beats = beats.map((x) => (x.id === b.id ? { ...x, start_frame: c.startFrame, end_frame: c.endFrame } : x));
      changes.push(`бит ${b.id} ${b.start_frame}–${b.end_frame} → ${c.startFrame}–${c.endFrame}: счётчик ${c.number} идёт за головой ${c.chart} (бит ${c.chartBeat})`);
      continue;
    }
    const own: Beat = {
      id: freeBeatId(beats, c.number),
      start_frame: c.startFrame,
      end_frame: c.endFrame,
      action: "count-follow-head",
      description: `${c.number} считает за головой линии ${c.chart}: значение — lineChartHead(...).value, окно головы бита ${c.chartBeat}`,
      element_ids: [c.number],
    };
    beats = beats.map((x) => (x.id === b.id ? { ...x, element_ids: x.element_ids.filter((id) => id !== c.number) } : x));
    const at = beats.findIndex((x) => x.start_frame > own.start_frame);
    beats = at < 0 ? [...beats, own] : [...beats.slice(0, at), own, ...beats.slice(at)];
    changes.push(`бит ${b.id} делят другие элементы: счёт ${c.number} вынесен в бит ${own.id} ${c.startFrame}–${c.endFrame} за головой ${c.chart} (бит ${c.chartBeat})`);
  }
  // вход числа кончается до того, как тронулась голова: иначе QA-кадр «от» (конец входа)
  // попадает уже в счёт и показывает не «от»
  for (const c of counters) {
    const count = beats.find((x) => x.element_ids.includes(c.number) && x.start_frame === c.startFrame && x.end_frame === c.endFrame);
    const entry = [...beats].sort((a, b) => a.start_frame - b.start_frame).find((x) => x.element_ids.includes(c.number) && x !== count && x.start_frame < c.startFrame);
    if (!entry || entry.end_frame <= c.startFrame) continue;
    if (!entry.element_ids.every((id) => id === c.number)) {
      warnings.push(`вход ${c.number} (бит ${entry.id} ${entry.start_frame}–${entry.end_frame}) кончается после старта головы ${c.chart} (${c.startFrame}); бит общий — не сдвинут`);
      continue;
    }
    const len = entry.end_frame - entry.start_frame;
    const start = Math.max(0, c.startFrame - len);
    beats = beats.map((x) => (x.id === entry.id ? { ...x, start_frame: start, end_frame: c.startFrame } : x));
    changes.push(`бит ${entry.id} ${entry.start_frame}–${entry.end_frame} → ${start}–${c.startFrame}: вход ${c.number} кончается, когда голова ${c.chart} трогается`);
  }
  return { spec: beats === spec.beats ? spec : { ...spec, beats }, changes, warnings };
}
