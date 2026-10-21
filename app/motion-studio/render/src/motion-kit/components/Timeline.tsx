// Таймлайн: тусклая дорожка проявляется, по ней прорисовывается ось прогресса со
// светящейся головой; когда голова доходит до вехи, узел выскакивает (pop) с волной-
// кольцом, дата выезжает от оси, подпись поднимается следом. По горизонтали подписи
// чередуются над и под осью; последняя веха — «сейчас»: крупнее и мягко пульсирует.
import type { Beat } from "@ms/contracts";
import { Easing, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, frames, springAt } from "../easing.js";
import { clamp01, ramp, useSvgId } from "../internal.js";
import { type TypeLevel, typeSize } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { timelineLayout } from "../timeline-layout.js";
import { accent, alpha, fontFamily, isDark, mix, tracking } from "../tokens.js";

export interface TimelineProps {
  items: { label: string; date: string }[];
  beat: Pick<Beat, "start_frame" | "end_frame">;
  orientation: "h" | "v";
  /** Размер области, px (по умолчанию h: 1500 × 520, v: 760 × 820). */
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
  const W = width ?? (h ? 1500 : 760);
  const H = height ?? (h ? 520 : 820);
  const size = (lv: TypeLevel) => typeSize(s, lv, frameH);
  const labelPx = Math.round(size("body") * 0.8);
  const datePx = Math.round(size("h2") * 0.78);

  // ось: по горизонтали — середина высоты, крайние вехи отступают от краёв на поле под
  // узел (подписи крайних вех выровнены к краю внутрь); по вертикали — колонка дат слева
  const padX = h ? Math.round(frameH * 0.04) : Math.round(W * 0.3);
  const padY = h ? 0 : 40;
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
  const node = Math.round(frameH * 0.019);
  const stem = Math.round(frameH * 0.045);

  return (
    <div style={{ position: "relative", width: W, height: H }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id={`${id}-axis`} x1={first?.x ?? 0} y1={first?.y ?? 0} x2={lastPt?.x ?? 1} y2={lastPt?.y ?? 1} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={mix(color, s.palette.bg, 0.5)} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <radialGradient id={`${id}-head`}>
            <stop offset="0%" stopColor={color} stopOpacity={0.9} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </radialGradient>
          <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={6} />
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
              stroke={alpha(s.palette.text, 0.14)}
              strokeWidth={2}
              strokeDasharray="2 10"
              strokeLinecap="round"
            />
            {dark && draw > 0 ? <line x1={first.x} y1={first.y} x2={head.x} y2={head.y} stroke={color} strokeWidth={8} opacity={0.45} filter={`url(#${id}-glow)`} /> : null}
            {draw > 0 && len > 0 ? <line x1={first.x} y1={first.y} x2={head.x} y2={head.y} stroke={`url(#${id}-axis)`} strokeWidth={4} strokeLinecap="round" /> : null}
            {headOn ? (
              <g>
                <circle cx={head.x} cy={head.y} r={24} fill={`url(#${id}-head)`} />
                <circle cx={head.x} cy={head.y} r={4} fill={mix(color, "#ffffff", 0.7)} />
              </g>
            ) : null}
          </g>
        ) : null}
        {pts.map((p, i) => {
          const u = items.length > 1 ? i / (items.length - 1) : 0;
          const rf = reachFrame(u, a, b);
          const pop = springAt(frame, fps, s, rf, "pop");
          const ring = ramp(frame, rf, rf + frames(s, 20), EASE.outQuart);
          const now = highlightLast && i === items.length - 1;
          const r = node * (now ? 1.35 : 1);
          // «сейчас» мягко дышит после появления (от кадра, без таймеров)
          const breath = now && frame > rf + frames(s, 20) ? 0.5 + 0.5 * Math.sin(((frame - rf) / fps) * Math.PI * 1.6) : 0;
          return (
            <g key={i}>
              {frame >= rf ? <circle cx={p.x} cy={p.y} r={r + ring * r * 2.2} fill="none" stroke={color} strokeWidth={2} opacity={(1 - ring) * 0.8} /> : null}
              {now ? <circle cx={p.x} cy={p.y} r={r * (1.9 + 0.35 * breath)} fill={alpha(color, 0.12 + 0.08 * breath)} opacity={clamp01(pop)} /> : null}
              <circle cx={p.x} cy={p.y} r={Math.max(0, r * pop)} fill={s.palette.bg} stroke={color} strokeWidth={3} />
              <circle cx={p.x} cy={p.y} r={Math.max(0, r * 0.45 * pop)} fill={now ? color : mix(color, s.palette.text, 0.2)} />
            </g>
          );
        })}
        {/* стебли от узла к подписи прорастают после появления узла */}
        {h
          ? pts.map((p, i) => {
              const u = items.length > 1 ? i / (items.length - 1) : 0;
              const rf = reachFrame(u, a, b);
              const g = ramp(frame, rf + frames(s, 2), rf + frames(s, 12), EASE.outExpo);
              if (g <= 0) return null;
              const sign = i % 2 === 0 ? -1 : 1;
              const y0 = p.y + sign * (node * 1.5);
              return <line key={`st${i}`} x1={p.x} x2={p.x} y1={y0} y2={y0 + sign * stem * g} stroke={alpha(color, 0.45)} strokeWidth={2} strokeLinecap="round" />;
            })
          : null}
      </svg>

      {/* подписи: дата — моноширинным акцентом от оси, подпись — следом */}
      {pts.map((p, i) => {
        const it = items[i]!;
        const u = items.length > 1 ? i / (items.length - 1) : 0;
        const rf = reachFrame(u, a, b);
        const dp = ramp(frame, rf + frames(s, 2), rf + frames(s, 16), EASE.outExpo);
        const lp = springAt(frame, fps, s, rf + frames(s, 5), "snappy");
        const above = h && i % 2 === 0;
        // по вертикали подпись отступает за ореол «сейчас» (≈ 2.3 радиуса узла)
        const off = node * 3.1;
        const sign = above ? -1 : 1;
        const now = highlightLast && i === items.length - 1;
        const dateEl = (
          <div
            style={{
              fontFamily: fontFamily(s.typography.mono),
              fontSize: datePx,
              letterSpacing: `${tracking(s, "mono")}em`,
              color: now ? color : mix(color, s.palette.muted, 0.35),
              fontWeight: 700,
              lineHeight: 1,
              whiteSpace: "nowrap",
              opacity: dp,
              transform: h ? `translateY(${(sign * (1 - dp) * -18).toFixed(2)}px)` : `translateX(${((1 - dp) * 18).toFixed(2)}px)`,
            }}
          >
            {it.date}
          </div>
        );
        const labelEl = (
          <div
            style={{
              fontFamily: fontFamily(s.typography.body),
              fontWeight: now ? 600 : 500,
              fontSize: labelPx,
              lineHeight: 1.2,
              color: now ? s.palette.text : mix(s.palette.text, s.palette.muted, 0.2),
              opacity: clamp01(lp * 1.8),
              transform: h ? `translateY(${(sign * (1 - lp) * -26 * s.amplitude).toFixed(2)}px)` : `translateX(${((1 - lp) * -26 * s.amplitude).toFixed(2)}px)`,
              maxWidth: h ? Math.max(200, rect.w / Math.max(1, items.length - 1) - 24) : W - padX - off - 20,
            }}
          >
            {it.label}
          </div>
        );
        if (h) {
          const boxW = Math.max(220, rect.w / Math.max(1, items.length - 1));
          // крайние вехи: подпись выровнена к краю внутрь области, средние — по центру узла
          const edge = items.length > 1 && i === 0 ? "start" : items.length > 1 && i === items.length - 1 ? "end" : "center";
          const left = edge === "start" ? p.x - node : edge === "end" ? p.x + node - boxW : p.x - boxW / 2;
          const gapY = node * 1.5 + stem + 10;
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
                gap: 6,
              }}
            >
              {dateEl}
              {labelEl}
            </div>
          );
        }
        return (
          <div key={i} style={{ position: "absolute", top: p.y, left: 0, width: W, height: 0 }}>
            <div style={{ position: "absolute", right: W - p.x + off, top: 0, transform: "translateY(-50%)" }}>{dateEl}</div>
            <div style={{ position: "absolute", left: p.x + off, top: 0, transform: "translateY(-50%)" }}>{labelEl}</div>
          </div>
        );
      })}
    </div>
  );
}
