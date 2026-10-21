// Сравнение «было / стало» (две стороны): панели въезжают навстречу друг другу и
// открываются шторкой от внешнего края, содержимое едет медленнее рамки (параллакс). В
// момент встречи — разделитель: линия прорастает от центра или выскакивает бейдж «VS».
// Пункты входят со своей стороны каскадом, значки ✕ / ✓ прорисовываются. В конце бита
// акцент переходит на правую сторону («стало»): она приподнимается и светится, левая
// приглушается.
import type { Beat } from "@ms/contracts";
import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, easingOf, frames, springAt } from "../easing.js";
import { clamp01, drawDash, ramp } from "../internal.js";
import { type TypeLevel, typeSize } from "../style/type-scale.js";
import { PosterGate } from "./Poster.js";
import { useStyle } from "../style.js";
import { accent, alpha, fontFamily, isDark, mix, radius, shadow, surfaceAt, tracking } from "../tokens.js";

export interface ComparisonSide {
  /** Короткая метка над заголовком: «Было», «Стало», «До», «После». */
  label: string;
  title: string;
  /** Пункты стороны (2–4 коротких). */
  items?: string[];
  /** Крупное итоговое значение стороны: «3 дня», «15 минут». */
  value?: string;
  /** Тон: negative — ✕ и цвет negative, positive — ✓ и positive; по умолчанию слева negative, справа positive. */
  tone?: "negative" | "positive" | "neutral";
}

export interface ComparisonSplitProps {
  /** До входа (0.4.0): `silhouette` (по умолчанию) — каркас итогового вида (формы без текста, 30 %) с кадра 0 (кадр-постер); `hidden` — пусто. */
  pre?: "silhouette" | "hidden";
  left: ComparisonSide;
  right: ComparisonSide;
  beat: Pick<Beat, "start_frame" | "end_frame">;
  divider: "vs" | "line";
  /** Акцент на правую сторону в конце бита (по умолчанию да). */
  emphasizeRight?: boolean;
  style?: CSSProperties;
}

/** Окна внутри бита: панели 0–34 %, встреча и разделитель с 24 %, пункты 23–55 %, акцент с 72 %. */
function windows(beat: Pick<Beat, "start_frame" | "end_frame">) {
  const b0 = beat.start_frame;
  const L = Math.max(1, beat.end_frame - b0);
  return { b0, L, meet: b0 + L * 0.24, items: b0 + L * 0.23, itemsSpan: L * 0.32, focus: b0 + L * 0.72 };
}

function Glyph({ tone, p, color, size }: { tone: "negative" | "positive" | "neutral"; p: number; color: string; size: number }) {
  // значок прорисовывается штрихом (pathLength = 1)
  const d = tone === "positive" ? "M5 12.5 L10 17.5 L19 7" : tone === "negative" ? "M7 7 L17 17 M17 7 L7 17" : "M6 12 H18";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: "none", overflow: "visible" }}>
      <circle cx={12} cy={12} r={11} fill={alpha(color, 0.14)} stroke={alpha(color, 0.45)} strokeWidth={1.2} opacity={clamp01(p * 2)} />
      {p > 0 ? <path d={d} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={drawDash(p)} /> : null}
    </svg>
  );
}

/** ComparisonSplit с кадром-постером до бита (PosterGate). */
export function ComparisonSplit(props: ComparisonSplitProps) {
  return <PosterGate pre={props.pre} beat={props.beat} render={(css) => <ComparisonSplitBody {...props} posterCss={css} />} />;
}

function ComparisonSplitBody({ left, right, beat, divider, emphasizeRight = true, style, posterCss }: ComparisonSplitProps & { posterCss?: CSSProperties }) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const dark = isDark(s);
  const { b0, L, meet, items, itemsSpan, focus: focusAt } = windows(beat);
  const enterEase = easingOf(s, "enter");
  const focus = emphasizeRight ? ramp(frame, focusAt, focusAt + frames(s, 18), EASE.inOutCubic) : 0;
  const size = (lv: TypeLevel) => typeSize(s, lv, height);
  const panelLen = L * 0.34;
  const dist = Math.round(height * 0.12 * s.amplitude);

  const panel = (side: ComparisonSide, which: "left" | "right"): ReactNode => {
    const dir = which === "left" ? -1 : 1;
    const t0 = b0 + (which === "left" ? 0 : s.motion.stagger_frames * 2);
    const p = ramp(frame, t0, t0 + panelLen, EASE.outQuart);
    const tone = side.tone ?? (which === "left" ? "negative" : "positive");
    const toneColor = tone === "negative" ? s.palette.negative : tone === "positive" ? s.palette.positive : s.palette.muted;
    const hot = which === "right" ? focus : 0;
    const dim = which === "left" ? focus : 0;
    // шторка открывается от внешнего края к центру и обгоняет сдвиг рамки: к моменту,
    // когда содержимое подъезжает, оно уже открыто (не режется краем шторки)
    const pc = ramp(frame, t0, t0 + panelLen * 0.7, EASE.outQuart);
    const clip = pc >= 1 ? undefined : `inset(0% ${which === "left" ? ((1 - pc) * 100).toFixed(2) : 0}% 0% ${which === "right" ? ((1 - pc) * 100).toFixed(2) : 0}% round ${radius(s, 3)}px)`;
    const list = side.items ?? [];
    const labelP = ramp(frame, t0 + panelLen * 0.35, t0 + panelLen * 0.35 + frames(s, 12), enterEase);
    const titleP = springAt(frame, fps, s, t0 + panelLen * 0.5, "snappy");
    const valueP = springAt(frame, fps, s, items + itemsSpan * 0.8, "pop");
    return (
      <div
        style={{
          position: "relative",
          flex: 1,
          height: "100%",
          transform: `translateX(${(dir * (1 - p) * dist).toFixed(2)}px) translateY(${(-hot * 10).toFixed(2)}px) scale(${(1 + hot * 0.015).toFixed(4)})`,
          clipPath: clip,
          filter: dim > 0 ? `saturate(${(1 - dim * 0.6).toFixed(3)})` : undefined,
          opacity: 1 - dim * 0.4,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: radius(s, 3),
            background: `radial-gradient(120% 80% at ${which === "left" ? "0% 0%" : "100% 0%"}, ${alpha(toneColor, dark ? 0.16 : 0.1)}, ${alpha(toneColor, 0)} 60%), ${surfaceAt(s, 2)}`,
            boxShadow: `inset 0 0 0 ${(1 + hot).toFixed(2)}px ${alpha(which === "right" ? accent(s, 0) : s.palette.text, 0.08 + hot * 0.5)}, ${shadow(s, hot > 0.5 ? 3 : 2)}${hot > 0 ? `, 0 0 ${(80 * hot).toFixed(1)}px -20px ${alpha(accent(s, 0), 0.7 * hot)}` : ""}`,
          }}
        />
        {/* содержимое едет медленнее рамки — глубина внутри панели */}
        <div
          style={{
            position: "relative",
            height: "100%",
            boxSizing: "border-box",
            padding: `${Math.round(height * 0.06)}px ${Math.round(height * 0.06)}px`,
            display: "flex",
            flexDirection: "column",
            gap: Math.round(height * 0.026),
            transform: `translateX(${(-dir * (1 - p) * dist * 0.45).toFixed(2)}px)`,
          }}
        >
          <div
            style={{
              alignSelf: "flex-start",
              padding: "6px 16px",
              borderRadius: 999,
              background: alpha(toneColor, 0.14),
              boxShadow: `inset 0 0 0 1.5px ${alpha(toneColor, 0.5)}`,
              color: toneColor,
              fontFamily: fontFamily(s.typography.mono),
              fontSize: size("caption") * 0.8,
              letterSpacing: `${tracking(s, "caps")}em`,
              textTransform: "uppercase",
              opacity: labelP,
              transform: `translateY(${((1 - labelP) * 14).toFixed(2)}px)`,
            }}
          >
            {side.label}
          </div>
          <div style={{ overflow: "hidden", padding: "0.06em 0 0.12em", margin: "-0.06em 0 -0.12em" }}>
            <div
              style={{
                fontFamily: fontFamily(s.typography.display),
                fontWeight: s.typography.display.weight ?? 800,
                fontSize: size("h2"),
                lineHeight: 1.08,
                letterSpacing: `${tracking(s, "display")}em`,
                color: s.palette.text,
                transform: `translateY(${((1 - titleP) * 105).toFixed(2)}%)`,
              }}
            >
              {side.title}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: Math.round(height * 0.018), marginTop: Math.round(height * 0.01) }}>
            {list.map((it, i) => {
              const ti = items + (list.length > 1 ? (i / (list.length - 1)) * itemsSpan * 0.6 : 0) + (which === "right" ? s.motion.stagger_frames : 0);
              const q = springAt(frame, fps, s, ti, "snappy");
              const g = ramp(frame, ti + frames(s, 3), ti + frames(s, 15), EASE.outExpo);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    opacity: clamp01(q * 1.8),
                    transform: `translateX(${(dir * (1 - q) * 40 * s.amplitude).toFixed(2)}px)`,
                    fontFamily: fontFamily(s.typography.body),
                    fontWeight: 500,
                    fontSize: size("body") * 0.8,
                    color: mix(s.palette.text, s.palette.muted, 0.25),
                  }}
                >
                  <Glyph tone={tone} p={g} color={toneColor} size={Math.round(size("body") * 0.8)} />
                  <span>{it}</span>
                </div>
              );
            })}
          </div>
          {side.value ? (
            <div
              style={{
                marginTop: "auto",
                fontFamily: fontFamily(s.typography.display),
                fontWeight: s.typography.display.weight ?? 800,
                fontSize: size("h1"),
                lineHeight: 1,
                letterSpacing: `${tracking(s, "display")}em`,
                color: which === "right" ? mix(s.palette.text, accent(s, 0), 0.25 + 0.75 * hot) : s.palette.text,
                fontVariantNumeric: "tabular-nums",
                opacity: clamp01(valueP * 2),
                transform: `scale(${Math.max(0, 0.6 + 0.4 * valueP).toFixed(4)})`,
                transformOrigin: "0% 100%",
                textShadow: hot > 0 ? `0 0 ${(40 * hot).toFixed(1)}px ${alpha(accent(s, 0), 0.5 * hot)}` : undefined,
              }}
            >
              {side.value}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  // разделитель: встреча панелей
  const grow = ramp(frame, meet - frames(s, 4), meet + frames(s, 16), EASE.outExpo);
  const badge = springAt(frame, fps, s, meet, "pop");
  const ripple = ramp(frame, meet, meet + frames(s, 22), EASE.outQuart);
  const gap = Math.round(height * (divider === "vs" ? 0.11 : 0.05));
  const lineGrad = `linear-gradient(180deg, ${alpha(accent(s, 0), 0)}, ${alpha(accent(s, 0), 0.9)} 50%, ${alpha(accent(s, 0), 0)})`;
  const vs = Math.round(height * 0.085);

  return (
    <div style={{ ...posterCss, position: "relative", display: "flex", width: "100%", height: "100%", gap, ...style }}>
      {panel(left, "left")}
      {panel(right, "right")}
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 0 }}>
        <div
          style={{
            position: "absolute",
            left: -1,
            top: `${((1 - grow) * 50).toFixed(2)}%`,
            bottom: `${((1 - grow) * 50).toFixed(2)}%`,
            width: 2,
            background: lineGrad,
            boxShadow: `0 0 18px ${alpha(accent(s, 0), 0.6)}`,
          }}
        />
        {divider === "vs" ? (
          <div style={{ position: "absolute", left: -vs / 2, top: "50%", marginTop: -vs / 2, width: vs, height: vs }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                boxShadow: `0 0 0 2px ${alpha(accent(s, 0), 0.6 * (1 - ripple))}`,
                transform: `scale(${(1 + ripple * 0.9).toFixed(4)})`,
                opacity: frame >= meet ? 1 : 0,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `radial-gradient(circle at 35% 30%, ${mix(accent(s, 0), "#ffffff", 0.25)}, ${accent(s, 0)} 70%)`,
                boxShadow: `0 0 0 6px ${alpha(s.palette.bg, 0.9)}, 0 0 48px ${alpha(accent(s, 0), 0.65)}`,
                color: dark ? s.palette.bg : "#ffffff",
                fontFamily: fontFamily(s.typography.display),
                fontWeight: 800,
                fontSize: vs * 0.36,
                letterSpacing: "0.02em",
                transform: `scale(${Math.max(0, badge).toFixed(4)}) rotate(${((1 - badge) * -40).toFixed(2)}deg)`,
                opacity: clamp01(badge * 3),
              }}
            >
              VS
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
