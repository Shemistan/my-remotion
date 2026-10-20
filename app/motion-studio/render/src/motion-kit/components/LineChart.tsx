// Линейный график: сетка проявляется, гладкая линия рисуется слева направо со
// светящейся «головой», точки вспыхивают, когда линия до них доходит, заливка
// открывается за линией, последняя точка выделена пульсом и выноской со значением.
import type { Beat } from "@ms/contracts";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, frames, springAt } from "../easing.js";
import { formatNumber } from "../format.js";
import { type Point, lutLength, niceTicks, pathD, pathLUT, pointAtLength, smoothSegments } from "../geometry.js";
import { CLAMP, clamp01, useSvgId } from "../internal.js";
import { useStyle } from "../style.js";
import { accent, alpha, fontFamily, isDark, mix, radius, surfaceAt, shadow } from "../tokens.js";

export interface LineChartProps {
  points: { label: string; value: number }[];
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Заливка под линией (по умолчанию да). */
  area?: boolean;
  /** Выделить последнюю точку: пульс и выноска со значением (по умолчанию да). */
  highlightLast?: boolean;
  width?: number;
  height?: number;
  locale?: "ru" | "en";
  /** Сокращать подписи оси Y: «200 тыс.» (по умолчанию да). */
  compact?: boolean;
  /** Индекс акцента линии. */
  accentIndex?: number;
  /** Число делений оси Y (примерно). */
  yTicks?: number;
  /** Префикс/суффикс значения в выноске. */
  valuePrefix?: string;
  valueSuffix?: string;
}

const PAD = { left: 104, right: 40, top: 76, bottom: 56 };
const DRAW_EASE = Easing.bezier(0.45, 0, 0.2, 1);

/** Геометрия графика: общая для LineChart и lineChartHead. */
function chartGeometry(points: { value: number }[], width: number, height: number, yTicks: number) {
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const values = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(...values, 1), yTicks);
  const y0 = ticks[0]!;
  const y1 = ticks.at(-1)!;
  const toY = (v: number) => PAD.top + innerH - ((v - y0) / (y1 - y0 || 1)) * innerH;
  const coords: Point[] = points.map((p, i) => ({ x: PAD.left + (innerW * i) / Math.max(1, points.length - 1), y: toY(p.value) }));
  const segs = smoothSegments(coords);
  const lut = pathLUT(segs, 48);
  return { innerW, innerH, ticks, y0, y1, toY, coords, segs, lut, total: lutLength(lut) };
}

/** Окно прорисовки линии внутри бита: 12–80 %. */
function drawWindow(beat: Pick<Beat, "start_frame" | "end_frame">) {
  const L = Math.max(1, beat.end_frame - beat.start_frame);
  return { drawStart: beat.start_frame + L * 0.12, drawEnd: beat.start_frame + L * 0.8 };
}

function drawAt(frame: number, beat: Pick<Beat, "start_frame" | "end_frame">): number {
  const { drawStart, drawEnd } = drawWindow(beat);
  return interpolate(frame, [drawStart, drawEnd], [0, 1], { ...CLAMP, easing: DRAW_EASE });
}

/**
 * Голова линии LineChart в кадре `frame` — чтобы привязать к ней другие элементы (один
 * источник движения): `progress` — доля прорисовки 0..1, `value` — значение под головой
 * (линейно между соседними точками по x), `endFrame` — кадр, когда линия дорисована.
 * Не хук: можно звать где угодно. `width`/`height`/`yTicks` — те же, что у графика.
 */
export function lineChartHead(
  points: { label: string; value: number }[],
  beat: Pick<Beat, "start_frame" | "end_frame">,
  frame: number,
  opts: { width?: number; height?: number; yTicks?: number } = {},
): { progress: number; value: number; endFrame: number } {
  const { coords, lut, total } = chartGeometry(points, opts.width ?? 1100, opts.height ?? 560, opts.yTicks ?? 4);
  const progress = drawAt(frame, beat);
  const endFrame = Math.ceil(drawWindow(beat).drawEnd);
  if (points.length < 2) return { progress, value: points[0]?.value ?? 0, endFrame };
  const x = pointAtLength(lut, progress * total).x;
  let i = 0;
  while (i < coords.length - 2 && coords[i + 1]!.x < x) i++;
  const a = coords[i]!;
  const b = coords[i + 1]!;
  const t = clamp01((x - a.x) / (b.x - a.x || 1));
  const value = progress >= 1 ? points.at(-1)!.value : points[i]!.value + (points[i + 1]!.value - points[i]!.value) * t;
  return { progress, value, endFrame };
}

export function LineChart({
  points,
  beat,
  area = true,
  highlightLast = true,
  width = 1100,
  height = 560,
  locale = "ru",
  compact = true,
  accentIndex = 0,
  yTicks = 4,
  valuePrefix = "",
  valueSuffix = "",
}: LineChartProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const id = useSvgId("ms-line");
  const dark = isDark(s);
  const color = accent(s, accentIndex);
  const font = fontFamily(s.typography.body);

  const { start_frame: b0, end_frame: b1 } = beat;
  const L = Math.max(1, b1 - b0);
  const { innerW, innerH, ticks, y0, toY, coords, segs, lut, total } = chartGeometry(points, width, height, yTicks);
  const d = pathD(segs);
  const baseY = toY(Math.max(y0, 0));

  // тайминг внутри бита
  const gridEnd = b0 + L * 0.3;
  const { drawStart, drawEnd } = drawWindow(beat);
  const draw = drawAt(frame, beat);
  const head = pointAtLength(lut, draw * total);
  const headOn = frame >= drawStart && draw < 1 ? 1 : 0;
  const last = coords.at(-1);

  // кадр, когда голова проходит точку i (по x: отрисовка монотонна по x)
  const reachFrame = (x: number) => {
    let lo = drawStart;
    let hi = drawEnd;
    for (let k = 0; k < 18; k++) {
      const mid = (lo + hi) / 2;
      const dm = drawAt(mid, beat);
      if (pointAtLength(lut, dm * total).x < x) lo = mid;
      else hi = mid;
    }
    return hi;
  };

  // пульс последней точки: два кольца со сдвигом полпериода
  const period = Math.round(fps * 1.1);
  const lastPop = springAt(frame, fps, s, drawEnd, "bouncy");
  const ring = (offset: number) => {
    const local = frame - drawEnd - offset;
    if (local < 0) return { r: 0, o: 0 };
    const ph = (local % period) / period;
    return { r: 10 + ph * 34, o: (1 - ph) * 0.65 };
  };
  const callout = springAt(frame, fps, s, drawEnd + frames(s, 4), "snappy");
  const lastValue = points.at(-1)?.value ?? 0;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible", fontFamily: font }}>
      <defs>
        <linearGradient id={`${id}-area`} x1="0" y1={PAD.top} x2="0" y2={baseY} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity={dark ? 0.38 : 0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${id}-stroke`} x1={PAD.left} y1="0" x2={PAD.left + innerW} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={mix(color, s.palette.bg, 0.35)} />
          <stop offset="100%" stopColor={color} />
        </linearGradient>
        <clipPath id={`${id}-reveal`}>
          <rect x={0} y={0} width={Math.max(0, head.x)} height={height} />
        </clipPath>
        <filter id={`${id}-glow`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation={dark ? 9 : 5} />
        </filter>
        <radialGradient id={`${id}-head`}>
          <stop offset="0%" stopColor={color} stopOpacity={0.9} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* сетка и подписи Y */}
      {ticks.map((v, i) => {
        const y = toY(v);
        const t0 = b0 + i * frames(s, s.motion.stagger_frames);
        const g = interpolate(frame, [t0, Math.max(t0 + 1, gridEnd)], [0, 1], { ...CLAMP, easing: EASE.outExpo });
        return (
          <g key={`t${i}`}>
            <line x1={PAD.left} x2={PAD.left + innerW * g} y1={y} y2={y} stroke={alpha(s.palette.text, i === 0 ? 0.22 : 0.08)} strokeWidth={i === 0 ? 1.5 : 1} />
            <text
              x={PAD.left - 20}
              y={y}
              dy="0.35em"
              textAnchor="end"
              fontSize={20}
              fill={s.palette.muted}
              opacity={g}
              style={{ fontVariantNumeric: "tabular-nums" }}
              transform={`translate(${((1 - g) * -12).toFixed(2)} 0)`}
            >
              {formatNumber(v, { locale, compact, decimals: compact ? 1 : 0 })}
            </text>
          </g>
        );
      })}

      {/* заливка открывается вслед за головой */}
      {area && segs.length > 0 ? (
        <path d={`${d} L${last!.x} ${baseY} L${coords[0]!.x} ${baseY} Z`} fill={`url(#${id}-area)`} clipPath={`url(#${id}-reveal)`} opacity={interpolate(draw, [0, 0.15], [0, 1], CLAMP)} />
      ) : null}

      {/* свечение под линией и сама линия */}
      {dark && draw > 0 ? (
        <path d={d} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" opacity={0.45} filter={`url(#${id}-glow)`} strokeDasharray={`${total} ${total}`} strokeDashoffset={total * (1 - draw)} />
      ) : null}
      {draw > 0 ? <path d={d} fill="none" stroke={`url(#${id}-stroke)`} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${total} ${total}`} strokeDashoffset={total * (1 - draw)} /> : null}

      {/* точки и подписи X */}
      {coords.map((c, i) => {
        const isLast = i === coords.length - 1;
        const rf = reachFrame(c.x - 0.5);
        const pop = springAt(frame, fps, s, rf, "bouncy");
        const lab = interpolate(frame, [rf, rf + frames(s, 12)], [0, 1], { ...CLAMP, easing: EASE.outQuart });
        const r = (isLast && highlightLast ? 9 : 6) * Math.max(0, pop);
        return (
          <g key={`p${i}`}>
            <circle cx={c.x} cy={c.y} r={r} fill={s.palette.bg} stroke={color} strokeWidth={3.5} />
            {isLast && highlightLast ? <circle cx={c.x} cy={c.y} r={Math.max(0, 4 * lastPop)} fill={color} /> : null}
            <text x={c.x} y={PAD.top + innerH + 36} textAnchor="middle" fontSize={20} fill={s.palette.muted} opacity={lab} transform={`translate(0 ${((1 - lab) * 10).toFixed(2)})`}>
              {points[i]!.label}
            </text>
          </g>
        );
      })}

      {/* голова рисования */}
      {headOn ? (
        <g>
          <circle cx={head.x} cy={head.y} r={26} fill={`url(#${id}-head)`} />
          <circle cx={head.x} cy={head.y} r={5} fill={mix(color, "#ffffff", 0.7)} />
        </g>
      ) : null}

      {/* выделение последней точки: пульс + выноска */}
      {highlightLast && last ? (
        <g>
          {[0, period / 2].map((off) => {
            const rg = ring(off);
            return <circle key={off} cx={last.x} cy={last.y} r={rg.r} fill="none" stroke={color} strokeWidth={2} opacity={rg.o * clamp01(lastPop)} />;
          })}
          {/* выноска слева от точки: над ней часто нет места (максимум графика у верхнего края) */}
          <g opacity={clamp01(callout * 1.5)} transform={`translate(${(last.x - 28 + 24 * (1 - callout)).toFixed(2)} ${last.y}) scale(${Math.max(0, 0.75 + 0.25 * callout).toFixed(4)})`}>
            <foreignObject x={-360} y={-29} width={360} height={58} style={{ overflow: "visible" }}>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div
                  style={{
                    padding: "8px 18px",
                    borderRadius: radius(s, 1),
                    background: surfaceAt(s, 2),
                    boxShadow: `${shadow(s, 2)}, inset 0 0 0 1.5px ${alpha(color, 0.6)}`,
                    color: s.palette.text,
                    fontFamily: fontFamily(s.typography.display),
                    fontWeight: 700,
                    fontSize: 28,
                    lineHeight: 1.15,
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {valuePrefix}
                  {formatNumber(lastValue, { locale, compact: false })}
                  {valueSuffix}
                </div>
              </div>
            </foreignObject>
          </g>
        </g>
      ) : null}
    </svg>
  );
}
