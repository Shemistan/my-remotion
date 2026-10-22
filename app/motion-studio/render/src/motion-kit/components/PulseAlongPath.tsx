// Световой импульс по пути: яркая голова с ореолом и хвост-комета с градиентом.
// Положение — точка на длине пути из LUT (pathLUT / pointAtLength), а не DOM
// getPointAtLength: результат одинаков в любом окружении. Внутри FlowGraph путь
// берётся по edgeId; вне графа — из segments (координаты родителя).
import type { Beat } from "@ms/contracts";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Hold } from "../choreo/hold.js";
import { type ArrivalCount, EASE_PASS, type PathArrival, type PulseArrival, arrivalCount, pathArrivals, pathStarts } from "../choreo/pulse.js";
import { type CubicSegment, type PathLUT, lutLength, pathLUT, pointAtLength, pointsBetween, polylineD } from "../geometry.js";
import { CLAMP, kitWarn, useSvgId } from "../internal.js";
import { useStyle } from "../style.js";
import { accent, mix } from "../tokens.js";
import { useFlowGeometry } from "./FlowGraph.js";

export interface PulseAlongPathProps {
  /** Ребро FlowGraph (компонент внутри <FlowGraph>). */
  edgeId?: string;
  /** Путь вне графа: сегменты в px родителя. */
  segments?: CubicSegment[];
  beat: Pick<Beat, "start_frame" | "end_frame">;
  color?: string;
  /** Длина хвоста, px (по умолчанию 120). */
  tail?: number;
  /** Радиус головы, px (по умолчанию 7). */
  size?: number;
  /** Импульсов на пути одновременно (по умолчанию 1). */
  count?: number;
  /** Кадров на один проход; по умолчанию от длины пути. */
  travel?: number;
  /** Повторять проходы до конца бита (по умолчанию да); начатый проход доигрывается. */
  repeat?: boolean;
  /** Обратное направление (данные возвращаются). */
  reverse?: boolean;
  /**
   * Удержание сцены (0.5.0) для пути вне графа; внутри <FlowGraph hold> берётся у графа.
   * В удержании поток стоит, `steady-flow` — продолжает тише (60 % темпа).
   */
  hold?: Hold;
}

export function PulseAlongPath({ edgeId, segments, beat, color, tail = 120, size = 7, count = 1, travel, repeat = true, reverse = false, hold }: PulseAlongPathProps) {
  const s = useStyle();
  const { fps, durationInFrames } = useVideoConfig();
  const flow = useFlowGeometry();
  const seg = edgeId ? flow?.edges.get(edgeId) : undefined;
  const path = seg ? [seg] : (segments ?? []);
  if (edgeId && !seg && !segments) {
    const m = flow ? `PulseAlongPath: в графе нет ребра "${edgeId}" — импульса нет.` : `PulseAlongPath: edgeId "${edgeId}" вне <FlowGraph> — импульса нет. Ставь в children графа или передай segments.`;
    kitWarn(`pulse:${m}`, m);
  }
  if (path.length === 0) return null;
  // внутри графа не стартуем раньше, чем ребро дорисовано; общее расписание с pulseArrival /
  // useArrivalCount (начатый проход доигрывается; удержание — по hold графа или своему)
  const ready = (seg && edgeId && flow?.ready.get(edgeId)) || 0;
  const h = seg && flow?.hold ? { ...flow.hold, edgeId } : hold ? { hold, end: durationInFrames } : undefined;
  const { starts, pass } = pathStarts(path, { beat, travel, count, repeat }, s, fps, ready, h);
  return <PulseTrails lut={pathLUT(path, 40)} starts={starts} pass={pass} color={color} tail={tail} size={size} reverse={reverse} />;
}

/** Импульсы по LUT пути: старты проходов `starts`, проход `pass` кадров (общий рисунок kit). */
export function PulseTrails({ lut, starts, pass, color, tail = 120, size = 7, reverse = false, opacity = 1 }: { lut: PathLUT; starts: readonly number[]; pass: number; color?: string; tail?: number; size?: number; reverse?: boolean; opacity?: number }) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const id = useSvgId("ms-pulse");
  const len = lutLength(lut);
  const col = color ?? accent(s, 1);
  const core = mix(col, "#ffffff", 0.75);
  const pulses = starts.map((t0, k) => {
    const local = frame - t0;
    if (local < 0 || local >= pass) return null;
    const ph = local / pass;
    const e = EASE_PASS(ph);
    const sHead = (reverse ? 1 - e : e) * len;
    const sTail = reverse ? sHead + tail : sHead - tail;
    const fade = interpolate(ph, [0, 0.08, 0.86, 1], [0, 1, 1, 0], CLAMP) * opacity;
    const head = pointAtLength(lut, sHead);
    const tp = pointsBetween(lut, sTail, sHead);
    const from = reverse ? tp.at(-1)! : tp[0]!;
    return { k, head, d: polylineD(tp), from, fade };
  });

  return (
    <svg style={{ position: "absolute", inset: 0, overflow: "visible" }} width="100%" height="100%">
      <defs>
        <filter id={`${id}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={size * 0.9} />
        </filter>
        <radialGradient id={`${id}-halo`}>
          <stop offset="0%" stopColor={col} stopOpacity={0.85} />
          <stop offset="45%" stopColor={col} stopOpacity={0.25} />
          <stop offset="100%" stopColor={col} stopOpacity={0} />
        </radialGradient>
        {pulses.map((p) =>
          p ? (
            <linearGradient key={p.k} id={`${id}-tail-${p.k}`} gradientUnits="userSpaceOnUse" x1={p.from.x} y1={p.from.y} x2={p.head.x} y2={p.head.y}>
              <stop offset="0%" stopColor={col} stopOpacity={0} />
              <stop offset="100%" stopColor={col} stopOpacity={1} />
            </linearGradient>
          ) : null,
        )}
      </defs>
      {pulses.map((p) =>
        p ? (
          <g key={p.k} opacity={p.fade}>
            <path d={p.d} fill="none" stroke={`url(#${id}-tail-${p.k})`} strokeWidth={size * 2.2} strokeLinecap="round" filter={`url(#${id}-blur)`} />
            <path d={p.d} fill="none" stroke={`url(#${id}-tail-${p.k})`} strokeWidth={size * 0.9} strokeLinecap="round" />
            <circle cx={p.head.x} cy={p.head.y} r={size * 4.5} fill={`url(#${id}-halo)`} />
            <circle cx={p.head.x} cy={p.head.y} r={size} fill={core} />
          </g>
        ) : null,
      )}
    </svg>
  );
}

/**
 * Почему счётчик по приходам останется нулём (чистая функция): `pulseArrival` по ребру вне
 * <FlowGraph> или по ребру, которого в графе нет. null — источник в порядке.
 */
export function arrivalSourceIssue(a: PulseArrival | (PathArrival & { segments: CubicSegment[] }), flow: Pick<NonNullable<ReturnType<typeof useFlowGeometry>>, "edges"> | null): string | null {
  if ("segments" in a) return null;
  if (!flow) return `useArrivalCount: pulseArrival("${a.edgeId}") вне <FlowGraph> — счётчик стоит на нуле. Ставь хук в children/overlay графа или передай { segments, beat, travel }.`;
  if (!flow.edges.has(a.edgeId)) return `useArrivalCount: в графе нет ребра "${a.edgeId}" — счётчик стоит на нуле.`;
  return null;
}

/**
 * Счётчик событий по приходам импульсов (хук): `count` растёт ровно в кадр, когда импульс
 * касается цели, `pop` — микро-удар на каждом приходе (для `AnimatedNumber pop`).
 * Внутри <FlowGraph> — `pulseArrival(edgeId, beat, travel, { count, repeat })` (те же поля,
 * что у PulseAlongPath на этом ребре); вне графа — `{ segments, beat, travel, count, repeat }`.
 * `per` — единиц на приход, `from` — стартовое значение.
 */
export function useArrivalCount(a: PulseArrival | (PathArrival & { segments: CubicSegment[] }), o: { per?: number; from?: number } = {}): ArrivalCount {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const flow = useFlowGeometry();
  const issue = arrivalSourceIssue(a, flow);
  if (issue) kitWarn(`arrival:${issue}`, issue);
  const at = "segments" in a ? pathArrivals(a.segments, a, s, fps, 0, a.hold ? { hold: a.hold, end: durationInFrames } : undefined) : (flow?.arrivals(a) ?? []);
  return arrivalCount(at, frame, s, o);
}
