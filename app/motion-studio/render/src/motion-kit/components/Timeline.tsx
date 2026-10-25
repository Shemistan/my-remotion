// Таймлайн: тусклая дорожка проявляется, по ней прорисовывается толстая ось прогресса со
// светящейся головой; когда голова доходит до вехи, узел выскакивает (pop) с волной-
// кольцом, прорастает стебель, дата выезжает от оси, подпись и пояснение поднимаются
// следом. По горизонтали подписи чередуются над и под осью. Последняя веха — «сейчас»:
// крупный залитый узел с ореолом, дата и подпись — в акцентной плашке; остальные даты —
// цветом текста, акцент остаётся за «сейчас».
import type { CSSProperties, ReactNode } from "react";
import type { Beat } from "@ms/contracts";
import { Easing, useCurrentFrame, useVideoConfig } from "remotion";
import { accentPulse } from "../choreo/accent.js";
import { EASE, frames, springAt } from "../easing.js";
import { clamp01, ramp, useSvgId } from "../internal.js";
import { type TypeLevel, typeSize } from "../style/type-scale.js";
import { PosterGate } from "./Poster.js";
import type { Hold } from "../choreo/hold.js";
import { pathLUT } from "../geometry.js";
import { Comet, RadarRing, TickLabel, useHoldFrame } from "./HoldLayers.js";
import { useStyle } from "../style.js";
import { TIMELINE_LABEL_MIN, timelineLayoutFor, timelineScale, yearTickShown } from "../timeline-layout.js";
import { accent, alpha, fontFamily, isDark, mix, radius, tracking } from "../tokens.js";

export interface TimelineProps {
  /** До входа (0.4.0): `silhouette` (по умолчанию) — тихий контур с кадра 0 (кадр-постер); `hidden` — пусто. */
  pre?: "silhouette" | "hidden";
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
  /**
   * Финал (hold engine 0.5.0): `now-pulse` — волна радара от вехи «сейчас»;
   * `data-shimmer` (и `steady-flow`) — блик бежит по оси к «сейчас», веха вспыхивает на
   * приходе; `repeat-result` — подпись тика `label` над «сейчас»; `settle-push` — дыхание
   * вехи (наезд — у <Camera hold>).
   */
  hold?: Hold & { label?: string };
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

/** Timeline с кадром-постером до бита (PosterGate). */
export function Timeline(props: TimelineProps) {
  return <PosterGate pre={props.pre} beat={props.beat} render={(css, underlay) => <TimelineBody {...props} posterCss={css} underlay={underlay} />} />;
}

function TimelineBody({ items, beat, orientation, width, height, accentIndex = 0, highlightLast = true, hold, posterCss, underlay }: TimelineProps & { posterCss?: CSSProperties; underlay?: ReactNode }) {
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
  // шкала (0.5.5): у всех дат есть год — вехи по шкале лет, иначе равномерно; ось — во всю
  // ширину области (одна веха — не точка без оси), с делениями
  // скученные вехи (0.5.6) — равномерно: подписи одной стороны не налезают, точки не сливаются
  const fit = h ? { width: rect.w, node, label: TIMELINE_LABEL_MIN } : { width: rect.h, node, label: 0 };
  const scale = timelineScale(items.map((x) => x.date), fit);
  const pts = timelineLayoutFor(items.map((x) => x.date), rect, orientation, fit);
  const lastPt = pts.at(-1);
  const first = pts.length > 0 ? (h ? { x: rect.x, y: rect.y + rect.h / 2 } : { x: rect.x, y: rect.y }) : undefined;
  const axisEnd = pts.length > 0 ? (h ? { x: rect.x + rect.w, y: rect.y + rect.h / 2 } : { x: rect.x, y: rect.y + rect.h }) : undefined;
  const { a, b } = axisWindow(beat);
  const track = ramp(frame, beat.start_frame, a + (b - a) * 0.2, EASE.outQuart);
  const draw = ramp(frame, a, b, AXIS_EASE);
  // ось прогресса доходит до последней вехи («сейчас»): за ней — будущее, тихая дорожка с делениями
  const endU = Math.max(0.05, scale.pos.at(-1) ?? 1);
  const reach = draw * endU;
  const len = first && axisEnd ? Math.hypot(axisEnd.x - first.x, axisEnd.y - first.y) : 0;
  const head = first && axisEnd ? { x: first.x + (axisEnd.x - first.x) * reach, y: first.y + (axisEnd.y - first.y) * reach } : { x: 0, y: 0 };
  const headOn = draw > 0 && draw < 1;
  const uOf = (i: number) => scale.pos[i] ?? 0;
  const tickAt = (u: number) => (first && axisEnd ? { x: first.x + (axisEnd.x - first.x) * u, y: first.y + (axisEnd.y - first.y) * u } : { x: 0, y: 0 });
  const tickPx = size("caption");
  const hf = useHoldFrame(hold?.mode === "steady-flow" ? { ...hold, mode: "data-shimmer" } : hold);
  const fin = hf?.on && draw >= 1 ? hf : null;
  const ringFade = fin && hold!.mode === "now-pulse" ? 1 - fin.live : 1;
  // приход блика / тик — вспышка «сейчас» (дыхание финала с пиком в приход)
  const flare = fin && hold!.mode !== "settle-push" && hold!.mode !== "now-pulse" ? fin.live * Math.max(0, fin.breath) ** 3 : 0;
  const axisLut = first && lastPt && len > 0 ? pathLUT([[first, { x: first.x + (lastPt.x - first.x) / 3, y: first.y + (lastPt.y - first.y) / 3 }, { x: first.x + ((lastPt.x - first.x) * 2) / 3, y: first.y + ((lastPt.y - first.y) * 2) / 3 }, lastPt]], 24) : null;

  return (
    <div style={{ position: "relative", width: W, height: H, ...posterCss }}>
      {underlay}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id={`${id}-axis`} x1={first?.x ?? 0} y1={first?.y ?? 0} x2={axisEnd?.x ?? 1} y2={axisEnd?.y ?? 1} gradientUnits="userSpaceOnUse">
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
        {first && axisEnd ? (
          <g>
            {/* дорожка: тусклая, проявляется от центра к краям */}
            <line
              x1={first.x + (axisEnd.x - first.x) * 0.5 * (1 - track)}
              y1={first.y + (axisEnd.y - first.y) * 0.5 * (1 - track)}
              x2={axisEnd.x - (axisEnd.x - first.x) * 0.5 * (1 - track)}
              y2={axisEnd.y - (axisEnd.y - first.y) * 0.5 * (1 - track)}
              stroke={alpha(s.palette.text, dark ? 0.14 : 0.12)}
              strokeWidth={axisW}
              strokeLinecap="round"
            />
            {/* деления (0.5.5): тихие с дорожкой, пройденные головой — ярче; у лет — длиннее */}
            {scale.ticks.map((t, k) => {
              const q = tickAt(t.u);
              const major = t.label !== undefined;
              const half = node * (major ? 0.95 : 0.55);
              const passed = clamp01((reach - t.u) * 12);
              const o = track * (major ? 0.32 : 0.2) + passed * (major ? 0.45 : 0.25);
              return h
                ? <line key={`t${k}`} x1={q.x} x2={q.x} y1={q.y - half} y2={q.y + half} stroke={mix(s.palette.text, color, 0.35 * passed)} strokeWidth={major ? 2.5 : 1.75} strokeLinecap="round" opacity={o} />
                : <line key={`t${k}`} y1={q.y} y2={q.y} x1={q.x - half} x2={q.x + half} stroke={mix(s.palette.text, color, 0.35 * passed)} strokeWidth={major ? 2.5 : 1.75} strokeLinecap="round" opacity={o} />;
            })}
            {dark && draw > 0 ? <line x1={first.x} y1={first.y} x2={head.x} y2={head.y} stroke={color} strokeWidth={axisW * 2.4} opacity={0.4} filter={`url(#${id}-glow)`} /> : null}
            {draw > 0 && len > 0 ? <line x1={first.x} y1={first.y} x2={head.x} y2={head.y} stroke={`url(#${id}-axis)`} strokeWidth={axisW} strokeLinecap="round" /> : null}
            {fin && axisLut ? <Comet lut={axisLut} pos={fin.sweep} opacity={fin.sweepAlpha} color={color} width={axisW * 0.9} length={Math.max(140, len * 0.18)} /> : null}
            {headOn ? (
              <g>
                <circle cx={head.x} cy={head.y} r={axisW * 6} fill={`url(#${id}-head)`} />
                <circle cx={head.x} cy={head.y} r={axisW * 0.9} fill={mix(color, "#ffffff", 0.7)} />
              </g>
            ) : null}
          </g>
        ) : null}
        {pts.map((p, i) => {
          const rf = reachFrame(uOf(i) / endU, a, b);
          const pop = springAt(frame, fps, s, rf, "pop");
          const ring = ramp(frame, rf, rf + frames(s, 20), EASE.outQuart);
          const now = highlightLast && i === items.length - 1;
          const r = node * (now ? 1.5 : 1);
          // «сейчас» дышит после появления тем же accentPulse, что Emphasis: ореол — яркостью и
          // радиусом ≤ 3.6 r (шире — свечение крайней вехи доходит до края кадра: clipping)
          const pulse = now ? accentPulse(frame, s, { beat: { start_frame: rf + frames(s, 12), end_frame: rf + frames(s, 12) } }) : null;
          const breath = Math.min(1, (pulse?.level ?? 0) + (now ? 0.4 * flare : 0));
          const sign = i % 2 === 0 ? -1 : 1;
          const g = ramp(frame, rf + frames(s, 2), rf + frames(s, 12), EASE.outExpo);
          return (
            <g key={i}>
              {/* стебель к подписи (по горизонтали) */}
              {h && g > 0 ? <line x1={p.x} x2={p.x} y1={p.y + sign * r * 1.4} y2={p.y + sign * (r * 1.4 + stem * g)} stroke={alpha(color, now ? 0.8 : 0.45)} strokeWidth={2.5} strokeLinecap="round" /> : null}
              {frame >= rf ? <circle cx={p.x} cy={p.y} r={r + ring * r * 2.4} fill="none" stroke={color} strokeWidth={2.5} opacity={(1 - ring) * 0.85} /> : null}
              {now ? <circle cx={p.x} cy={p.y} r={r * (2.6 + 1.0 * breath) * (pulse?.scale ?? 1)} fill={`url(#${id}-now)`} opacity={clamp01(pop) * (0.3 + 0.7 * breath)} /> : null}
              {/* кольцо акцента: расходится от точки на каждом вдохе, как у Emphasis; не дальше 3 r —
                  крайняя веха стоит у края safe area, шире кольцо касается края кадра (clipping) */}
              {/* в now-pulse кольцо дыхания гаснет с набором волны радара (один ритм, без обрыва) */}
              {pulse && pulse.ripple >= 0 && ringFade > 0.005 ? (
                <circle cx={p.x} cy={p.y} r={r * (1.2 + 1.8 * (1 - (1 - pulse.ripple) ** 3))} fill="none" stroke={color} strokeWidth={2.5} opacity={0.8 * (1 - pulse.ripple) * pulse.rippleAlpha * ringFade} />
              ) : null}
              {now && fin && hold!.mode === "now-pulse" ? <RadarRing x={p.x} y={p.y} r0={r * 1.2} reach={r * 1.4} t={fin.ripple} opacity={fin.rippleAlpha} color={color} /> : null}
              <circle cx={p.x} cy={p.y} r={Math.max(0, r * pop * (pulse?.scale ?? 1))} fill={now ? color : s.palette.bg} stroke={color} strokeWidth={now ? 0 : 4} />
              <circle cx={p.x} cy={p.y} r={Math.max(0, r * (now ? 0.38 : 0.42) * pop * (pulse?.scale ?? 1))} fill={now ? (dark ? s.palette.bg : "#ffffff") : mix(color, s.palette.text, 0.2)} />
            </g>
          );
        })}
      </svg>

      {/* подпись тика repeat-result у «сейчас» — со стороны оси без подписей вехи */}
      {fin && hold!.mode === "repeat-result" && fin.tick && hold!.label && lastPt && highlightLast ? (
        h
          ? <TickLabel x={lastPt.x} y={(items.length - 1) % 2 === 0 ? lastPt.y + node * 4.4 : lastPt.y - node * 2.6} age={fin.tick.age} text={hold!.label} color={color} />
          : <TickLabel x={lastPt.x + node * 2.6} y={lastPt.y + node * 4} age={fin.tick.age} text={hold!.label} color={color} anchor="left" />
      ) : null}

      {/* подписи лет у делений (0.5.5): под осью, проявляются с головой; рядом с вехой — нет
          (стебель и дата там), кроме одиночной вехи (0.5.7: «февраль 2025» не теряет 2025) */}
      {h && scale.mode === "years"
        ? scale.ticks.filter((t) => t.label !== undefined && yearTickShown(tickAt(t.u).x, pts, Math.max(80, node * 4))).map((t, k) => {
            const q = tickAt(t.u);
            const o = clamp01(track * 0.6 + clamp01((reach - t.u) * 10) * 0.4);
            return (
              <div
                key={`y${k}`}
                style={{
                  position: "absolute", left: q.x - 60, top: q.y + node * 1.6, width: 120, textAlign: "center",
                  fontFamily: fontFamily(s.typography.mono), fontSize: tickPx, letterSpacing: `${tracking(s, "mono")}em`,
                  color: s.palette.muted, fontWeight: 500, lineHeight: 1, opacity: o,
                }}
              >
                {t.label}
              </div>
            );
          })
        : null}

      {/* подписи: дата — моноширинным от оси, подпись и пояснение — следом */}
      {pts.map((p, i) => {
        const it = items[i]!;
        const rf = reachFrame(uOf(i) / endU, a, b);
        const dp = ramp(frame, rf + frames(s, 2), rf + frames(s, 16), EASE.outExpo);
        const lp = springAt(frame, fps, s, rf + frames(s, 5), "snappy");
        const np = ramp(frame, rf + frames(s, 9), rf + frames(s, 22), EASE.outQuart);
        const above = h && i % 2 === 0;
        const sign = above ? -1 : 1;
        const now = highlightLast && i === items.length - 1;
        const r = node * (now ? 1.5 : 1);
        // подпись «сейчас» дышит вместе с точкой (тот же accentPulse)
        const nowPulse = now ? accentPulse(frame, s, { beat: { start_frame: rf + frames(s, 12), end_frame: rf + frames(s, 12) } }) : null;
        const nowLevel = nowPulse?.level ?? 0;
        // плашка дышит «телом» (swell — на четверть цикла позже света точки и даты)
        const plateLevel = nowPulse ? clamp01(nowPulse.strike + (1 - nowPulse.strike) * (0.55 * nowPulse.hold + 0.45 * nowPulse.swell)) : 0;
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
                    background: alpha(color, (dark ? 0.1 : 0.07) + (dark ? 0.1 : 0.06) * plateLevel),
                    boxShadow: `inset 0 0 0 1.5px ${alpha(color, 0.3 + 0.4 * plateLevel)}${dark ? `, 0 0 ${(12 + 20 * plateLevel).toFixed(1)}px ${alpha(color, 0.28 * plateLevel)}` : ""}`,
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
          // ширина подписи (0.5.6): не шире зазора до вех своей стороны (через одну) — на шкале
          // лет вехи стоят неравномерно
          const even = rect.w / Math.max(1, items.length - 1) - 30;
          const side = [i - 2, i + 2].filter((j) => j >= 0 && j < pts.length).map((j) => Math.abs(pts[j]!.x - p.x) - 30);
          const boxW = Math.max(TIMELINE_LABEL_MIN, Math.min(even, ...side));
          // крайние вехи: подпись выровнена к краю внутрь области, средние — по центру узла
          const u = uOf(i);
          const edge = items.length > 1 && u <= 0.08 ? "start" : items.length > 1 && u >= 0.92 ? "end" : "center";
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
