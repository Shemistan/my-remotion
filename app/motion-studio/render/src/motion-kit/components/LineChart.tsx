// Линейный график: сетка проявляется, гладкая линия рисуется слева направо со
// светящейся «головой», точки вспыхивают, когда линия до них доходит, заливка
// открывается за линией. Последняя точка — акцент (удар и дыхание accentPulse, кольца) и
// выноска со значением; то и другое включается отдельно.
//
// Общая часть графиков (ось, геометрия, выноска значения) экспортируется отсюда для
// AreaChart: ось одна на оба графика и стоит неподвижно с первого кадра появления.
import type { Beat } from "@ms/contracts";
import type { ReactNode } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, frames, springAt } from "../easing.js";
import { formatNumber } from "../format.js";
import { type Point, lutLength, pathD, pathLUT, pointAtLength, smoothSegments } from "../geometry.js";
import { CLAMP, clamp01, ramp, useSvgId } from "../internal.js";
import type { ResolvedStyle } from "../style/resolve.js";
import { useStyle } from "../style.js";
import { lineDrawWindow } from "../line-window.js";
import { type AccentPulse, accentPulse } from "../choreo/accent.js";
import { HALO_FALLOFF } from "./Emphasis.js";
import { axisTicks } from "../ticks.js";
import { TYPE_LEVELS, floorText, typeSize } from "../style/type-scale.js";
import { accent, alpha, fontFamily, isDark, mix, radius, surfaceAt, shadow } from "../tokens.js";

export interface LineChartProps {
  /** До входа (0.4.0): `silhouette` (по умолчанию) — тихий контур с кадра 0 (кадр-постер); `hidden` — пусто. */
  pre?: "silhouette" | "hidden";
  points: { label: string; value: number }[];
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Заливка под линией (по умолчанию да). */
  area?: boolean;
  /** Выноска со значением у последней точки (по умолчанию да). */
  callout?: boolean;
  /**
   * Акцент последней точки: удар, ореол, кольца и дыхание до конца сцены (по умолчанию да).
   * `{ beat?, loop? }` — свой бит акцента (по умолчанию от конца прорисовки до конца бита
   * графика) и `loop: false`, чтобы акцент погас после бита.
   */
  endpointEmphasis?: boolean | { beat?: Pick<Beat, "start_frame" | "end_frame">; loop?: boolean };
  /**
   * @deprecated 0.2: выноска и акцент вместе. Бери `callout` и `endpointEmphasis`;
   * `highlightLast={false}` без них убирает и то и другое.
   */
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

/** Поля области построения графика внутри width × height (подписи осей — в полях). */
/** Кегль подписей осей графиков: уровень caption шкалы кадра (32 px при 1080). */
export const chartFont = (frameHeight: number) => floorText(Math.round(frameHeight * TYPE_LEVELS.caption), frameHeight);

/** Поля области построения внутри width × height под подписи осей кеглем chartFont. */
export function chartPad(frameHeight: number) {
  const f = chartFont(frameHeight);
  return { left: Math.round(f * 4.4), right: Math.round(f * 1.25), top: Math.round(f * 2.4), bottom: Math.round(f * 2.2), font: f };
}
export type ChartPad = ReturnType<typeof chartPad>;
const DRAW_EASE = Easing.bezier(0.45, 0, 0.2, 1);

/**
 * Геометрия графика: общая для LineChart, AreaChart и lineChartHead. Деления оси
 * считаются один раз от всех точек — ось не перестраивается, пока линия рисуется.
 */
export function chartGeometry(points: { value: number }[], width: number, height: number, yTicks: number, PAD: ChartPad = chartPad(1080)) {
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const values = points.map((p) => p.value);
  const ticks = axisTicks(Math.min(0, ...values), Math.max(...values, 1), yTicks);
  const y0 = ticks[0]!;
  const y1 = ticks.at(-1)!;
  const toY = (v: number) => PAD.top + innerH - ((v - y0) / (y1 - y0 || 1)) * innerH;
  const coords: Point[] = points.map((p, i) => ({ x: PAD.left + (innerW * i) / Math.max(1, points.length - 1), y: toY(p.value) }));
  const segs = smoothSegments(coords);
  const lut = pathLUT(segs, 48);
  return { innerW, innerH, ticks, y0, y1, toY, coords, segs, lut, total: lutLength(lut), pad: PAD };
}

/**
 * Какие подписи оси X показывать: при шаге точек `spacing` px и кегле `font` подписи не
 * должны налезать (оценка ширины — 0.56 кегля на знак плюс зазор 0.6 кегля). Если тесно —
 * каждая k-я; первая и последняя видны всегда, слишком близкая к последней скрывается.
 */
export function xLabelIndices(labels: string[], spacing: number, font: number): number[] {
  const n = labels.length;
  if (n === 0) return [];
  const widest = Math.max(...labels.map((l) => Array.from(l).length)) * 0.56 * font + 0.6 * font;
  const k = Math.max(1, Math.ceil(widest / Math.max(1, spacing)));
  const out = labels.map((_, i) => i).filter((i) => i % k === 0);
  if (out.at(-1) !== n - 1) {
    if (out.length > 1 && n - 1 - out.at(-1)! < k) out.pop();
    out.push(n - 1);
  }
  return out;
}

/**
 * Что выделено у последней точки: выноска и бит акцента (null — без акцента). Явные
 * `callout` / `endpointEmphasis` важнее устаревшего `highlightLast`.
 */
export function lineHighlight(
  p: Pick<LineChartProps, "callout" | "endpointEmphasis" | "highlightLast">,
  beat: Pick<Beat, "start_frame" | "end_frame">,
): { callout: boolean; emphasis: { beat: Pick<Beat, "start_frame" | "end_frame">; loop: boolean } | null } {
  const legacy = p.highlightLast ?? true;
  const callout = p.callout ?? legacy;
  const e = p.endpointEmphasis ?? legacy;
  if (e === false) return { callout, emphasis: null };
  const own = e === true ? {} : e;
  const { endFrame } = lineDrawWindow(beat);
  return { callout, emphasis: { beat: own.beat ?? { start_frame: endFrame, end_frame: Math.max(endFrame, beat.end_frame) }, loop: own.loop ?? true } };
}

/** Окно прорисовки линии внутри бита: 12–80 % (`lineDrawWindow`, общий с сервером). */
const drawWindow = lineDrawWindow;

function drawAt(frame: number, beat: Pick<Beat, "start_frame" | "end_frame">): number {
  const { drawStart, drawEnd } = drawWindow(beat);
  // ramp: окно нулевой длины — ступенька, а не исключение interpolate
  return ramp(frame, drawStart, drawEnd, DRAW_EASE);
}

/**
 * Голова линии LineChart в кадре `frame` — чтобы привязать к ней другие элементы (один
 * источник движения): `progress` — доля прорисовки 0..1, `value` — значение под головой
 * (линейно между соседними точками по x), `startFrame` — последний кадр, где голова ещё
 * на первой точке (линия трогается после него), `endFrame` — кадр, когда линия дорисована.
 * Не хук: можно звать где угодно. `width`/`height`/`yTicks` — те же, что у графика.
 */
export function lineChartHead(
  points: { label: string; value: number }[],
  beat: Pick<Beat, "start_frame" | "end_frame">,
  frame: number,
  opts: { width?: number; height?: number; yTicks?: number; frameHeight?: number } = {},
): { progress: number; value: number; startFrame: number; endFrame: number } {
  const { coords, lut, total } = chartGeometry(points, opts.width ?? 1100, opts.height ?? 560, opts.yTicks ?? 4, chartPad(opts.frameHeight ?? 1080));
  const progress = drawAt(frame, beat);
  const { startFrame, endFrame } = drawWindow(beat);
  if (points.length < 2) return { progress, value: points[0]?.value ?? 0, startFrame, endFrame };
  const x = pointAtLength(lut, progress * total).x;
  let i = 0;
  while (i < coords.length - 2 && coords[i + 1]!.x < x) i++;
  const a = coords[i]!;
  const b = coords[i + 1]!;
  const t = clamp01((x - a.x) / (b.x - a.x || 1));
  const value = progress >= 1 ? points.at(-1)!.value : points[i]!.value + (points[i + 1]!.value - points[i]!.value) * t;
  return { progress, value, startFrame, endFrame };
}

export function LineChart({
  points,
  beat,
  area = true,
  callout: calloutProp,
  endpointEmphasis,
  highlightLast,
  width = 1100,
  height = 560,
  locale = "ru",
  compact = true,
  accentIndex = 0,
  yTicks = 4,
  valuePrefix = "",
  valueSuffix = "",
  pre = "silhouette",
}: LineChartProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height: frameH } = useVideoConfig();
  const id = useSvgId("ms-line");
  const dark = isDark(s);
  const color = accent(s, accentIndex);
  const font = fontFamily(s.typography.body);

  const PAD = chartPad(frameH);
  const { innerW, innerH, ticks, y0, toY, coords, segs, lut, total } = chartGeometry(points, width, height, yTicks, PAD);
  const shownX = new Set(xLabelIndices(points.map((p) => p.label), innerW / Math.max(1, points.length - 1), PAD.font));
  const d = pathD(segs);
  const baseY = toY(Math.max(y0, 0));

  // тайминг внутри бита
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

  // последняя точка: акцент (accentPulse — тот же, что у Emphasis) и выноска — отдельно
  const hl = lineHighlight({ callout: calloutProp, endpointEmphasis, highlightLast }, beat);
  const emph = hl.emphasis ? accentPulse(frame, s, hl.emphasis) : null;
  const lastPop = springAt(frame, fps, s, drawEnd, "bouncy");
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
        <radialGradient id={`${id}-halo`}>
          {HALO_FALLOFF.map(([o, k]) => (
            <stop key={o} offset={`${o}%`} stopColor={color} stopOpacity={(dark ? 0.8 : 0.45) * k} />
          ))}
        </radialGradient>
        <radialGradient id={`${id}-head`}>
          <stop offset="0%" stopColor={color} stopOpacity={0.9} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>

      {chartAxis({ s, frame, beat, ticks, toY, innerW, locale, compact, pad: PAD, pre: pre !== "hidden" })}

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
        const labelOn = shownX.has(i);
        const rf = reachFrame(c.x - 0.5);
        const pop = springAt(frame, fps, s, rf, "bouncy");
        const lab = interpolate(frame, [rf, rf + frames(s, 12)], [0, 1], { ...CLAMP, easing: EASE.outQuart });
        const big = isLast && (emph !== null || hl.callout);
        const r = (big ? 9 : 6) * Math.max(0, pop) * (isLast && emph ? emph.scale : 1);
        return (
          <g key={`p${i}`}>
            {isLast && emph ? endpointAccent({ x: c.x, y: c.y, p: emph, color, halo: `url(#${id}-halo)` }) : null}
            <circle cx={c.x} cy={c.y} r={r} fill={s.palette.bg} stroke={color} strokeWidth={3.5} />
            {big ? <circle cx={c.x} cy={c.y} r={Math.max(0, 4 * lastPop * (emph ? emph.scale + 0.35 * emph.strike : 1))} fill={emph ? mix(color, "#ffffff", 0.35 * emph.strike) : color} /> : null}
            <text x={c.x} y={PAD.top + innerH + PAD.font * 1.55} textAnchor="middle" fontSize={PAD.font} fill={s.palette.muted} opacity={labelOn ? lab : 0} transform={`translate(0 ${((1 - lab) * 10).toFixed(2)})`}>
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

      {/* выноска последней точки (кольца рисует акцент точки) */}
      {hl.callout && last
        ? valueCallout({ s, frame, fps, x: last.x, y: last.y, at: drawEnd, color, text: `${valuePrefix}${formatNumber(lastValue, { locale, compact: false })}${valueSuffix}`, frameHeight: frameH, rings: false })
        : null}
    </svg>
  );
}


/**
 * Акцент точки графика по accentPulse: ореол дышит вместе с точкой, на ударе и на каждом
 * вдохе от точки расходится кольцо. Рисуется под самой точкой.
 */
function endpointAccent(o: { x: number; y: number; p: AccentPulse; color: string; halo: string }): ReactNode {
  const { x, y, p, color } = o;
  const rp = p.ripple >= 0 ? 1 - (1 - p.ripple) ** 3 : 0;
  return (
    <g>
      {p.level > 0.005 ? <circle cx={x} cy={y} r={(46 + 26 * p.level).toFixed(2)} fill={o.halo} opacity={clamp01(p.level).toFixed(4)} /> : null}
      {p.ripple >= 0 ? (
        <circle cx={x} cy={y} r={(11 + 46 * rp).toFixed(2)} fill="none" stroke={color} strokeWidth={3 - 1.8 * p.ripple} opacity={(0.9 * (1 - p.ripple) * p.rippleAlpha).toFixed(4)} />
      ) : null}
    </g>
  );
}

/**
 * Ось Y и сетка графика. Деления фиксированы (`niceTicks` от всех данных) и появляются
 * все сразу: линии сетки прочерчиваются слева направо одновременно, подписи проявляются
 * вместе — шкала не «растёт» 20 → 60 → 80 по ходу рисования. Первые 30 % бита.
 */
export function chartAxis(o: {
  s: ResolvedStyle;
  frame: number;
  beat: Pick<Beat, "start_frame" | "end_frame">;
  ticks: number[];
  toY: (v: number) => number;
  innerW: number;
  locale: "ru" | "en";
  compact: boolean;
  pad: ChartPad;
  /** Контур сетки до прорисовки (кадр-постер). */
  pre?: boolean;
}): ReactNode {
  const { s, frame, beat, ticks, toY, innerW, pad: PAD } = o;
  const L = Math.max(1, beat.end_frame - beat.start_frame);
  const line = ramp(frame, beat.start_frame, beat.start_frame + L * 0.3, EASE.outExpo);
  const label = ramp(frame, beat.start_frame + L * 0.06, beat.start_frame + L * 0.26, EASE.outQuart);
  const zero = Math.max(ticks[0]!, Math.min(0, ticks.at(-1)!));
  return (
    <g>
      {ticks.map((v, i) => {
        const y = toY(v);
        const base = v === zero;
        return (
          <g key={`t${i}`}>
            {o.pre !== false && line < 1 ? <line x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y} stroke={alpha(s.palette.text, base ? 0.16 : 0.07)} strokeWidth={1} opacity={1 - line} /> : null}
            <line x1={PAD.left} x2={PAD.left + innerW * line} y1={y} y2={y} stroke={alpha(s.palette.text, base ? 0.22 : 0.08)} strokeWidth={base ? 1.5 : 1} />
            <text
              x={PAD.left - PAD.font * 0.6}
              y={y}
              dy="0.35em"
              textAnchor="end"
              fontSize={PAD.font}
              fill={s.palette.muted}
              opacity={o.pre !== false ? Math.max(label, 0.3) : label}
              style={{ fontVariantNumeric: "tabular-nums" }}
              transform={`translate(${((1 - label) * -10).toFixed(2)} 0)`}
            >
              {formatNumber(v, { locale: o.locale, compact: o.compact, decimals: o.compact ? 1 : 0 })}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * Выделение итоговой точки: два кольца пульса со сдвигом полпериода и выноска со
 * значением слева от точки (над максимумом часто нет места). Старт — кадр `at`.
 */
export function valueCallout(o: { s: ResolvedStyle; frame: number; fps: number; x: number; y: number; at: number; color: string; text: string; frameHeight: number; rings?: boolean }): ReactNode {
  const { s, frame, fps, x, y, at, color } = o;
  // выноска — подпись данных крупнее подписей осей: уровень body
  const fs = typeSize(s, "body", o.frameHeight);
  const period = Math.round(fps * 1.1);
  const pop = springAt(frame, fps, s, at, "bouncy");
  const ring = (offset: number) => {
    const local = frame - at - offset;
    if (local < 0) return { r: 0, o: 0 };
    const ph = (local % period) / period;
    return { r: 10 + ph * 34, o: (1 - ph) * 0.65 };
  };
  const callout = springAt(frame, fps, s, at + frames(s, 4), "snappy");
  return (
    <g>
      {(o.rings === false ? [] : [0, period / 2]).map((off) => {
        const rg = ring(off);
        return <circle key={off} cx={x} cy={y} r={rg.r} fill="none" stroke={color} strokeWidth={2} opacity={rg.o * clamp01(pop)} />;
      })}
      <g opacity={clamp01(callout * 1.5)} transform={`translate(${(x - 28 + 24 * (1 - callout)).toFixed(2)} ${y}) scale(${Math.max(0, 0.75 + 0.25 * callout).toFixed(4)})`}>
        <foreignObject x={-fs * 12} y={-fs} width={fs * 12} height={fs * 2} style={{ overflow: "visible" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", height: "100%" }}>
            <div
              style={{
                padding: `${Math.round(fs * 0.2)}px ${Math.round(fs * 0.45)}px`,
                borderRadius: radius(s, 1),
                background: surfaceAt(s, 2),
                boxShadow: `${shadow(s, 2)}, inset 0 0 0 1.5px ${alpha(color, 0.6)}`,
                color: s.palette.text,
                fontFamily: fontFamily(s.typography.display),
                fontWeight: 700,
                fontSize: fs,
                lineHeight: 1.15,
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {o.text}
            </div>
          </div>
        </foreignObject>
      </g>
    </g>
  );
}
