// График с заливкой: расширение LineChart (та же ось, геометрия и выноска значения), но
// движение другое — объём «наливается». Точки поднимаются от базовой линии волной слева
// направо на мягкой пружине, заливка открывается маской с растушёванным фронтом, по
// фронту идёт световой блик; верхняя кромка — чёткая линия. Итоговая точка — пульс и
// выноска со значением.
import type { Beat } from "@ms/contracts";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, frames, springAt } from "../easing.js";
import { formatNumber } from "../format.js";
import { type Point, pathD, smoothSegments } from "../geometry.js";
import { clamp01, ramp, useSvgId } from "../internal.js";
import { useStyle } from "../style.js";
import { accent, alpha, fontFamily, isDark, mix } from "../tokens.js";
import { CHART_PAD, chartAxis, chartGeometry, valueCallout } from "./LineChart.js";

export interface AreaChartProps {
  points: { label: string; value: number }[];
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Выделить итоговую точку: пульс и выноска со значением (по умолчанию да). */
  highlightLast?: boolean;
  width?: number;
  height?: number;
  locale?: "ru" | "en";
  /** Сокращать подписи оси Y: «200 тыс.» (по умолчанию да). */
  compact?: boolean;
  accentIndex?: number;
  /** Число делений оси Y (примерно). */
  yTicks?: number;
  valuePrefix?: string;
  valueSuffix?: string;
}

/**
 * Окна внутри бита: ось — первые 30 %; подъём точек стартует на 14 % и идёт волной (старт
 * последней точки — на 50 %); маска заливки — 14–72 %.
 */
function areaWindows(beat: Pick<Beat, "start_frame" | "end_frame">) {
  const b0 = beat.start_frame;
  const L = Math.max(1, beat.end_frame - b0);
  return { riseStart: b0 + L * 0.14, waveSpan: L * 0.36, maskEnd: b0 + L * 0.72, L };
}

export function AreaChart({
  points,
  beat,
  highlightLast = true,
  width = 1100,
  height = 560,
  locale = "ru",
  compact = true,
  accentIndex = 0,
  yTicks = 4,
  valuePrefix = "",
  valueSuffix = "",
}: AreaChartProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const id = useSvgId("ms-area");
  const dark = isDark(s);
  const color = accent(s, accentIndex);
  const { innerW, innerH, ticks, y0, toY, coords } = chartGeometry(points, width, height, yTicks);
  const baseY = toY(Math.max(y0, 0));
  const { riseStart, waveSpan, maskEnd } = areaWindows(beat);
  const n = coords.length;

  // волна: точка i стартует позже на долю waveSpan, поднимается мягкой пружиной (лёгкий «плеск»)
  const startOf = (i: number) => riseStart + (n > 1 ? (i / (n - 1)) * waveSpan : 0);
  const rise = coords.map((_, i) => springAt(frame, fps, s, startOf(i), "soft"));
  const live: Point[] = coords.map((c, i) => ({ x: c.x, y: baseY + (c.y - baseY) * rise[i]! }));
  const segs = smoothSegments(live);
  const top = pathD(segs);
  const first = live[0];
  const last = live.at(-1);

  // фронт маски: растушёвка 16 % ширины, ведёт чуть впереди волны
  const m = ramp(frame, riseStart - frames(s, 4), maskEnd, EASE.inOutCubic);
  const feather = innerW * 0.16;
  const front = CHART_PAD.left - feather + m * (innerW + feather * 2);
  const sheen = m > 0 && m < 1 ? Math.sin(Math.PI * m) : 0;
  const settled = startOf(n - 1) + frames(s, 30);
  const lastValue = points.at(-1)?.value ?? 0;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible", fontFamily: fontFamily(s.typography.body) }}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1={CHART_PAD.top} x2="0" y2={baseY} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity={dark ? 0.55 : 0.34} />
          <stop offset="60%" stopColor={color} stopOpacity={dark ? 0.18 : 0.12} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${id}-front`} x1={front - feather} y1="0" x2={front} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
        <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <rect x={0} y={0} width={width} height={height} fill={`url(#${id}-front)`} />
        </mask>
        <linearGradient id={`${id}-sheen`} x1={front - feather * 1.2} y1="0" x2={front + feather * 0.2} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={mix(color, "#ffffff", 0.6)} stopOpacity={0} />
          <stop offset="80%" stopColor={mix(color, "#ffffff", 0.6)} stopOpacity={0.5 * sheen} />
          <stop offset="100%" stopColor={mix(color, "#ffffff", 0.6)} stopOpacity={0} />
        </linearGradient>
        <filter id={`${id}-glow`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation={dark ? 8 : 4} />
        </filter>
      </defs>

      {chartAxis({ s, frame, beat, ticks, toY, innerW, locale, compact })}

      {segs.length > 0 && first && last ? (
        <g mask={`url(#${id}-mask)`}>
          <path d={`${top} L${last.x} ${baseY} L${first.x} ${baseY} Z`} fill={`url(#${id}-fill)`} />
          {sheen > 0 ? <path d={`${top} L${last.x} ${baseY} L${first.x} ${baseY} Z`} fill={`url(#${id}-sheen)`} /> : null}
          {dark ? <path d={top} fill="none" stroke={color} strokeWidth={9} opacity={0.4} filter={`url(#${id}-glow)`} /> : null}
          <path d={top} fill="none" stroke={mix(color, s.palette.text, dark ? 0.15 : 0)} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}

      {/* точки встают на место, подписи X — вслед за своей точкой */}
      {live.map((c, i) => {
        const settle = clamp01((rise[i]! - 0.55) / 0.45);
        const isLast = i === n - 1;
        const lab = ramp(frame, startOf(i), startOf(i) + frames(s, 14), EASE.outQuart);
        return (
          <g key={`p${i}`}>
            {isLast && highlightLast ? null : <circle cx={c.x} cy={c.y} r={4.5 * settle} fill={s.palette.bg} stroke={color} strokeWidth={2.5} opacity={settle} />}
            <text x={c.x} y={CHART_PAD.top + innerH + 36} textAnchor="middle" fontSize={20} fill={s.palette.muted} opacity={lab} transform={`translate(0 ${((1 - lab) * 10).toFixed(2)})`}>
              {points[i]!.label}
            </text>
          </g>
        );
      })}

      {highlightLast && last ? (
        <g>
          <circle cx={last.x} cy={last.y} r={Math.max(0, 7 * springAt(frame, fps, s, settled - frames(s, 10), "bouncy"))} fill={color} />
          {valueCallout({ s, frame, fps, x: last.x, y: last.y, at: settled - frames(s, 10), color, text: `${valuePrefix}${formatNumber(lastValue, { locale, compact: false })}${valueSuffix}` })}
          <circle cx={last.x} cy={last.y} r={3} fill={alpha("#ffffff", 0.9 * clamp01(rise.at(-1)!))} />
        </g>
      ) : null}
    </svg>
  );
}
