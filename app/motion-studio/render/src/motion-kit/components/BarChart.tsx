// Столбчатая диаграмма: ось и сетка встают целиком (общая ось с LineChart), столбцы растут
// от базовой линии каскадом на пружине, над каждым едет подпись-счётчик AnimatedNumber,
// привязанная к высоте столбца. После роста — акцент: выделенный столбец (`highlight`)
// разгорается и получает световой столб, остальные уходят в нейтральный тон.
import type { Beat } from "@ms/contracts";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { barLayout } from "../bars.js";
import { EASE, easingOf, frames, springAt } from "../easing.js";
import { clamp01, ramp, useSvgId } from "../internal.js";
import { useStyle } from "../style.js";
import { axisTicks } from "../ticks.js";
import { typeSize } from "../style/type-scale.js";
import { accent, alpha, fontFamily, isDark, mix } from "../tokens.js";
import { AnimatedNumber } from "./AnimatedNumber.js";
import { chartAxis, chartPad } from "./LineChart.js";

export interface BarChartProps {
  bars: { label: string; value: number }[];
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Индекс выделенного столбца: после роста он разгорается, остальные гаснут в нейтральный тон. */
  highlight?: number;
  locale: "ru" | "en";
  width?: number;
  height?: number;
  accentIndex?: number;
  /** Сокращать подписи: «12,5 тыс.» (по умолчанию да). */
  compact?: boolean;
  /** Знаков после запятой в подписях значений. */
  decimals?: number;
  /** Суффикс подписи значения (например « %»). */
  valueSuffix?: string;
  /** Число делений оси Y (примерно). */
  yTicks?: number;
  /** Зазор между столбцами — доля слота (по умолчанию 0.38). */
  gapRatio?: number;
}

/** Каскад: старт столбца i и кадр, когда все встали. Разбег — не больше 40 % бита. */
export function barTimings(beat: Pick<Beat, "start_frame" | "end_frame">, n: number, staggerFrames: number) {
  const L = Math.max(1, beat.end_frame - beat.start_frame);
  const growStart = beat.start_frame + L * 0.16;
  const step = n > 1 ? Math.min(Math.max(staggerFrames * 1.5, 3), (L * 0.4) / (n - 1)) : 0;
  return { growStart, step, startOf: (i: number) => growStart + i * step, focusAt: growStart + (n - 1) * step + L * 0.22 };
}

export function BarChart({
  bars,
  beat,
  highlight,
  locale,
  width = 1100,
  height = 560,
  accentIndex = 0,
  compact = true,
  decimals,
  valueSuffix,
  yTicks = 4,
  gapRatio = 0.38,
}: BarChartProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height: frameH } = useVideoConfig();
  const id = useSvgId("ms-bar");
  const dark = isDark(s);
  const color = accent(s, accentIndex);
  const base = chartPad(frameH);
  // сверху — место под подпись-счётчик самого высокого столбца
  const pad = { ...base, top: base.top + base.font };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const values = bars.map((b) => b.value);
  const ticks = axisTicks(0, Math.max(...values, 1), yTicks);
  const yMax = ticks.at(-1)!;
  const toY = (v: number) => pad.top + innerH - (v / (yMax || 1)) * innerH;
  const rects = barLayout(values, { x: pad.left, y: pad.top, w: innerW, h: innerH }, gapRatio, { max: yMax });
  const { startOf, focusAt } = barTimings(beat, bars.length, s.motion.stagger_frames);
  const focus = highlight === undefined ? 0 : ramp(frame, focusAt, focusAt + frames(s, 16), easingOf(s, "enter"));
  const neutral = dark ? mix(s.palette.surface, s.palette.text, 0.22) : mix(s.palette.bg, s.palette.text, 0.18);
  // подпись-счётчик: от caption до h2 шкалы кадра, по ширине столбца
  const valuePx = Math.round(Math.max(pad.font, Math.min(typeSize(s, "h2", frameH) * 0.8, rects[0] ? rects[0].w * 0.3 : pad.font)));
  const baseY = pad.top + innerH;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible", fontFamily: fontFamily(s.typography.body) }}>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={mix(color, "#ffffff", dark ? 0.12 : 0)} />
          <stop offset="100%" stopColor={mix(color, s.palette.bg, dark ? 0.55 : 0.25)} />
        </linearGradient>
        <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0} />
          <stop offset="100%" stopColor={color} stopOpacity={dark ? 0.22 : 0.12} />
        </linearGradient>
        <filter id={`${id}-glow`} x="-60%" y="-30%" width="220%" height="160%">
          <feGaussianBlur stdDeviation={dark ? 14 : 8} />
        </filter>
      </defs>

      {chartAxis({ s, frame, beat, ticks, toY, innerW, locale, compact, pad })}

      {rects.map((r, i) => {
        const t0 = startOf(i);
        // рост — пружина с лёгким перелётом; высота не уходит ниже 0
        const p = springAt(frame, fps, s, t0, "snappy");
        const h = Math.max(0, r.h * p);
        const y = baseY - h;
        const hot = highlight === i;
        const dim = highlight !== undefined && !hot ? focus : 0;
        const glow = hot ? focus : 0;
        const rad = Math.min(r.w * 0.18, 14, h / 2);
        const d = h <= 0 ? "" : `M${r.x} ${baseY} V${y + rad} Q${r.x} ${y} ${r.x + rad} ${y} H${r.x + r.w - rad} Q${r.x + r.w} ${y} ${r.x + r.w} ${y + rad} V${baseY} Z`;
        const cap = clamp01(p * 3);
        const lab = ramp(frame, t0, t0 + frames(s, 12), EASE.outQuart);
        const shown = values[i]! * clamp01(p);
        return (
          <g key={`b${i}`}>
            {/* световой столб за выделенным столбцом */}
            {glow > 0 ? <rect x={r.x - r.w * 0.35} y={pad.top - 20} width={r.w * 1.7} height={baseY - pad.top + 20} fill={`url(#${id}-beam)`} opacity={glow} /> : null}
            {glow > 0 && h > 0 ? <path d={d} fill={color} opacity={0.55 * glow} filter={`url(#${id}-glow)`} /> : null}
            {h > 0 ? (
              <g>
                <path d={d} fill={neutral} />
                <path d={d} fill={`url(#${id}-fill)`} opacity={1 - dim * 0.85} />
                {/* блик верхней кромки */}
                <rect x={r.x + rad * 0.6} y={y} width={Math.max(0, r.w - rad * 1.2)} height={2} fill={mix(color, "#ffffff", 0.65)} opacity={cap * (1 - dim) * (dark ? 0.9 : 0.6)} />
              </g>
            ) : null}
            {/* подпись значения едет на вершине столбца и считает вместе с ростом */}
            <foreignObject x={r.x - 80} y={y - valuePx * 1.55} width={r.w + 160} height={valuePx * 1.4} style={{ overflow: "visible" }}>
              <div style={{ display: "flex", justifyContent: "center", opacity: 1 - dim * 0.45 }}>
                <AnimatedNumber
                  from={0}
                  to={values[i]!}
                  value={shown}
                  beat={{ start_frame: Math.round(t0), end_frame: Math.round(t0 + frames(s, 18)) }}
                  locale={locale}
                  compact={compact}
                  decimals={decimals}
                  suffix={valueSuffix}
                  size={valuePx * (1 + 0.18 * glow)}
                  font="display"
                  align="center"
                  color={hot ? mix(s.palette.text, color, glow * 0.85) : s.palette.text}
                />
              </div>
            </foreignObject>
            <text
              x={r.x + r.w / 2}
              y={baseY + pad.font * 1.55}
              textAnchor="middle"
              fontSize={pad.font}
              fontWeight={hot && glow > 0.5 ? 600 : 500}
              fill={hot ? mix(s.palette.muted, s.palette.text, glow) : s.palette.muted}
              opacity={lab * (1 - dim * 0.35)}
              transform={`translate(0 ${((1 - lab) * 12).toFixed(2)})`}
            >
              {bars[i]!.label}
            </text>
            {glow > 0 ? <rect x={r.x + r.w / 2 - 18 * glow} y={baseY + pad.font * 2} width={36 * glow} height={3} rx={1.5} fill={color} opacity={glow} /> : null}
          </g>
        );
      })}
      <line x1={pad.left} x2={pad.left + innerW} y1={baseY} y2={baseY} stroke={alpha(s.palette.text, 0.28)} strokeWidth={1.5} opacity={ramp(frame, beat.start_frame, beat.start_frame + 8)} />
    </svg>
  );
}
