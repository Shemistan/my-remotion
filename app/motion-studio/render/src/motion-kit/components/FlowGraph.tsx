// Схема-граф: узлы — карточки с глубиной, рёбра — S-кривые между портами. Узлы входят
// слева направо (у каждого может быть свой вход и кадр), рёбра прорисовываются, когда оба
// конца на месте. Дочерние элементы (PulseAlongPath) рисуются в той же системе координат
// над рёбрами; узел вспыхивает в кадр прихода импульса (FlowNode.flash + pulseArrival).
import type { Beat, StyleBible } from "@ms/contracts";
import { type ReactNode, createContext, useContext } from "react";
import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { type AccentPulse, accentPulse } from "../choreo/accent.js";
import { type PulseArrival, arrivalInPass, pulsePass, pulseStarts } from "../choreo/pulse.js";
import { edgeDelay } from "../choreo/rhythm.js";
import { EASE, frames, springAt } from "../easing.js";
import { type CubicSegment, type Point, cubicPoint, edgeSegment, lutLength, pathD, pathLUT } from "../geometry.js";
import { CLAMP, clamp01 } from "../internal.js";
import { amplitudeOf } from "../style/intensity.js";
import { typeSize } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { type Elevation, accent, alpha, fontFamily, isDark, mix, radius, space } from "../tokens.js";
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
  /** Индекс акцента маркера узла (и его вспышки). */
  accentIndex?: number;
  /** Свой вход узла (по умолчанию — `enter` графа): разные входы разделяют роли узлов. */
  enter?: CardEnter;
  /** Кадр входа узла вместо каскада (например, по биту элемента в spec). */
  enterAt?: number;
  /**
   * Вспышка узла: в кадр прихода импульса (`pulseArrival(edgeId, beat, travel)`) или в
   * заданные кадры. Удар accentPulse — ореол, кромка, кольцо, толчок масштаба.
   */
  flash?: PulseArrival | number | (PulseArrival | number)[];
  /**
   * Акцент узла (итог на нём): удар в `start_frame` и дыхание удержания до конца сцены
   * (`loop: false` — гаснет после бита). Тот же accentPulse, что у <Emphasis>; отдельный
   * Emphasis-оверлей поверх или под узлом не нужен.
   */
  emphasis?: Pick<Beat, "start_frame" | "end_frame"> & { loop?: boolean };
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
  /** Вход узлов по умолчанию (CardEnter): flip; у узла может быть свой `enter`. */
  enter?: CardEnter;
  /** Импульсы и прочие слои поверх рёбер. */
  children?: ReactNode;
}

interface FlowGeometry {
  edges: ReadonlyMap<string, CubicSegment>;
  /** Кадр, когда ребро дорисовано (импульсы раньше не пускать). */
  ready: ReadonlyMap<string, number>;
  /** Кадры прихода импульса (голова касается узла-получателя), по возрастанию. */
  arrivals: (a: PulseArrival) => number[];
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

/**
 * Тайминг графа (чистая функция): старты узлов (каскад слева направо в первые ~45 % бита
 * или `enterAt` узла), старты и готовность рёбер, геометрия и приходы импульсов.
 */
export function flowTiming(nodes: FlowNode[], edges: FlowEdge[], beat: Pick<Beat, "start_frame" | "end_frame">, s: StyleBible, fps: number) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const { start_frame: b0, end_frame: b1 } = beat;
  const L = Math.max(1, b1 - b0);
  const order = [...nodes].sort((a, b) => a.x - b.x || a.y - b.y);
  const gap = Math.min(s.motion.stagger_frames * 2.5, (L * 0.45) / Math.max(1, nodes.length - 1));
  const nodeStart = new Map(order.map((n, i) => [n.id, n.enterAt ?? b0 + i * gap + random(`node-${n.id}`) * gap * 0.4]));
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
  // приход: то же расписание, что у PulseAlongPath (LUT 40, pulsePass, pulseStarts)
  const arrivals = (a: PulseArrival): number[] => {
    const seg = geo.get(a.edgeId);
    if (!seg) return [];
    const len = lutLength(pathLUT([seg], 40));
    const pass = pulsePass(len, a.travel, fps, s);
    const start = Math.max(a.beat.start_frame, ready.get(a.edgeId)!);
    return pulseStarts({ start, end: a.beat.end_frame, pass, count: a.count, repeat: a.repeat }).map((t0) => arrivalInPass(t0, pass, len));
  };
  return { nodeStart, edgeStart, ready, edges: geo, drawLen, arrivals };
}

/**
 * Вспышка узла в кадре `frame` по кадрам прихода `at`: удар accentPulse (без дыхания);
 * при нескольких приходах — самая яркая из идущих вспышек. `emphasis` — акцент узла с
 * дыханием удержания; в кадре берётся сильнейшее из акцента и вспышек.
 */
export function nodeFlash(frame: number, s: StyleBible, at: number[], emphasis?: FlowNode["emphasis"]): AccentPulse {
  let best: AccentPulse = emphasis
    ? accentPulse(frame, s, { beat: emphasis, loop: emphasis.loop ?? true })
    : { level: 0, scale: 1, strike: 0, hold: 0, swell: 0, ripple: -1, rippleAlpha: 0 };
  for (const t of at) {
    if (t > frame) continue;
    // атака стартует кадром раньше: в сам кадр прихода узел уже загорается
    const p = accentPulse(frame, s, { beat: { start_frame: t - 1, end_frame: t + frames(s, 8) }, loop: false });
    if (p.level > best.level) best = p;
  }
  return best;
}

export function FlowGraph({ nodes, edges, beat, width, height, enter = "flip", children }: FlowGraphProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height: frameH } = useVideoConfig();
  const W = width ?? Math.max(...nodes.map((n) => n.x + n.w));
  const H = height ?? Math.max(...nodes.map((n) => n.y + n.h));
  const { nodeStart, edgeStart, ready, edges: geo, drawLen, arrivals } = flowTiming(nodes, edges, beat, s, fps);
  const dark = isDark(s);
  const amp = amplitudeOf(s);

  // единый кегль подписей графа: самый крупный, при котором каждая подпись влезает в
  // свой узел без многоточия (оценка ширины: 0.57 em на символ), но не крупнее уровня
  // body шкалы кадра (подпись узла — основной текст схемы) и не меньше 16 px; пояснение
  // под подписью — caption (рубрика: мельче caption в кадре ничего нет)
  const padX = space(s, 0.5);
  const DOT = 12;
  const labelSize = Math.max(
    16,
    Math.floor(Math.min(typeSize(s, "body", frameH), ...nodes.map((n) => (n.w - 2 * padX - DOT - padX * 0.75) / (Math.max(1, Array.from(n.label).length) * 0.57)))),
  );
  const capSize = Math.min(Math.round(typeSize(s, "caption", frameH)), Math.round(labelSize * 0.8));

  return (
    <FlowContext.Provider value={{ edges: geo, ready, arrivals }}>
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
          const flashAt = n.flash === undefined ? [] : (Array.isArray(n.flash) ? n.flash : [n.flash]).flatMap((f) => (typeof f === "number" ? [f] : arrivals(f)));
          const fl = nodeFlash(frame, s, flashAt, n.emphasis);
          const lit = fl.level > 0.005;
          const surface = cardSurface(s, e);
          const r = radius(s, 2);
          const rp = fl.ripple >= 0 ? 1 - (1 - fl.ripple) ** 3 : 0;
          return (
            <div
              key={n.id}
              style={{
                position: "absolute",
                left: n.x,
                top: n.y,
                width: n.w,
                height: n.h,
                isolation: "isolate",
                // вспышка: короткий толчок масштаба поверх входа
                transform: fl.scale === 1 ? undefined : `scale(${(1 + (fl.scale - 1) * 0.6).toFixed(5)})`,
              }}
            >
              {lit ? (
                // ореол вспышки: равные поля за карточкой, гауссов спад к прозрачному краю
                <div
                  style={{
                    position: "absolute",
                    inset: -Math.round(Math.min(n.w, n.h) * 0.45),
                    zIndex: -1,
                    opacity: Number(fl.level.toFixed(4)),
                    background: `radial-gradient(closest-side, ${alpha(col, dark ? 0.5 : 0.3)} 0%, ${alpha(col, dark ? 0.32 : 0.18)} 40%, ${alpha(col, dark ? 0.1 : 0.06)} 72%, ${alpha(col, 0)} 100%)`,
                  }}
                />
              ) : null}
              {fl.ripple >= 0 ? (
                <div
                  style={{
                    position: "absolute",
                    inset: -(3 + 22 * rp * amp),
                    borderRadius: r + 3 + 22 * rp,
                    border: `2px solid ${alpha(col, 0.8 * (1 - fl.ripple) * fl.rippleAlpha)}`,
                    pointerEvents: "none",
                  }}
                />
              ) : null}
            <div
              style={{
                position: "absolute",
                inset: 0,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                gap: padX * 0.75,
                padding: `0 ${padX}px`,
                ...surface,
                // кромка акцента и свечение на вспышке — поверх тени поверхности
                boxShadow: lit ? `inset 0 0 0 ${(1.5 + 1.5 * fl.strike).toFixed(2)}px ${alpha(col, 0.9 * fl.level)}, 0 0 ${(36 * fl.level).toFixed(1)}px ${alpha(col, (dark ? 0.55 : 0.35) * fl.level)}, ${surface.boxShadow}` : surface.boxShadow,
                borderRadius: r,
                ...cardEnterStyle(s, frame, fps, t0, n.enter ?? enter),
              }}
            >
              <div
                style={{
                  flex: "0 0 auto",
                  width: DOT,
                  height: DOT,
                  borderRadius: 999,
                  background: lit ? mix(col, "#ffffff", 0.5 * fl.strike) : col,
                  boxShadow: `0 0 0 ${(6 * mark + 3 * fl.level).toFixed(2)}px ${alpha(col, 0.18 + 0.1 * fl.level)}, 0 0 ${(18 * mark + 14 * fl.level).toFixed(2)}px ${alpha(col, 0.8)}`,
                  scale: `${((0.4 + 0.6 * mark) * (1 + 0.3 * fl.strike)).toFixed(4)}`,
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
            </div>
          );
        })}
      </div>
    </FlowContext.Provider>
  );
}
