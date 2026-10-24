// Рисунок режимов удержания (0.5.0): блик-комета по пути (data-shimmer), волна радара от
// точки или карточки (now-pulse), подпись тика (repeat-result). Общие для FlowGraph,
// LineChart, LatencyRace, Timeline — у всех финалов один характер.
import type { CSSProperties } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Beat, HoldMode } from "@ms/contracts";
import { type Hold, type HoldFrame, holdAt, tickLabel } from "../choreo/hold.js";
import { type PathLUT, lutLength, pointAtLength, pointsBetween, polylineD } from "../geometry.js";
import { clamp01, useSvgId } from "../internal.js";
import { markHold } from "../layout-probe.js";
import { typeSize } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { accent, alpha, fontFamily, isDark, mix, radius, surfaceAt } from "../tokens.js";

/**
 * Кадр удержания для своих слоёв сцены (хук): `useHold(mode, beat)` или `useHold(hold)`;
 * якорь — длительность композиции. Блик — `sweep`/`sweepAlpha` (доля пути), волна —
 * `ripple`/`rippleAlpha`, дыхание — `breath × live`, наезд — `push`, тик — `tick.age`
 * (подпись — `tickLabel(age, style)`). До удержания — покой (`on: false`). Свой слой на
 * этом хуке объявляет пробе QA, что финал ведёт он: рисуй им движение режима, не ореол.
 */
export function useHold(mode: HoldMode | Hold | undefined, beat?: Pick<Beat, "start_frame" | "end_frame">): HoldFrame | null {
  const h: Hold | undefined = typeof mode === "string" ? (beat ? { mode, beat } : undefined) : mode;
  const f = useHoldQuiet(h);
  // метка для пробы раскладки QA: финал этого кадра ведёт hold engine
  if (f?.on) markHold(h!.mode);
  return f;
}

/**
 * Кадр удержания без метки пробы (носители kit, S3-fix2): носитель метит режим сам — только
 * когда его движение в кадре есть (импульс в пути, волна героя, повтор, блик), а не когда
 * режим включён.
 */
export function useHoldQuiet(h: Hold | undefined): HoldFrame | null {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return h ? holdAt(frame, h, s, durationInFrames) : null;
}

/** Кадр удержания для текущего кадра (хук, с меткой режима): `useHold(hold)`. */
export const useHoldFrame = (hold: Hold | undefined) => useHold(hold);

/**
 * Блик-комета по пути (SVG, координаты пути): яркая голова и хвост-градиент длиной `length`
 * px, мягкое свечение под ним. `pos` — доля пути головы 0..1, `opacity` — сила.
 */
export function Comet({ lut, pos, opacity, color, width = 5, length = 160 }: { lut: PathLUT; pos: number; opacity: number; color?: string; width?: number; length?: number }) {
  const s = useStyle();
  const id = useSvgId("ms-comet");
  if (pos < 0 || opacity <= 0.005) return null;
  const total = lutLength(lut);
  const head = pos * total;
  const tl = Math.min(length, total * 0.4);
  const pts = pointsBetween(lut, Math.max(0, head - tl), head);
  if (pts.length < 2) return null;
  const from = pts[0]!;
  const tip = pointAtLength(lut, head);
  const col = color ?? accent(s, 0);
  const core = mix(col, "#ffffff", isDark(s) ? 0.8 : 0.55);
  const d = polylineD(pts);
  return (
    <g opacity={clamp01(opacity).toFixed(4)} style={{ pointerEvents: "none" }}>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={from.x} y1={from.y} x2={tip.x} y2={tip.y}>
          <stop offset="0%" stopColor={core} stopOpacity={0} />
          <stop offset="65%" stopColor={core} stopOpacity={0.7} />
          <stop offset="100%" stopColor={core} stopOpacity={1} />
        </linearGradient>
        <filter id={`${id}-b`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={width * 1.6} />
        </filter>
      </defs>
      <path d={d} fill="none" stroke={col} strokeOpacity={0.85} strokeWidth={width * 3.6} strokeLinecap="round" filter={`url(#${id}-b)`} />
      <path d={d} fill="none" stroke={`url(#${id})`} strokeWidth={width} strokeLinecap="round" />
      <circle cx={tip.x} cy={tip.y} r={width * 4} fill={col} opacity={0.4} filter={`url(#${id}-b)`} />
      <circle cx={tip.x} cy={tip.y} r={width * 0.95} fill={core} />
    </g>
  );
}

/**
 * Волна радара от точки (SVG): кольцо уходит от `r0` на `reach` px с торможением и гаснет.
 * `t` — доля волны 0..1 (−1 — нет).
 */
export function RadarRing({ x, y, r0, reach, t, opacity, color }: { x: number; y: number; r0: number; reach: number; t: number; opacity: number; color?: string }) {
  const s = useStyle();
  if (t < 0 || opacity <= 0.005) return null;
  const col = color ?? accent(s, 0);
  const e = 1 - (1 - t) ** 3;
  return <circle cx={x} cy={y} r={(r0 + reach * e).toFixed(2)} fill="none" stroke={col} strokeWidth={(2.6 - 1.4 * t).toFixed(2)} opacity={(0.85 * (1 - t) ** 1.4 * opacity).toFixed(4)} style={{ pointerEvents: "none" }} />;
}

/**
 * Волна радара от карточки (HTML, поверх блока `rect`): скруглённый контур отходит на
 * `reach` px и гаснет — «система сейчас здесь», без мигающей рамки на самой карточке.
 * `oval` — эллипс вокруг блока (цилиндр store), а не скруглённый прямоугольник.
 */
export function CardRadar({ rect, r, reach, t, opacity, color, oval = false }: { rect: { x: number; y: number; w: number; h: number }; r: number; reach: number; t: number; opacity: number; color?: string; oval?: boolean }) {
  const s = useStyle();
  if (t < 0 || opacity <= 0.005) return null;
  const col = color ?? accent(s, 0);
  const e = 1 - (1 - t) ** 3;
  const off = 4 + reach * e;
  const a = 0.8 * (1 - t) ** 1.4 * opacity;
  // эллипс шире блока на 15 %: обводит скруглённые крышки цилиндра, а не режет их
  const ex = oval ? rect.w * 0.075 : 0;
  const ey = oval ? rect.h * 0.075 : 0;
  const st: CSSProperties = {
    position: "absolute", left: rect.x - off - ex, top: rect.y - off - ey, width: rect.w + 2 * (off + ex), height: rect.h + 2 * (off + ey),
    boxSizing: "border-box", borderRadius: oval ? "50%" : r + off, border: `2.5px solid ${alpha(col, a)}`, boxShadow: `0 0 ${(14 * (1 - t)).toFixed(1)}px ${alpha(col, 0.4 * a)}`,
    pointerEvents: "none",
  };
  return <div aria-hidden style={st} />;
}

/**
 * Подпись тика repeat-result («2 мс»): плашка проявляется с лёгким подъёмом у цели, стоит
 * и гаснет до следующего тика (подписи не налезают). `x, y` — низ-центр подписи, px слоя.
 */
export function TickLabel({ x, y, age, text, color, anchor = "center" }: { x: number; y: number; age: number; text: string; color?: string; anchor?: "center" | "left" | "right" }) {
  const s = useStyle();
  const { height: frameH } = useVideoConfig();
  const l = tickLabel(age, s);
  if (l.opacity <= 0.01 || text === "") return null;
  const col = color ?? accent(s, 0);
  const fs = typeSize(s, "caption", frameH);
  return (
    <div
      data-ms-layout="hold-tick"
      style={{
        position: "absolute", left: x, top: y, opacity: Number(l.opacity.toFixed(4)),
        transform: `translate(${anchor === "center" ? "-50%" : anchor === "right" ? "-100%" : "0"}, calc(-100% + ${l.dy.toFixed(2)}px)) scale(${l.scale.toFixed(4)})`,
        transformOrigin: anchor === "center" ? "50% 100%" : anchor === "right" ? "100% 100%" : "0% 100%",
        padding: `${Math.round(fs * 0.12)}px ${Math.round(fs * 0.4)}px`, borderRadius: radius(s, 1),
        background: alpha(surfaceAt(s, 2), 0.92), boxShadow: `inset 0 0 0 1.5px ${alpha(col, 0.55)}`,
        fontFamily: fontFamily(s.typography.mono), fontWeight: 700, fontSize: fs, lineHeight: 1.15, color: col,
        whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}
