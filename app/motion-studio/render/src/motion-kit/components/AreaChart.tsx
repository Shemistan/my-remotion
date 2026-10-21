// График с заливкой: расширение LineChart (та же ось, геометрия и выноска значения), но
// движение другое — объём «наливается». Заливка поднимается от базовой линии волной слева
// направо на мягкой пружине (подъём считается для каждого x по плотной выборке итоговой
// кривой). Линия идёт по итоговой кривой и обрезана по фронту волны: она не повторяет
// склон волны, поэтому ложного провала нет; заливка «доливается» под неё. У заливки фронт
// растушёван, по нему идёт блик.
// Итоговая точка — пульс и выноска со значением.
import type { Beat } from "@ms/contracts";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, frames, springAt } from "../easing.js";
import { formatNumber } from "../format.js";
import { type Point, polylineD } from "../geometry.js";
import { clamp01, ramp, useSvgId } from "../internal.js";
import { useStyle } from "../style.js";
import { accent, alpha, fontFamily, isDark, mix } from "../tokens.js";
import { chartAxis, chartGeometry, chartPad, valueCallout, xLabelIndices } from "./LineChart.js";

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

/** Окна внутри бита: ось — первые 30 %; подъём стартует на 14 % и идёт волной (правый край — на 50 %). */
function areaWindows(beat: Pick<Beat, "start_frame" | "end_frame">) {
  const b0 = beat.start_frame;
  const L = Math.max(1, beat.end_frame - b0);
  return { riseStart: b0 + L * 0.14, waveSpan: L * 0.36 };
}

/** Доля подъёма заливки, с которой участок попадает в кадр, и фронт линии. */
const FILL_FRONT = 0.04;
const LINE_FRONT = 0.5;
const SAMPLES = 160;

/** y итоговой кривой при x (кривая монотонна по x: линейно между отсчётами LUT). */
function yAt(lut: Point[], x: number): number {
  if (x <= lut[0]!.x) return lut[0]!.y;
  for (let i = 1; i < lut.length; i++) {
    const b = lut[i]!;
    if (b.x >= x) {
      const a = lut[i - 1]!;
      return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x || 1);
    }
  }
  return lut.at(-1)!.y;
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
  const { fps, height: frameH } = useVideoConfig();
  const id = useSvgId("ms-area");
  const dark = isDark(s);
  const color = accent(s, accentIndex);
  const PAD = chartPad(frameH);
  const { innerW, innerH, ticks, y0, toY, coords, lut } = chartGeometry(points, width, height, yTicks, PAD);
  const baseY = toY(Math.max(y0, 0));
  const { riseStart, waveSpan } = areaWindows(beat);
  const shownX = new Set(xLabelIndices(points.map((p) => p.label), innerW / Math.max(1, points.length - 1), PAD.font));
  const n = coords.length;
  const x0 = coords[0]?.x ?? PAD.left;
  const xN = coords.at(-1)?.x ?? PAD.left + innerW;

  // волна по x: участок с долей u стартует в riseStart + u · waveSpan, поднимается мягкой пружиной
  const startAtX = (x: number) => riseStart + (xN > x0 ? clamp01((x - x0) / (xN - x0)) : 0) * waveSpan;
  const riseAtX = (x: number) => springAt(frame, fps, s, startAtX(x), "soft");
  const samples: Point[] = [];
  const line: Point[] = [];
  let frontX = x0;
  for (let k = 0; k <= SAMPLES && n > 1; k++) {
    const x = x0 + ((xN - x0) * k) / SAMPLES;
    const r = riseAtX(x);
    if (r < FILL_FRONT) break;
    const yf = yAt(lut.points, x);
    samples.push({ x, y: baseY + (yf - baseY) * r });
    if (r >= LINE_FRONT && line.length === k) line.push({ x, y: yf });
    frontX = x;
  }
  const visible = samples.length > 1;
  const top = visible ? polylineD(samples) : "";
  const lineD = line.length > 1 ? polylineD(line) : "";
  const done = frontX >= xN;

  // растушёвка заливки у фронта; у дорисованного графика — нет
  const feather = done ? 0 : Math.min(innerW * 0.14, Math.max(0, frontX - x0));
  const sheenP = ramp(frame, riseStart, riseStart + waveSpan + frames(s, 20));
  const sheen = sheenP > 0 && sheenP < 1 ? Math.sin(Math.PI * sheenP) : 0;
  const settled = startAtX(xN) + frames(s, 30);
  const lastValue = points.at(-1)?.value ?? 0;
  const area = visible ? `${top} L${frontX} ${baseY} L${x0} ${baseY} Z` : "";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible", fontFamily: fontFamily(s.typography.body) }}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1={PAD.top} x2="0" y2={baseY} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity={dark ? 0.55 : 0.34} />
          <stop offset="60%" stopColor={color} stopOpacity={dark ? 0.18 : 0.12} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${id}-front`} x1={frontX - feather} y1="0" x2={frontX + 0.01} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={feather > 0 ? 0.25 : 1} />
        </linearGradient>
        <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
          <rect x={0} y={0} width={width} height={height} fill={`url(#${id}-front)`} />
        </mask>
        <linearGradient id={`${id}-sheen`} x1={frontX - innerW * 0.18} y1="0" x2={frontX} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={mix(color, "#ffffff", 0.6)} stopOpacity={0} />
          <stop offset="100%" stopColor={mix(color, "#ffffff", 0.6)} stopOpacity={0.5 * sheen} />
        </linearGradient>
        <filter id={`${id}-glow`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation={dark ? 8 : 4} />
        </filter>
      </defs>

      {chartAxis({ s, frame, beat, ticks, toY, innerW, locale, compact, pad: PAD })}

      {visible ? (
        <g>
          <g mask={`url(#${id}-mask)`}>
            <path d={area} fill={`url(#${id}-fill)`} />
            {sheen > 0 ? <path d={area} fill={`url(#${id}-sheen)`} /> : null}
          </g>
          {/* линия — по итоговой кривой, только до фронта волны */}
          {dark && lineD ? <path d={lineD} fill="none" stroke={color} strokeWidth={9} opacity={0.4} filter={`url(#${id}-glow)`} /> : null}
          {lineD ? <path d={lineD} fill="none" stroke={mix(color, s.palette.text, dark ? 0.15 : 0)} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" /> : null}
        </g>
      ) : null}

      {/* точки встают на место, подписи X — вслед за своей точкой */}
      {coords.map((c, i) => {
        const r = riseAtX(c.x);
        const settle = clamp01((r - LINE_FRONT) / (1 - LINE_FRONT));
        const isLast = i === n - 1;
        const t0 = startAtX(c.x);
        const lab = ramp(frame, t0, t0 + frames(s, 14), EASE.outQuart);
        const y = c.y;
        return (
          <g key={`p${i}`}>
            {(isLast && highlightLast) || settle <= 0 ? null : <circle cx={c.x} cy={y} r={5 * settle} fill={s.palette.bg} stroke={color} strokeWidth={2.5} opacity={settle} />}
            <text x={c.x} y={PAD.top + innerH + PAD.font * 1.55} textAnchor="middle" fontSize={PAD.font} fill={s.palette.muted} opacity={shownX.has(i) ? lab : 0} transform={`translate(0 ${((1 - lab) * 10).toFixed(2)})`}>
              {points[i]!.label}
            </text>
          </g>
        );
      })}

      {highlightLast && n > 0 && done ? (
        <g>
          <circle cx={xN} cy={baseY + (coords.at(-1)!.y - baseY) * riseAtX(xN)} r={Math.max(0, 7 * springAt(frame, fps, s, settled - frames(s, 10), "bouncy"))} fill={color} />
          {valueCallout({ s, frame, fps, x: xN, y: coords.at(-1)!.y, at: settled - frames(s, 10), color, text: `${valuePrefix}${formatNumber(lastValue, { locale, compact: false })}${valueSuffix}`, frameHeight: frameH })}
          <circle cx={xN} cy={coords.at(-1)!.y} r={3} fill={alpha("#ffffff", 0.9 * clamp01(riseAtX(xN)))} />
        </g>
      ) : null}
    </svg>
  );
}
