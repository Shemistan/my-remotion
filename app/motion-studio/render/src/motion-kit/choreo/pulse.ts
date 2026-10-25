// Расписание импульсов PulseAlongPath — общее для самого импульса и для вспышки узла
// FlowGraph в момент его прихода (pulseArrival): один расчёт, кадры совпадают.
import type { Beat, StyleBible } from "@ms/contracts";
import { frames } from "../easing.js";
import { type CubicSegment, lutLength, pathLUT } from "../geometry.js";
import { HOLD_RATE, type Hold, steadyStarts } from "./hold.js";
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
  /** Удержание сцены — то же, что `hold` у PulseAlongPath этого пути (вне графа). */
  hold?: Hold;
}

/**
 * Кадры прихода импульсов по пути `segments` (дробные, по возрастанию) — то же
 * расписание, что у <PulseAlongPath segments=…>: LUT 40, pulsePass, pulseStarts.
 * `ready` — кадр, раньше которого импульсы не стартуют (ребро графа ещё рисуется).
 */
export function pathArrivals(segments: CubicSegment[], a: PathArrival, s: StyleBible, fps: number, ready = 0, hold?: FlowHoldCtx): number[] {
  if (segments.length === 0) return [];
  const { starts, pass, len } = pathStarts(segments, a, s, fps, ready, hold);
  return starts.map((t0) => arrivalInPass(t0, pass, len));
}

/** Удержание сцены для потоков: режим, бит hold, длительность сцены, рёбра steady-flow. */
export interface FlowHoldCtx {
  hold: Hold;
  /** Длительность сцены, кадры (якорь циклов удержания). */
  end: number;
  /** Рёбра, чьи потоки steady-flow продолжает (по умолчанию — шедшие до удара). */
  edges?: readonly string[];
  /** Ребро потока (внутри графа). */
  edgeId?: string;
}

/** steady-flow продолжает поток, кончившийся не раньше чем за STEADY_RECENT_S до удержания. */
export const STEADY_RECENT_S = 1.5;

/**
 * Старты проходов импульса по пути с учётом удержания (hold engine 0.5.0): в удержании
 * новые проходы не начинаются — поток стоит после итога; `steady-flow` продолжает поток
 * тише (темп 60 %, `steadyStarts`), если он шёл до удара (или его ребро в `edges`).
 * Начатый проход доигрывается. Один расчёт для импульса, вспышки узла и счётчика.
 */
export function pathStarts(segments: CubicSegment[], a: PathArrival, s: StyleBible, fps: number, ready = 0, h?: FlowHoldCtx): { starts: number[]; pass: number; len: number } {
  const len = segments.length === 0 ? 0 : lutLength(pathLUT(segments, 40));
  const pass = pulsePass(len, a.travel, fps, s);
  const start = Math.max(a.beat.start_frame, ready);
  const cut = h ? Math.min(a.beat.end_frame, h.hold.beat.start_frame) : a.beat.end_frame;
  const base = pulseStarts({ start, end: cut, pass, count: a.count, repeat: a.repeat });
  if (!h || h.hold.mode !== "steady-flow" || a.repeat === false) return { starts: base, pass, len };
  const listed = h.edges ? h.edgeId !== undefined && h.edges.includes(h.edgeId) : a.beat.end_frame >= h.hold.beat.start_frame - Math.round(STEADY_RECENT_S * fps);
  if (!listed) return { starts: base, pass, len };
  const n = Math.max(1, Math.floor(a.count ?? 1));
  if (base.length === 0) {
    // поток с бита внутри удержания (S3-fix, held-queue): steady-flow ведёт его в своём
    // темпе с его же старта — иначе поток не шёл вовсе и финал стоял
    if (start >= a.beat.end_frame || start < h.hold.beat.start_frame) return { starts: base, pass, len };
    const step0 = pass / HOLD_RATE / n;
    const calm = steadyStarts(h.hold, pass, s, h.end, { count: n, after: start - step0 }).filter((t) => t >= start);
    return { starts: calm.length > 0 ? calm : [start], pass, len };
  }
  const calm = steadyStarts(h.hold, pass, s, h.end, { count: n, after: base.at(-1)! });
  return { starts: [...base, ...calm], pass, len };
}

/**
 * steady-flow (S3-fix2): у потока в удержании начат новый проход — поток правда продолжается
 * (а не только доигрывает проход, начатый до удара).
 */
export function steadyContinues(starts: readonly number[], holdStart: number): boolean {
  return starts.some((t) => t >= holdStart);
}

/**
 * steady-flow (S3-fix2): в кадре `frame` удержания поток ещё ведёт финал — от начала
 * удержания до конца последнего прохода, видимого в нём. Проба QA метит режим по этому
 * признаку, а не по включённому режиму: застывшая схема под steady-flow метки не получает.
 */
export function steadyLive(starts: readonly number[], pass: number, holdStart: number, frame: number): boolean {
  if (frame < holdStart) return false;
  const seen = starts.filter((t) => t + pass > holdStart);
  return seen.length > 0 && steadyContinues(starts, holdStart) && frame < Math.max(...seen) + pass;
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
