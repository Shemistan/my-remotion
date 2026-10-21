// Расписание импульсов PulseAlongPath — общее для самого импульса и для вспышки узла
// FlowGraph в момент его прихода (pulseArrival): один расчёт, кадры совпадают.
import type { Beat, StyleBible } from "@ms/contracts";
import { Easing } from "remotion";
import { frames } from "../easing.js";
import { type CubicSegment, lutLength, pathLUT } from "../geometry.js";

/** Кривая прохода импульса по пути (доля прохода → доля длины). */
export const EASE_PASS = Easing.bezier(0.45, 0.05, 0.4, 1);

/** Кадров на проход: `travel` или ~420 px/с с поправкой на интенсивность, не короче 0.6 с. */
export function pulsePass(len: number, travel: number | undefined, fps: number, s: StyleBible): number {
  return Math.max(1, travel ?? Math.max(Math.round(fps * 0.6), frames(s, (len / 420) * 30)));
}

/**
 * Старты проходов: k-й импульс из `count` сдвинут на pass·k/count, проходы повторяются,
 * пока старт раньше `end` (при `repeat`); начатый проход доигрывается.
 */
export function pulseStarts(o: { start: number; end: number; pass: number; count?: number; repeat?: boolean }): number[] {
  const n = Math.max(1, Math.floor(o.count ?? 1));
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    for (let c = 0; ; c++) {
      const t0 = o.start + (k * o.pass) / n + c * o.pass;
      if (t0 >= o.end || (c > 0 && o.repeat === false)) break;
      out.push(t0);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * Голова ближе этого расстояния к концу пути — импульс «пришёл»: яркое ядро головы
 * касается кромки узла (дальше голова тормозит и гаснет — узел её «поглощает»).
 */
export const ARRIVAL_PX = 10;

/**
 * Кадр прихода импульса в проходе со стартом `t0`: первый кадр, когда голова ближе
 * ARRIVAL_PX к концу пути (дробный, по кривой EASE_PASS). Короткий путь — сам старт.
 */
export function arrivalInPass(t0: number, pass: number, len: number): number {
  const target = Math.max(0, 1 - ARRIVAL_PX / Math.max(1, len));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (EASE_PASS(mid) < target) lo = mid;
    else hi = mid;
  }
  return t0 + hi * pass;
}

/** Импульс, по приходу которого вспыхивает узел FlowGraph (`FlowNode.flash`). */
export interface PulseArrival {
  edgeId: string;
  beat: Pick<Beat, "start_frame" | "end_frame">;
  travel?: number;
  count?: number;
  repeat?: boolean;
}

/**
 * Приход импульса по ребру `edgeId` — те же `beat` / `travel` / `count` / `repeat`, что у
 * <PulseAlongPath>. Кадры считает FlowGraph по своей геометрии (ребро рисуется не сразу,
 * длина пути задаёт проход): передай в `FlowNode.flash` — узел вспыхнет на каждом
 * приходе; кадр прихода внутри графа — `useFlowGeometry()?.arrivals(...)`.
 */
export function pulseArrival(edgeId: string, beat: Pick<Beat, "start_frame" | "end_frame">, travel?: number, opts: { count?: number; repeat?: boolean } = {}): PulseArrival {
  return { edgeId, beat, travel, ...opts };
}

/** Импульс по пути вне графа (свои дорожки): те же поля, что у PulseAlongPath. */
export interface PathArrival {
  beat: Pick<Beat, "start_frame" | "end_frame">;
  travel?: number;
  count?: number;
  repeat?: boolean;
}

/**
 * Кадры прихода импульсов по пути `segments` (дробные, по возрастанию) — то же
 * расписание, что у <PulseAlongPath segments=…>: LUT 40, pulsePass, pulseStarts.
 * `ready` — кадр, раньше которого импульсы не стартуют (ребро графа ещё рисуется).
 */
export function pathArrivals(segments: CubicSegment[], a: PathArrival, s: StyleBible, fps: number, ready = 0): number[] {
  if (segments.length === 0) return [];
  const len = lutLength(pathLUT(segments, 40));
  const pass = pulsePass(len, a.travel, fps, s);
  const start = Math.max(a.beat.start_frame, ready);
  return pulseStarts({ start, end: a.beat.end_frame, pass, count: a.count, repeat: a.repeat }).map((t0) => arrivalInPass(t0, pass, len));
}

export interface ArrivalCount {
  /** Пришло импульсов к кадру. */
  count: number;
  /** Значение счётчика: from + count × per. */
  value: number;
  /** Кадр последнего прихода (null — ещё ни одного). */
  last: number | null;
  /** Микро-«удар» 0..1 на каждом приходе: 1 в кадр прихода, гаснет за ~10 кадров. */
  pop: number;
  /** Всего приходов в расписании. */
  total: number;
}

/**
 * Счётчик событий по кадрам прихода `at` (чистая функция): число на экране растёт ровно в
 * кадры, когда импульс касается цели, — не плавной кривой отдельно от движения.
 */
export function arrivalCount(at: readonly number[], frame: number, s: StyleBible, o: { per?: number; from?: number } = {}): ArrivalCount {
  let count = 0;
  let last: number | null = null;
  for (const t of at) {
    if (t > frame) break;
    count++;
    last = t;
  }
  const L = frames(s, 10);
  const d = last === null ? Infinity : frame - last;
  const pop = d < L ? (1 - d / L) ** 2 : 0;
  return { count, value: (o.from ?? 0) + count * (o.per ?? 1), last, pop, total: at.length };
}
