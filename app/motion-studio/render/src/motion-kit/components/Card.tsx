// Карточка с глубиной: elevation 0..3 задаёт тень из StyleBible, светлоту поверхности,
// блик по верхней кромке и (для 2–3) вход с перспективой. Вход — от бита. Глубина стиля
// (depth 0..3, «объёмнее») сдвигает уровень тени и силу перспективы всех карточек сцены.
import type { Beat, StyleBible } from "@ms/contracts";
import type { CSSProperties, ReactNode } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { enterStyle } from "../choreo/enter.js";
import { fpsFrames, springAt } from "../easing.js";
import { CLAMP, clamp01 } from "../internal.js";
import { amplitudeOf } from "../style/intensity.js";
import { depthOf } from "../style/resolve.js";
import { useStyle } from "../style.js";
import { type Elevation, accent, alpha, isDark, radius, shadow, space, surfaceAt } from "../tokens.js";

/**
 * Вход карточки (и узла FlowGraph): rise — подъём с перелётом, scale — из глубины с
 * фокусом, flip — поворот к зрителю вокруг нижней кромки, pop — «выстрел» из точки с
 * перелётом, slide — въезд слева, swing — дверца вокруг левой кромки, blur — проявление
 * из расфокуса, fade — тихое проявление, none — сразу на месте.
 */
export type CardEnter = "rise" | "scale" | "flip" | "pop" | "slide" | "swing" | "blur" | "fade" | "none";

export interface CardProps {
  elevation: Elevation;
  children?: ReactNode;
  /** Бит входа; без бита карточка видна сразу. */
  beat?: Pick<Beat, "start_frame" | "end_frame">;
  /** Вид входа (CardEnter; по умолчанию: flip для 2–3, rise для 0–1). */
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
  const role = enter === "rise" || enter === "swing" ? "bouncy" : enter === "pop" ? "pop" : enter === "blur" || enter === "fade" ? "soft" : "snappy";
  const p = springAt(frame, fps, s, start, role);
  const fade = clamp01(p * 1.6);
  const amp = amplitudeOf(s);
  const dk = DEPTH_K[depthOf(s)];
  // подъём — общий вход kit (enterStyle "rise") с пружиной bouncy вместо кривой
  if (enter === "rise") return enterStyle("rise", p, { amplitude: amp, distancePx: 70 });
  if (enter === "scale") {
    const sc = interpolate(p, [0, 1], [0.78, 1]);
    return { opacity: fade, transform: `scale(${sc.toFixed(4)})`, filter: `blur(${((1 - clamp01(p)) * 10).toFixed(2)}px)` };
  }
  if (enter === "pop") {
    // из точки: масштаб от 0.35 с перелётом пружины pop, видимость — почти сразу
    const sc = Math.max(0, 1 - 0.65 * (1 - p) * Math.min(1.2, amp));
    return { opacity: clamp01(p * 3), transform: `scale(${sc.toFixed(4)})`, transformOrigin: "50% 50%" };
  }
  if (enter === "slide") {
    // въезд слева с лёгким смазом по ходу
    const tx = (1 - p) * -110 * amp;
    return { opacity: fade, transform: `translateX(${tx.toFixed(2)}px)`, filter: `blur(${(Math.abs(1 - clamp01(p)) * 6).toFixed(2)}px)` };
  }
  if (enter === "swing") {
    // дверца: поворот вокруг левой кромки в перспективе, с перелётом
    const ry = (1 - p) * -78 * dk;
    return { opacity: fade, transform: `perspective(1200px) rotateY(${ry.toFixed(2)}deg)`, transformOrigin: "0% 50%" };
  }
  if (enter === "blur") {
    // проявление из расфокуса: размытие и лёгкое уменьшение с 1.06
    const sc = 1 + 0.06 * (1 - clamp01(p));
    return { opacity: clamp01(p * 1.25), transform: `scale(${sc.toFixed(4)})`, filter: `blur(${((1 - clamp01(p)) * 16).toFixed(2)}px)` };
  }
  if (enter === "fade") return { opacity: clamp01(p) };
  const rx = (1 - p) * 28 * dk;
  const ty = (1 - p) * 50 * amp;
  const sc = interpolate(p, [0, 1], [0.9, 1]);
  return {
    opacity: fade,
    transform: `perspective(1400px) translateY(${ty.toFixed(2)}px) rotateX(${rx.toFixed(2)}deg) scale(${sc.toFixed(4)})`,
    transformOrigin: "50% 100%",
  };
}

/** Кадры прорисовки линии акцента: +6…+26 при 30 fps от входа, в секундах при любом fps. */
export function cardAccentLine(s: StyleBible, start: number): [number, number] {
  return [start + fpsFrames(s, 6), start + fpsFrames(s, 26)];
}

export function Card({ elevation, children, beat, enter, delay = 0, accentIndex, width, height, padding, style }: CardProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mode: CardEnter = beat ? (enter ?? (elevation >= 2 ? "flip" : "rise")) : "none";
  const start = (beat?.start_frame ?? 0) + delay;
  const anim = cardEnterStyle(s, frame, fps, start, mode);
  const line = accentIndex === undefined ? 0 : interpolate(frame, cardAccentLine(s, start), [0, 1], CLAMP);
  return (
    <div
      // контейнер для пробы раскладки QA (0.5.5): пустая карточка в финале — empty_container
      data-ms-box="card"
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
