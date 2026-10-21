// Карточка с глубиной: elevation 0..3 задаёт тень из StyleBible, светлоту поверхности,
// блик по верхней кромке и (для 2–3) вход с перспективой. Вход — от бита. Глубина стиля
// (depth 0..3, «объёмнее») сдвигает уровень тени и силу перспективы всех карточек сцены.
import type { Beat, StyleBible } from "@ms/contracts";
import type { CSSProperties, ReactNode } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { enterStyle } from "../choreo/enter.js";
import { springAt } from "../easing.js";
import { CLAMP, clamp01 } from "../internal.js";
import { amplitudeOf } from "../style/intensity.js";
import { depthOf } from "../style/resolve.js";
import { useStyle } from "../style.js";
import { type Elevation, accent, alpha, isDark, radius, shadow, space, surfaceAt } from "../tokens.js";

export type CardEnter = "rise" | "scale" | "flip" | "none";

export interface CardProps {
  elevation: Elevation;
  children?: ReactNode;
  /** Бит входа; без бита карточка видна сразу. */
  beat?: Pick<Beat, "start_frame" | "end_frame">;
  /** rise — подъём с перелётом, scale — из глубины, flip — поворот к зрителю (по умолчанию: flip для 2–3, rise для 0–1). */
  enter?: CardEnter;
  /** Задержка входа от начала бита, кадры. */
  delay?: number;
  /** Цветная кромка сверху: индекс акцента. */
  accentIndex?: number;
  width?: number | string;
  height?: number | string;
  padding?: number;
  style?: CSSProperties;
}

/** Уровень тени с учётом глубины стиля: depth 1 — как задано, 0 — ниже, 2–3 — выше. */
export const depthElevation = (s: StyleBible, elevation: number) => Math.max(0, Math.min(3, Math.round(elevation) + depthOf(s) - 1));

/** Сила перспективы и подъёма входа по глубине стиля. */
const DEPTH_K = [0.35, 1, 1.3, 1.6] as const;

/** Оформление поверхности карточки (без анимации) — для своих блоков в стиле kit. */
export function cardSurface(s: StyleBible, elevation: number): CSSProperties {
  const e = depthElevation(s, elevation);
  const dark = isDark(s);
  // шаги блика и кромки заметны между соседними уровнями: 1 и 2 не сливаются на тёмном фоне
  const sheen = dark ? alpha("#ffffff", [0.015, 0.035, 0.065, 0.095][e]!) : alpha("#ffffff", 0.6);
  const edge = dark ? alpha("#ffffff", [0.04, 0.075, 0.13, 0.18][e]!) : alpha("#ffffff", 0.9);
  return {
    background: `linear-gradient(180deg, ${sheen} 0%, ${alpha(sheen, 0)} 42%), ${surfaceAt(s, e)}`,
    boxShadow: `inset 0 1px 0 ${edge}, ${shadow(s, e)}`,
    borderRadius: radius(s, e >= 2 ? 2 : 1),
  };
}

/**
 * Прогресс входа карточки 0..1 (с перелётом для rise/scale) и стиль трансформации.
 * Общий для Card и узлов FlowGraph.
 */
export function cardEnterStyle(s: StyleBible, frame: number, fps: number, start: number, enter: CardEnter): CSSProperties {
  if (enter === "none") return {};
  const p = springAt(frame, fps, s, start, enter === "rise" ? "bouncy" : "snappy");
  const fade = clamp01(p * 1.6);
  const amp = amplitudeOf(s);
  const dk = DEPTH_K[depthOf(s)];
  // подъём — общий вход kit (enterStyle "rise") с пружиной bouncy вместо кривой
  if (enter === "rise") return enterStyle("rise", p, { amplitude: amp, distancePx: 70 });
  if (enter === "scale") {
    const sc = interpolate(p, [0, 1], [0.78, 1]);
    return { opacity: fade, transform: `scale(${sc.toFixed(4)})`, filter: `blur(${((1 - clamp01(p)) * 10).toFixed(2)}px)` };
  }
  const rx = (1 - p) * 28 * dk;
  const ty = (1 - p) * 50 * amp;
  const sc = interpolate(p, [0, 1], [0.9, 1]);
  return {
    opacity: fade,
    transform: `perspective(1400px) translateY(${ty.toFixed(2)}px) rotateX(${rx.toFixed(2)}deg) scale(${sc.toFixed(4)})`,
    transformOrigin: "50% 100%",
  };
}

export function Card({ elevation, children, beat, enter, delay = 0, accentIndex, width, height, padding, style }: CardProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mode: CardEnter = beat ? (enter ?? (elevation >= 2 ? "flip" : "rise")) : "none";
  const start = (beat?.start_frame ?? 0) + delay;
  const anim = cardEnterStyle(s, frame, fps, start, mode);
  const line = accentIndex === undefined ? 0 : interpolate(frame, [start + 6, start + 26], [0, 1], CLAMP);
  return (
    <div
      style={{
        position: "relative",
        boxSizing: "border-box",
        width,
        height,
        padding: padding ?? space(s, 0.75),
        color: s.palette.text,
        overflow: "hidden",
        ...cardSurface(s, elevation),
        ...anim,
        ...style,
      }}
    >
      {accentIndex === undefined ? null : (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: 3,
            width: `${(line * 100).toFixed(2)}%`,
            background: `linear-gradient(90deg, ${accent(s, accentIndex)}, ${alpha(accent(s, accentIndex), 0.2)})`,
            boxShadow: `0 0 16px ${alpha(accent(s, accentIndex), 0.7)}`,
          }}
        />
      )}
      {children}
    </div>
  );
}
