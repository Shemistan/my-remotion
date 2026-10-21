// Расписание импульсов PulseAlongPath — общее для самого импульса и для вспышки узла
// FlowGraph в момент его прихода (pulseArrival): один расчёт, кадры совпадают.
import type { Beat, StyleBible } from "@ms/contracts";
import { frames } from "../easing.js";
import { type CubicSegment, lutLength, pathLUT } from "../geometry.js";
import { arrivalInPass, pulsePass, pulseStarts } from "./pulse-timing.js";

// Чистое расписание (без remotion) — в pulse-timing.ts: его же считает сервер.
export { ARRIVAL_PX, EASE_PASS, PULSE_MIN_S, PULSE_PX_PER_S, arrivalInPass, pulsePass, pulseStarts } from "./pulse-timing.js";

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
