// Процесс из шагов: шаги активируются по очереди. У активного шага номер выскакивает в
// кольце, которое прорисовывается по кругу, подпись поднимается из маски, вокруг —
// свечение. Пройденный шаг остаётся «сделанным» (контур акцента, без свечения). Коннектор
// к следующему шагу прорисовывается (`draw`) за время активного шага: стрелка с
// наконечником или линия с бегущей точкой.
import type { Beat } from "@ms/contracts";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, easingOf, frames, springAt } from "../easing.js";
import { clamp01, drawDash, ramp, useSvgId } from "../internal.js";
import { typeSize } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { accent, alpha, fontFamily, isDark, mix, surfaceAt, tracking } from "../tokens.js";

export interface ProcessStepsProps {
  steps: string[];
  beat: Pick<Beat, "start_frame" | "end_frame">;
  connector: "arrow" | "line";
  /** Размер области, px (по умолчанию 1500 × 420). */
  width?: number;
  height?: number;
  accentIndex?: number;
}

/** Старт активации шага i: шаги делят первые 82 % бита, первый — с 6 %. */
export function stepStarts(beat: Pick<Beat, "start_frame" | "end_frame">, n: number): number[] {
  const L = Math.max(1, beat.end_frame - beat.start_frame);
  const a = beat.start_frame + L * 0.06;
  const span = L * 0.76;
  return Array.from({ length: n }, (_, i) => a + (n > 1 ? (i / n) * span : 0));
}

export function ProcessSteps({ steps, beat, connector, width = 1500, height = 420, accentIndex = 0 }: ProcessStepsProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height: frameH } = useVideoConfig();
  const id = useSvgId("ms-steps");
  const dark = isDark(s);
  const color = accent(s, accentIndex);
  const n = steps.length;
  const starts = stepStarts(beat, n);
  const slot = width / Math.max(1, n);
  const R = Math.round(Math.min(slot * 0.17, frameH * 0.064));
  const cy = R + 30;
  const cx = (i: number) => slot * (i + 0.5);
  const labelPx = Math.round(Math.min(typeSize(s, "h2", frameH) * 0.78, slot * 0.115));
  const enterEase = easingOf(s, "enter");
  // активный шаг: последний начавшийся
  const active = starts.reduce((acc, t, i) => (frame >= t ? i : acc), -1);

  return (
    <div style={{ position: "relative", width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <radialGradient id={`${id}-halo`}>
            <stop offset="0%" stopColor={color} stopOpacity={dark ? 0.45 : 0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mix(color, "#ffffff", 0.18)} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>

        {/* коннекторы: прорисовка за время шага i (до старта i + 1) */}
        {steps.slice(0, -1).map((_, i) => {
          const x0 = cx(i) + R + 14;
          const x1 = cx(i + 1) - R - 14;
          const t0 = starts[i]! + frames(s, 8);
          const t1 = Math.max(t0 + 1, starts[i + 1]! - frames(s, 2));
          const p = ramp(frame, t0, t1, EASE.inOutCubic);
          const x = x0 + (x1 - x0) * p;
          const ah = 11;
          const dot = connector === "line" && p > 0 ? ramp(frame, t1, t1 + frames(s, 14), EASE.inOutCubic) : 0;
          return (
            <g key={`c${i}`}>
              <line x1={x0} x2={x1} y1={cy} y2={cy} stroke={alpha(s.palette.text, 0.1)} strokeWidth={2} strokeDasharray={connector === "line" ? "1 9" : undefined} strokeLinecap="round" />
              {p > 0 ? <line x1={x0} x2={x - (connector === "arrow" ? ah * 0.6 * p : 0)} y1={cy} y2={cy} stroke={color} strokeWidth={3} strokeLinecap="round" /> : null}
              {connector === "arrow" && p > 0 ? (
                <path d={`M${x - ah} ${cy - ah * 0.75} L${x} ${cy} L${x - ah} ${cy + ah * 0.75}`} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={clamp01(p * 4)} />
              ) : null}
              {connector === "line" && p > 0 ? <circle cx={x} cy={cy} r={5} fill={mix(color, "#ffffff", 0.5)} opacity={1 - dot} /> : null}
            </g>
          );
        })}

        {steps.map((_, i) => {
          const t = starts[i]!;
          const pop = springAt(frame, fps, s, t, "pop");
          const ring = ramp(frame, t, t + frames(s, 18), EASE.outExpo);
          const isActive = i === active;
          const done = active > i;
          // свечение активного шага разгорается и гаснет, когда активируется следующий
          const next = starts[i + 1];
          const glowIn = ramp(frame, t, t + frames(s, 10));
          const glowOut = next === undefined ? 0 : ramp(frame, next, next + frames(s, 10));
          const glow = glowIn * (1 - glowOut);
          const fill = isActive || (next === undefined && frame >= t);
          return (
            <g key={`s${i}`} transform={`translate(${cx(i)} ${cy})`}>
              <circle r={R * 2.3} fill={`url(#${id}-halo)`} opacity={glow} />
              <circle r={Math.max(0, R * pop)} fill={fill ? `url(#${id}-fill)` : surfaceAt(s, 2)} stroke={alpha(s.palette.text, 0.1)} strokeWidth={1} />
              {ring > 0 ? (
                <circle r={R + 7} fill="none" stroke={done ? alpha(color, 0.75) : color} strokeWidth={2.5} pathLength={1} strokeDasharray={drawDash(ring)} transform="rotate(-90)" />
              ) : null}
            </g>
          );
        })}
      </svg>

      {/* номера и подписи — HTML поверх SVG */}
      {steps.map((label, i) => {
        const t = starts[i]!;
        const num = springAt(frame, fps, s, t + frames(s, 2), "snappy");
        const lab = ramp(frame, t + frames(s, 5), t + frames(s, 5) + s.motion.enter_frames, enterEase);
        const isActive = i === active || (i === n - 1 && frame >= t);
        const done = active > i;
        return (
          <div key={i}>
            <div
              style={{
                position: "absolute",
                left: cx(i) - R,
                top: cy - R,
                width: R * 2,
                height: R * 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: fontFamily(s.typography.mono),
                fontWeight: 700,
                fontSize: R * 0.72,
                letterSpacing: `${tracking(s, "mono")}em`,
                color: isActive ? (dark ? s.palette.bg : "#ffffff") : done ? color : s.palette.muted,
                opacity: clamp01(num * 1.6),
                transform: `translateY(${((1 - num) * R * 0.6).toFixed(2)}px)`,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </div>
            <div
              style={{
                position: "absolute",
                left: cx(i) - slot / 2 + 12,
                width: slot - 24,
                top: cy + R + 34,
                overflow: "hidden",
                padding: "0.08em 0 0.16em",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontFamily: fontFamily(s.typography.body),
                  fontWeight: isActive ? 600 : 500,
                  fontSize: labelPx,
                  lineHeight: 1.22,
                  color: isActive || done ? s.palette.text : s.palette.muted,
                  transform: `translateY(${((1 - lab) * 110).toFixed(2)}%)`,
                  opacity: clamp01(lab * 1.4),
                }}
              >
                {label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
