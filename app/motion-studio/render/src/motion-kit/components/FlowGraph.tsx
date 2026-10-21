// Схема-граф: узлы — карточки с глубиной, рёбра — S-кривые между портами. Узлы входят
// слева направо из глубины, рёбра прорисовываются, когда оба конца на месте. Дочерние
// элементы (PulseAlongPath) рисуются в той же системе координат над рёбрами.
import type { Beat } from "@ms/contracts";
import { type ReactNode, createContext, useContext } from "react";
import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { edgeDelay } from "../choreo/rhythm.js";
import { EASE, frames, springAt } from "../easing.js";
import { type CubicSegment, type Point, cubicPoint, edgeSegment, lutLength, pathD, pathLUT } from "../geometry.js";
import { CLAMP, clamp01 } from "../internal.js";
import { typeSize } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { type Elevation, accent, alpha, fontFamily, radius, space } from "../tokens.js";
import { type CardEnter, cardEnterStyle, cardSurface } from "./Card.js";

export interface FlowNode {
  id: string;
  label: string;
  /** Левый верхний угол и размер, px в системе координат графа. */
  x: number;
  y: number;
  w: number;
  h: number;
  elevation?: Elevation;
  /** Подпись второй строкой (мельче, приглушённо). */
  caption?: string;
  /** Индекс акцента маркера узла. */
  accentIndex?: number;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
}

export interface FlowGraphProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Размер области графа; по умолчанию — по крайним узлам. */
  width?: number;
  height?: number;
  /** Вход узлов: flip (по умолчанию), scale, rise. */
  enter?: CardEnter;
  /** Импульсы и прочие слои поверх рёбер. */
  children?: ReactNode;
}

interface FlowGeometry {
  edges: ReadonlyMap<string, CubicSegment>;
  /** Кадр, когда ребро дорисовано (импульсы раньше не пускать). */
  ready: ReadonlyMap<string, number>;
}

const FlowContext = createContext<FlowGeometry | null>(null);

/** Геометрия рёбер ближайшего FlowGraph (null вне графа). */
export const useFlowGeometry = () => useContext(FlowContext);

/**
 * Порты ребра: горизонтально (правый край → левый), если узлы разнесены по x хотя бы
 * на 16 px — схемы читаются слева направо; иначе вертикально (низ → верх).
 */
export function edgePath(a: FlowNode, b: FlowNode): CubicSegment {
  const gapX = b.x >= a.x + a.w ? b.x - (a.x + a.w) : a.x >= b.x + b.w ? a.x - (b.x + b.w) : -1;
  if (gapX >= 16) {
    const right = b.x >= a.x;
    const p: Point = { x: right ? a.x + a.w : a.x, y: a.y + a.h / 2 };
    const q: Point = { x: right ? b.x : b.x + b.w, y: b.y + b.h / 2 };
    return edgeSegment(p, q, "h");
  }
  const down = b.y >= a.y;
  const p: Point = { x: a.x + a.w / 2, y: down ? a.y + a.h : a.y };
  const q: Point = { x: b.x + b.w / 2, y: down ? b.y : b.y + b.h };
  return edgeSegment(p, q, "v");
}

export function FlowGraph({ nodes, edges, beat, width, height, enter = "flip", children }: FlowGraphProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height: frameH } = useVideoConfig();
  const W = width ?? Math.max(...nodes.map((n) => n.x + n.w));
  const H = height ?? Math.max(...nodes.map((n) => n.y + n.h));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const { start_frame: b0, end_frame: b1 } = beat;
  const L = Math.max(1, b1 - b0);
  // порядок входа: слева направо, сверху вниз; узлы занимают первые ~45% бита
  const order = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y);
  const gap = Math.min(s.motion.stagger_frames * 2.5, (L * 0.45) / Math.max(1, nodes.length - 1));
  const nodeStart = new Map(order.map((n, i) => [n.id, b0 + i * gap + random(`node-${n.id}`) * gap * 0.4]));
  const drawLen = Math.max(1, Math.round(s.motion.enter_frames * 1.1));

  const geo = new Map<string, CubicSegment>();
  const ready = new Map<string, number>();
  const edgeStart = new Map<string, number>();
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    geo.set(e.id, edgePath(a, b));
    const t0 = Math.max(nodeStart.get(a.id)!, nodeStart.get(b.id)!) + edgeDelay(s);
    edgeStart.set(e.id, t0);
    ready.set(e.id, t0 + drawLen);
  }

  // единый кегль подписей графа: самый крупный, при котором каждая подпись влезает в
  // свой узел без многоточия (оценка ширины: 0.57 em на символ), но не крупнее уровня
  // caption шкалы кадра и не меньше 16 px
  const padX = space(s, 0.5);
  const DOT = 12;
  const labelSize = Math.max(
    16,
    Math.floor(Math.min(typeSize(s, "caption", frameH), ...nodes.map((n) => (n.w - 2 * padX - DOT - padX * 0.75) / (Math.max(1, Array.from(n.label).length) * 0.57)))),
  );
  const capSize = Math.min(Math.round(typeSize(s, "caption", frameH) * 0.6), Math.round(labelSize * 0.72));

  return (
    <FlowContext.Provider value={{ edges: geo, ready }}>
      <div style={{ position: "relative", width: W, height: H }}>
        <svg width={W} height={H} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {edges.map((e) => {
            const seg = geo.get(e.id);
            if (!seg) return null;
            const t0 = edgeStart.get(e.id)!;
            const p = interpolate(frame, [t0, t0 + drawLen], [0, 1], { ...CLAMP, easing: EASE.outQuart });
            const len = lutLength(pathLUT([seg], 24));
            const end = seg[3];
            const tip = cubicPoint(seg[0], seg[1], seg[2], seg[3], 0.999);
            const ang = (Math.atan2(end.y - tip.y, end.x - tip.x) * 180) / Math.PI;
            const arrow = springAt(frame, fps, s, t0 + drawLen * 0.8, "snappy");
            // при p = 0 круглый конец пунктира рисует точку на конце пути — не рисуем
            if (p <= 0) return null;
            return (
              <g key={e.id}>
                <path d={pathD([seg])} fill="none" stroke={alpha(s.palette.text, 0.06)} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - p)} />
                <path d={pathD([seg])} fill="none" stroke={alpha(s.palette.muted, 0.75)} strokeWidth={2} strokeLinecap="round" strokeDasharray={`${len} ${len}`} strokeDashoffset={len * (1 - p)} />
                <circle cx={seg[0].x} cy={seg[0].y} r={4 * clamp01(p * 4)} fill={s.palette.muted} />
                <path
                  d="M -11 -7 L 1 0 L -11 7 Z"
                  fill={s.palette.muted}
                  transform={`translate(${end.x} ${end.y}) rotate(${ang.toFixed(2)}) scale(${Math.max(0, arrow).toFixed(4)})`}
                />
              </g>
            );
          })}
        </svg>

        {/* слой импульсов: над рёбрами, под карточками */}
        <div style={{ position: "absolute", inset: 0 }}>{children}</div>

        {nodes.map((n) => {
          const e = n.elevation ?? 2;
          const t0 = nodeStart.get(n.id)!;
          const mark = interpolate(frame, [t0 + frames(s, 8), t0 + frames(s, 22)], [0, 1], { ...CLAMP, easing: EASE.outExpo });
          const col = accent(s, n.accentIndex ?? 0);
          return (
            <div
              key={n.id}
              style={{
                position: "absolute",
                left: n.x,
                top: n.y,
                width: n.w,
                height: n.h,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                gap: padX * 0.75,
                padding: `0 ${padX}px`,
                ...cardSurface(s, e),
                borderRadius: radius(s, 2),
                ...cardEnterStyle(s, frame, fps, t0, enter),
              }}
            >
              <div
                style={{
                  flex: "0 0 auto",
                  width: DOT,
                  height: DOT,
                  borderRadius: 999,
                  background: col,
                  boxShadow: `0 0 0 ${(6 * mark).toFixed(2)}px ${alpha(col, 0.18)}, 0 0 ${(18 * mark).toFixed(2)}px ${alpha(col, 0.8)}`,
                  scale: `${(0.4 + 0.6 * mark).toFixed(4)}`,
                }}
              />
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    fontFamily: fontFamily(s.typography.body),
                    fontWeight: 600,
                    fontSize: labelSize,
                    lineHeight: 1.15,
                    color: s.palette.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {n.label}
                </div>
                {n.caption ? (
                  <div style={{ fontFamily: fontFamily(s.typography.mono), fontSize: capSize, color: s.palette.muted, whiteSpace: "nowrap", opacity: mark }}>{n.caption}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </FlowContext.Provider>
  );
}
