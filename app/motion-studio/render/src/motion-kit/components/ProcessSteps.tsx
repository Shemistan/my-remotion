// Процесс из шагов: шаги активируются по очереди. У активного шага номер выскакивает в
// кольце, которое прорисовывается по кругу, вокруг — свечение; под номером поднимается
// карточка шага (подпись и необязательное пояснение), у активной — акцентная кромка.
// Пройденный шаг остаётся «сделанным» (контур и номер акцентом, карточка спокойная).
// Коннектор к следующему шагу прорисовывается (`draw`) за время активного шага: стрелка с
// наконечником или пунктир с бегущей точкой.
import type { CSSProperties } from "react";
import type { Beat } from "@ms/contracts";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, easingOf, frames, springAt } from "../easing.js";
import { clamp01, drawDash, ramp, useSvgId } from "../internal.js";
import { floorText, typeSize } from "../style/type-scale.js";
import { PosterGate } from "./Poster.js";
import { useStyle } from "../style.js";
import { accent, alpha, fontFamily, isDark, mix, radius, shadow, surfaceAt, tracking } from "../tokens.js";

export interface ProcessStepsProps {
  /** До входа (0.4.0): `silhouette` (по умолчанию) — каркас итогового вида (формы без текста, 30 %) с кадра 0 (кадр-постер); `hidden` — пусто. */
  pre?: "silhouette" | "hidden";
  steps: string[];
  /** Пояснения к шагам (по индексу, одна-две короткие строки); пустые — без пояснения. */
  notes?: string[];
  beat: Pick<Beat, "start_frame" | "end_frame">;
  connector: "arrow" | "line";
  /** Размер области, px (по умолчанию 1690 × 560). */
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

/** ProcessSteps с кадром-постером до бита (PosterGate). */
export function ProcessSteps(props: ProcessStepsProps) {
  return <PosterGate pre={props.pre} beat={props.beat} render={(css) => <ProcessStepsBody {...props} posterCss={css} />} />;
}

function ProcessStepsBody({ steps, notes = [], beat, connector, width = 1690, height = 560, accentIndex = 0, posterCss }: ProcessStepsProps & { posterCss?: CSSProperties }) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height: frameH } = useVideoConfig();
  const id = useSvgId("ms-steps");
  const dark = isDark(s);
  const color = accent(s, accentIndex);
  const n = steps.length;
  const starts = stepStarts(beat, n);
  const slot = width / Math.max(1, n);
  const R = Math.round(Math.min(slot * 0.2, frameH * 0.072));
  const cy = R + 34;
  const cx = (i: number) => slot * (i + 0.5);
  const labelPx = floorText(Math.round(Math.min(typeSize(s, "h2", frameH) * 0.8, slot * 0.12)), frameH);
  const notePx = floorText(Math.round(Math.min(typeSize(s, "caption", frameH), slot * 0.085)), frameH);
  const cardTop = cy + R + 40;
  const cardGap = Math.round(slot * 0.07);
  const enterEase = easingOf(s, "enter");
  // активный шаг: последний начавшийся
  const active = starts.reduce((acc, t, i) => (frame >= t ? i : acc), -1);

  return (
    <div style={{ ...posterCss, position: "relative", width, height }}>
      {/* карточки шагов под номерами */}
      {steps.map((label, i) => {
        const t = starts[i]!;
        const q = springAt(frame, fps, s, t + frames(s, 3), "snappy");
        const lab = ramp(frame, t + frames(s, 6), t + frames(s, 6) + s.motion.enter_frames, enterEase);
        const np = ramp(frame, t + frames(s, 12), t + frames(s, 12) + s.motion.enter_frames, enterEase);
        const isActive = i === active;
        const done = active > i;
        const next = starts[i + 1];
        const hot = ramp(frame, t, t + frames(s, 10)) * (next === undefined ? 1 : 1 - ramp(frame, next, next + frames(s, 10)));
        if (frame < t) return null;
        return (
          <div
            key={`card${i}`}
            style={{
              position: "absolute",
              left: cx(i) - slot / 2 + cardGap / 2,
              width: slot - cardGap,
              top: cardTop,
              bottom: 0,
              boxSizing: "border-box",
              padding: `${Math.round(labelPx * 0.6)}px ${Math.round(labelPx * 0.55)}px`,
              borderRadius: radius(s, 2),
              background: `linear-gradient(180deg, ${alpha(color, (dark ? 0.12 : 0.07) * hot)}, ${alpha(color, 0)} 70%), ${surfaceAt(s, 1)}`,
              boxShadow: `inset 0 ${(2 * hot + 1).toFixed(2)}px 0 ${alpha(isActive || hot > 0 ? color : s.palette.text, 0.1 + 0.6 * hot)}, ${shadow(s, hot > 0.5 ? 2 : 1)}`,
              opacity: clamp01(q * 1.6) * (done ? 0.82 : 1),
              transform: `translateY(${((1 - q) * 46 * s.amplitude).toFixed(2)}px)`,
              display: "flex",
              flexDirection: "column",
              gap: Math.round(notePx * 0.5),
              textAlign: "center",
            }}
          >
            <div style={{ overflow: "hidden", padding: "0.08em 0 0.16em", margin: "-0.08em 0 -0.16em" }}>
              <div
                style={{
                  fontFamily: fontFamily(s.typography.body),
                  fontWeight: isActive ? 700 : 600,
                  fontSize: labelPx,
                  lineHeight: 1.18,
                  color: s.palette.text,
                  transform: `translateY(${((1 - lab) * 110).toFixed(2)}%)`,
                }}
              >
                {label}
              </div>
            </div>
            {notes[i] ? (
              <div style={{ fontFamily: fontFamily(s.typography.body), fontWeight: 500, fontSize: notePx, lineHeight: 1.3, color: s.palette.muted, opacity: np, transform: `translateY(${((1 - np) * 10).toFixed(2)}px)` }}>
                {notes[i]}
              </div>
            ) : null}
          </div>
        );
      })}

      <svg width={width} height={cardTop} viewBox={`0 0 ${width} ${cardTop}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          <radialGradient id={`${id}-halo`}>
            <stop offset="0%" stopColor={color} stopOpacity={dark ? 0.5 : 0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mix(color, "#ffffff", 0.18)} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>

        {/* коннекторы: прорисовка за время шага i (до старта i + 1) */}
        {steps.slice(0, -1).map((_, i) => {
          const x0 = cx(i) + R + 18;
          const x1 = cx(i + 1) - R - 18;
          const t0 = starts[i]! + frames(s, 8);
          const t1 = Math.max(t0 + 1, starts[i + 1]! - frames(s, 2));
          const p = ramp(frame, t0, t1, EASE.inOutCubic);
          const x = x0 + (x1 - x0) * p;
          const ah = 14;
          const sw = 4;
          const dot = connector === "line" && p > 0 ? ramp(frame, t1, t1 + frames(s, 14), EASE.inOutCubic) : 0;
          return (
            <g key={`c${i}`}>
              <line x1={x0} x2={x1} y1={cy} y2={cy} stroke={alpha(s.palette.text, 0.12)} strokeWidth={sw * 0.75} strokeDasharray={connector === "line" ? "1 11" : undefined} strokeLinecap="round" />
              {p > 0 ? <line x1={x0} x2={x - (connector === "arrow" ? ah * 0.6 * p : 0)} y1={cy} y2={cy} stroke={color} strokeWidth={sw} strokeLinecap="round" /> : null}
              {connector === "arrow" && p > 0 ? (
                <path d={`M${x - ah} ${cy - ah * 0.75} L${x} ${cy} L${x - ah} ${cy + ah * 0.75}`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" opacity={clamp01(p * 4)} />
              ) : null}
              {connector === "line" && p > 0 ? <circle cx={x} cy={cy} r={6.5} fill={mix(color, "#ffffff", 0.5)} opacity={1 - dot} /> : null}
            </g>
          );
        })}

        {steps.map((_, i) => {
          const t = starts[i]!;
          const pop = springAt(frame, fps, s, t, "pop");
          const ring = ramp(frame, t, t + frames(s, 18), EASE.outExpo);
          const done = active > i;
          const next = starts[i + 1];
          // свечение активного шага разгорается и гаснет, когда активируется следующий
          const glow = ramp(frame, t, t + frames(s, 10)) * (next === undefined ? 1 : 1 - ramp(frame, next, next + frames(s, 10)));
          const fill = i === active || (next === undefined && frame >= t);
          return (
            <g key={`s${i}`} transform={`translate(${cx(i)} ${cy})`}>
              <circle r={R * 2.4} fill={`url(#${id}-halo)`} opacity={glow} />
              <circle r={Math.max(0, R * pop)} fill={fill ? `url(#${id}-fill)` : surfaceAt(s, 2)} stroke={alpha(s.palette.text, 0.1)} strokeWidth={1} />
              {ring > 0 ? <circle r={R + 9} fill="none" stroke={done ? alpha(color, 0.75) : color} strokeWidth={3} pathLength={1} strokeDasharray={drawDash(ring)} transform="rotate(-90)" /> : null}
            </g>
          );
        })}
      </svg>

      {/* номера — HTML поверх SVG */}
      {steps.map((_, i) => {
        const t = starts[i]!;
        const num = springAt(frame, fps, s, t + frames(s, 2), "snappy");
        const isActive = i === active || (i === n - 1 && frame >= t);
        const done = active > i;
        return (
          <div
            key={`n${i}`}
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
              fontSize: R * 0.7,
              letterSpacing: `${tracking(s, "mono")}em`,
              color: isActive ? (dark ? s.palette.bg : "#ffffff") : done ? color : s.palette.muted,
              opacity: clamp01(num * 1.6),
              transform: `translateY(${((1 - num) * R * 0.6).toFixed(2)}px)`,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {String(i + 1).padStart(2, "0")}
          </div>
        );
      })}
    </div>
  );
}
