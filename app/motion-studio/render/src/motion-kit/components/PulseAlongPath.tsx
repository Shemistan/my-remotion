// Световой импульс по пути: яркая голова с ореолом и хвост-комета с градиентом.
// Положение — точка на длине пути из LUT (pathLUT / pointAtLength), а не DOM
// getPointAtLength: результат одинаков в любом окружении. Внутри FlowGraph путь
// берётся по edgeId; вне графа — из segments (координаты родителя).
import type { Beat } from "@ms/contracts";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE_PASS, pulsePass } from "../choreo/pulse.js";
import { type CubicSegment, lutLength, pathLUT, pointAtLength, pointsBetween, polylineD } from "../geometry.js";
import { CLAMP, useSvgId } from "../internal.js";
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
}

export function PulseAlongPath({ edgeId, segments, beat, color, tail = 120, size = 7, count = 1, travel, repeat = true, reverse = false }: PulseAlongPathProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flow = useFlowGeometry();
  const id = useSvgId("ms-pulse");
  const seg = edgeId ? flow?.edges.get(edgeId) : undefined;
  const path = seg ? [seg] : (segments ?? []);
  if (path.length === 0) return null;

  const lut = pathLUT(path, 40);
  const len = lutLength(lut);
  const col = color ?? accent(s, 1);
  const core = mix(col, "#ffffff", 0.75);
  // по умолчанию ~ 420 px/с с поправкой на интенсивность, не короче 0.6 с (общий расчёт с pulseArrival)
  const pass = pulsePass(len, travel, fps, s);
  // внутри графа не стартуем раньше, чем ребро дорисовано
  const start = Math.max(beat.start_frame, (edgeId && flow?.ready.get(edgeId)) || 0);
  const n = Math.max(1, Math.floor(count));

  const pulses = Array.from({ length: n }, (_, k) => {
    const t0 = start + (k * pass) / n;
    const local = frame - t0;
    if (local < 0) return null;
    const cycle = Math.floor(local / pass);
    if (!repeat && cycle > 0) return null;
    // начатый до конца бита проход доигрывается, новые не стартуют
    if (t0 + cycle * pass >= beat.end_frame) return null;
    const ph = (local - cycle * pass) / pass;
    const e = EASE_PASS(ph);
    const sHead = (reverse ? 1 - e : e) * len;
    const sTail = reverse ? sHead + tail : sHead - tail;
    const fade = interpolate(ph, [0, 0.08, 0.86, 1], [0, 1, 1, 0], CLAMP);
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
