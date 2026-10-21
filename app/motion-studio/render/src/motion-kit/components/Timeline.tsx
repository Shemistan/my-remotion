// Таймлайн: тусклая дорожка проявляется, по ней прорисовывается толстая ось прогресса со
// светящейся головой; когда голова доходит до вехи, узел выскакивает (pop) с волной-
// кольцом, прорастает стебель, дата выезжает от оси, подпись и пояснение поднимаются
// следом. По горизонтали подписи чередуются над и под осью. Последняя веха — «сейчас»:
// крупный залитый узел с ореолом, дата и подпись — в акцентной плашке; остальные даты —
// цветом текста, акцент остаётся за «сейчас».
import type { Beat } from "@ms/contracts";
import { Easing, useCurrentFrame, useVideoConfig } from "remotion";
import { accentPulse } from "../choreo/accent.js";
import { EASE, frames, springAt } from "../easing.js";
import { clamp01, ramp, useSvgId } from "../internal.js";
import { type TypeLevel, typeSize } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { timelineLayout } from "../timeline-layout.js";
import { accent, alpha, fontFamily, isDark, mix, radius, tracking } from "../tokens.js";

export interface TimelineProps {
  /** Вехи: дата, подпись (до трёх слов) и необязательное пояснение (одна короткая строка). */
  items: { label: string; date: string; note?: string }[];
  beat: Pick<Beat, "start_frame" | "end_frame">;
  orientation: "h" | "v";
  /** Размер области, px (по умолчанию h: 1690 × 620, v: 1100 × 760). */
  width?: number;
  height?: number;
  accentIndex?: number;
  /** Выделить последнюю веху как «сейчас» (по умолчанию да). */
  highlightLast?: boolean;
}

const AXIS_EASE = Easing.bezier(0.6, 0, 0.25, 1);

/** Окно прорисовки оси: 10–80 % бита; голова идёт по S-кривой. */
function axisWindow(beat: Pick<Beat, "start_frame" | "end_frame">) {
  const L = Math.max(1, beat.end_frame - beat.start_frame);
  return { a: beat.start_frame + L * 0.1, b: beat.start_frame + L * 0.8 };
}

/** Кадр, когда голова оси доходит до доли `u` длины (обратная к S-кривой, бинарный поиск). */
function reachFrame(u: number, a: number, b: number): number {
  if (u <= 0) return a;
  let lo = a;
  let hi = b;
  for (let k = 0; k < 20; k++) {
    const mid = (lo + hi) / 2;
    if (ramp(mid, a, b, AXIS_EASE) < u) lo = mid;
    else hi = mid;
  }
  return hi;
}

export function Timeline({ items, beat, orientation, width, height, accentIndex = 0, highlightLast = true }: TimelineProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, height: frameH } = useVideoConfig();
  const id = useSvgId("ms-tl");
  const dark = isDark(s);
  const color = accent(s, accentIndex);
  const h = orientation === "h";
  const W = width ?? (h ? 1690 : 1100);
  const H = height ?? (h ? 620 : 760);
  const size = (lv: TypeLevel) => typeSize(s, lv, frameH);
  const datePx = size("h2");
  const labelPx = Math.round(size("body") * 0.92);
  const notePx = size("caption");
  const node = Math.round(frameH * 0.024);
  const stem = Math.round(frameH * 0.05);
  const axisW = Math.max(5, Math.round(frameH * 0.0065));

  // ось: по горизонтали — середина высоты, крайние вехи отступают от краёв на поле под
  // узел (подписи крайних вех выровнены к краю внутрь); по вертикали — колонка дат слева
  const padX = h ? Math.round(node * 2.2) : Math.round(W * 0.26);
  const padY = h ? 0 : Math.round(node * 2);
  const rect = h ? { x: padX, y: 0, w: W - 2 * padX, h: H } : { x: padX, y: padY, w: 0, h: H - 2 * padY };
  const pts = timelineLayout(items.length, rect, orientation);
  const first = pts[0];
  const lastPt = pts.at(-1);
  const { a, b } = axisWindow(beat);
  const track = ramp(frame, beat.start_frame, a + (b - a) * 0.2, EASE.outQuart);
  const draw = ramp(frame, a, b, AXIS_EASE);
  const len = first && lastPt ? Math.hypot(lastPt.x - first.x, lastPt.y - first.y) : 0;
  const head = first && lastPt ? { x: first.x + (lastPt.x - first.x) * draw, y: first.y + (lastPt.y - first.y) * draw } : { x: 0, y: 0 };
  const headOn = draw > 0 && draw < 1;
  const uOf = (i: number) => (items.length > 1 ? i / (items.length - 1) : 0);

  return (
    <div style={{ position: "relative", width: W, height: H }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id={`${id}-axis`} x1={first?.x ?? 0} y1={first?.y ?? 0} x2={lastPt?.x ?? 1} y2={lastPt?.y ?? 1} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={mix(color, s.palette.bg, 0.45)} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <radialGradient id={`${id}-head`}>
            <stop offset="0%" stopColor={color} stopOpacity={0.9} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`${id}-now`}>
            <stop offset="0%" stopColor={color} stopOpacity={dark ? 0.5 : 0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </radialGradient>
          <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={8} />
          </filter>
        </defs>
        {first && lastPt ? (
          <g>
            {/* дорожка: тусклая, проявляется от центра к краям */}
            <line
              x1={first.x + (lastPt.x - first.x) * 0.5 * (1 - track)}
              y1={first.y + (lastPt.y - first.y) * 0.5 * (1 - track)}
              x2={lastPt.x - (lastPt.x - first.x) * 0.5 * (1 - track)}
              y2={lastPt.y - (lastPt.y - first.y) * 0.5 * (1 - track)}
              stroke={alpha(s.palette.text, dark ? 0.14 : 0.12)}
              strokeWidth={axisW}
              strokeLinecap="round"
            />
            {dark && draw > 0 ? <line x1={first.x} y1={first.y} x2={head.x} y2={head.y} stroke={color} strokeWidth={axisW * 2.4} opacity={0.4} filter={`url(#${id}-glow)`} /> : null}
            {draw > 0 && len > 0 ? <line x1={first.x} y1={first.y} x2={head.x} y2={head.y} stroke={`url(#${id}-axis)`} strokeWidth={axisW} strokeLinecap="round" /> : null}
            {headOn ? (
              <g>
                <circle cx={head.x} cy={head.y} r={axisW * 6} fill={`url(#${id}-head)`} />
                <circle cx={head.x} cy={head.y} r={axisW * 0.9} fill={mix(color, "#ffffff", 0.7)} />
              </g>
            ) : null}
          </g>
        ) : null}
        {pts.map((p, i) => {
          const rf = reachFrame(uOf(i), a, b);
          const pop = springAt(frame, fps, s, rf, "pop");
          const ring = ramp(frame, rf, rf + frames(s, 20), EASE.outQuart);
          const now = highlightLast && i === items.length - 1;
          const r = node * (now ? 1.5 : 1);
          // «сейчас» дышит после появления тем же accentPulse, что Emphasis (ореол 3 → 3.8 r)
          const pulse = now ? accentPulse(frame, s, { beat: { start_frame: rf + frames(s, 12), end_frame: rf + frames(s, 12) } }) : null;
          const breath = pulse?.level ?? 0;
          const sign = i % 2 === 0 ? -1 : 1;
          const g = ramp(frame, rf + frames(s, 2), rf + frames(s, 12), EASE.outExpo);
          return (
            <g key={i}>
              {/* стебель к подписи (по горизонтали) */}
              {h && g > 0 ? <line x1={p.x} x2={p.x} y1={p.y + sign * r * 1.4} y2={p.y + sign * (r * 1.4 + stem * g)} stroke={alpha(color, now ? 0.8 : 0.45)} strokeWidth={2.5} strokeLinecap="round" /> : null}
              {frame >= rf ? <circle cx={p.x} cy={p.y} r={r + ring * r * 2.4} fill="none" stroke={color} strokeWidth={2.5} opacity={(1 - ring) * 0.85} /> : null}
              {now ? <circle cx={p.x} cy={p.y} r={r * (2.4 + 1.8 * breath) * (pulse?.scale ?? 1)} fill={`url(#${id}-now)`} opacity={clamp01(pop) * (0.4 + 0.6 * breath)} /> : null}
              {/* кольцо акцента: расходится от точки на каждом вдохе, как у Emphasis */}
              {pulse && pulse.ripple >= 0 ? (
                <circle cx={p.x} cy={p.y} r={r * (1.2 + 2.4 * (1 - (1 - pulse.ripple) ** 3))} fill="none" stroke={color} strokeWidth={3} opacity={0.85 * (1 - pulse.ripple) * pulse.rippleAlpha} />
              ) : null}
              <circle cx={p.x} cy={p.y} r={Math.max(0, r * pop * (pulse?.scale ?? 1))} fill={now ? color : s.palette.bg} stroke={color} strokeWidth={now ? 0 : 4} />
              <circle cx={p.x} cy={p.y} r={Math.max(0, r * (now ? 0.38 : 0.42) * pop * (pulse?.scale ?? 1))} fill={now ? (dark ? s.palette.bg : "#ffffff") : mix(color, s.palette.text, 0.2)} />
            </g>
          );
        })}
      </svg>

      {/* подписи: дата — моноширинным от оси, подпись и пояснение — следом */}
      {pts.map((p, i) => {
        const it = items[i]!;
        const rf = reachFrame(uOf(i), a, b);
        const dp = ramp(frame, rf + frames(s, 2), rf + frames(s, 16), EASE.outExpo);
        const lp = springAt(frame, fps, s, rf + frames(s, 5), "snappy");
        const np = ramp(frame, rf + frames(s, 9), rf + frames(s, 22), EASE.outQuart);
        const above = h && i % 2 === 0;
        const sign = above ? -1 : 1;
        const now = highlightLast && i === items.length - 1;
        const r = node * (now ? 1.5 : 1);
        // подпись «сейчас» дышит вместе с точкой (тот же accentPulse)
        const nowLevel = now ? accentPulse(frame, s, { beat: { start_frame: rf + frames(s, 12), end_frame: rf + frames(s, 12) } }).level : 0;
        const dateEl = (
          <div
            style={{
              fontFamily: fontFamily(s.typography.mono),
              fontSize: datePx * (now ? 1.12 : 1),
              letterSpacing: `${tracking(s, "mono")}em`,
              color: now ? color : s.palette.text,
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: "nowrap",
              opacity: dp * (now ? 1 : 0.9),
              transform: h ? `translateY(${(sign * (1 - dp) * -20).toFixed(2)}px)` : `translateX(${((1 - dp) * 20).toFixed(2)}px)`,
              textShadow: now && dark ? `0 0 ${(datePx * (0.25 + 0.35 * nowLevel)).toFixed(1)}px ${alpha(color, (0.25 + 0.5 * nowLevel) * dp)}` : undefined,
            }}
          >
            {it.date}
          </div>
        );
        const labelEl = (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              opacity: clamp01(lp * 1.8),
              transform: h ? `translateY(${(sign * (1 - lp) * -26 * s.amplitude).toFixed(2)}px)` : `translateX(${((1 - lp) * -26 * s.amplitude).toFixed(2)}px)`,
              ...(now
                ? {
                    padding: "10px 18px", margin: "-10px -18px", borderRadius: radius(s, 1),
                    // плашка «сейчас» дышит с точкой: заливка, кромка и мягкое свечение наружу
                    background: alpha(color, (dark ? 0.1 : 0.07) + (dark ? 0.1 : 0.06) * nowLevel),
                    boxShadow: `inset 0 0 0 1.5px ${alpha(color, 0.3 + 0.4 * nowLevel)}${dark ? `, 0 0 ${(12 + 20 * nowLevel).toFixed(1)}px ${alpha(color, 0.28 * nowLevel)}` : ""}`,
                  }
                : {}),
            }}
          >
            <div style={{ fontFamily: fontFamily(s.typography.body), fontWeight: now ? 700 : 600, fontSize: labelPx, lineHeight: 1.15, color: s.palette.text }}>{it.label}</div>
            {it.note ? (
              <div style={{ fontFamily: fontFamily(s.typography.body), fontWeight: 500, fontSize: notePx, lineHeight: 1.25, color: s.palette.muted, opacity: np }}>{it.note}</div>
            ) : null}
          </div>
        );
        if (h) {
          const boxW = Math.max(240, rect.w / Math.max(1, items.length - 1) - 30);
          // крайние вехи: подпись выровнена к краю внутрь области, средние — по центру узла
          const edge = items.length > 1 && i === 0 ? "start" : items.length > 1 && i === items.length - 1 ? "end" : "center";
          // плашка «сейчас» выступает на 18 px — у края области сдвигаем подпись внутрь
          const inset = now ? 20 : 0;
          const left = edge === "start" ? p.x - r + inset : edge === "end" ? p.x + r - boxW - inset : p.x - boxW / 2;
          const gapY = r * 1.4 + stem + 12;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left,
                width: boxW,
                ...(above ? { bottom: H - p.y + gapY } : { top: p.y + gapY }),
                display: "flex",
                flexDirection: above ? "column-reverse" : "column",
                alignItems: edge === "start" ? "flex-start" : edge === "end" ? "flex-end" : "center",
                textAlign: edge === "start" ? "left" : edge === "end" ? "right" : "center",
                gap: 14,
              }}
            >
              {dateEl}
              {labelEl}
            </div>
          );
        }
        // по вертикали: дата слева от оси, подпись справа; отступ — за ореол «сейчас»
        const off = node * 4.6;
        return (
          <div key={i} style={{ position: "absolute", top: p.y, left: 0, width: W, height: 0 }}>
            <div style={{ position: "absolute", right: W - p.x + off, top: 0, transform: "translateY(-50%)" }}>{dateEl}</div>
            <div style={{ position: "absolute", left: p.x + off, top: 0, transform: "translateY(-50%)", maxWidth: W - p.x - off - 10 }}>{labelEl}</div>
          </div>
        );
      })}
    </div>
  );
}
