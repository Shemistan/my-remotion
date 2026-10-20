// Кинетическая типографика: текст входит по словам или буквам со сдвигом по времени.
// Входы: rise (из маски с перелётом), fade (проявление из размытия), scale (из глубины),
// slide (сдвиг со скосом). Задержки слегка разбросаны random(seed) — без «строя».
import type { Beat } from "@ms/contracts";
import type { CSSProperties } from "react";
import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { easingOf, frames, springAt } from "../easing.js";
import { CLAMP, clamp01 } from "../internal.js";
import { useStyle } from "../style.js";
import { accent, fontFamily, intensityScale, tracking, typeSize } from "../tokens.js";

export type KineticEnter = "rise" | "fade" | "scale" | "slide";

export interface KineticTextProps {
  text: string;
  beat: Pick<Beat, "start_frame" | "end_frame">;
  mode: "words" | "letters";
  enter: KineticEnter;
  /** Шаг типографской шкалы (0..8) или кегль в px (> 8). По умолчанию 6 (88 px). */
  size?: number;
  /** Шрифт роли StyleBible. */
  font?: "display" | "body" | "mono";
  weight?: number;
  color?: string;
  /** Слова, выделяемые акцентом (сравнение без регистра и знаков препинания). */
  highlight?: string[];
  align?: "left" | "center" | "right";
  maxWidth?: number | string;
  lineHeight?: number;
  /** Задержка от начала бита, кадры. */
  delay?: number;
  /** Кадров между соседними частями; по умолчанию stagger_frames стиля (буквы — быстрее). */
  stagger?: number;
  /** Уйти в конце бита (последние exit_frames). */
  exit?: boolean;
  /** Прописные с разрядкой caps. */
  caps?: boolean;
  style?: CSSProperties;
}

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function KineticText({
  text,
  beat,
  mode,
  enter,
  size = 6,
  font = "display",
  weight,
  color,
  highlight = [],
  align = "left",
  maxWidth,
  lineHeight = 1.08,
  delay = 0,
  stagger,
  exit = false,
  caps = false,
  style,
}: KineticTextProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = s.typography[font];
  const px = size > 8 ? size : typeSize(s, size);
  const amp = intensityScale(s.motion.intensity).amplitude;
  const marks = new Set(highlight.map(norm));

  const words = text.split(/\s+/).filter(Boolean);
  const units = mode === "letters" ? words.reduce((n, w) => n + Array.from(w).length, 0) : words.length;
  // разбег по биту: не дольше 60% его длины, чтобы последняя часть успела встать
  const len = Math.max(0, beat.end_frame - beat.start_frame);
  const baseStagger = stagger ?? (mode === "letters" ? Math.max(1, s.motion.stagger_frames * 0.5) : s.motion.stagger_frames);
  const step = Math.min(frames(s, baseStagger), units > 1 ? (len * 0.6) / (units - 1) : baseStagger);
  const start = beat.start_frame + delay;
  const exitLen = frames(s, s.motion.exit_frames);
  const enterEase = easingOf(s, "enter");
  const exitEase = easingOf(s, "exit");

  const unitStyle = (i: number, key: string): { outer: CSSProperties; inner: CSSProperties } => {
    // разброс ±35% шага: соседние части входят не строем
    const jitter = (random(`${text}-${key}-${i}`) - 0.5) * step * 0.7;
    const t0 = start + i * step + Math.max(-i * step, jitter);
    let o: number;
    let inner: CSSProperties;
    if (enter === "rise") {
      const p = springAt(frame, fps, s, t0, "bouncy");
      o = clamp01(p * 2.2);
      inner = { transform: `translateY(${((1 - p) * 108 * amp).toFixed(2)}%) rotate(${((1 - p) * (mode === "letters" ? 8 : 3) * amp).toFixed(2)}deg)` };
    } else if (enter === "fade") {
      const p = interpolate(frame, [t0, t0 + frames(s, s.motion.enter_frames) * 1.2], [0, 1], { ...CLAMP, easing: enterEase });
      o = p;
      inner = { filter: `blur(${((1 - p) * 14).toFixed(2)}px)`, transform: `translateY(${((1 - p) * 0.22 * px).toFixed(2)}px)` };
    } else if (enter === "scale") {
      const p = springAt(frame, fps, s, t0, "snappy");
      o = clamp01(p * 1.8);
      const sc = interpolate(p, [0, 1], [mode === "letters" ? 0.2 : 0.55, 1]);
      inner = { transform: `scale(${sc.toFixed(4)})`, filter: `blur(${((1 - clamp01(p)) * 10).toFixed(2)}px)` };
    } else {
      const p = springAt(frame, fps, s, t0, "snappy");
      o = clamp01(p * 2);
      inner = { transform: `translateX(${((1 - p) * 0.55 * px * amp).toFixed(2)}px) skewX(${((1 - p) * -14 * amp).toFixed(2)}deg)` };
    }
    if (exit) {
      const e0 = beat.end_frame - exitLen + Math.min(i, 8) * 1;
      const e = interpolate(frame, [e0, e0 + exitLen * 0.8], [0, 1], { ...CLAMP, easing: exitEase });
      o *= 1 - e;
      inner = { ...inner, translate: `0px ${(-e * 0.35 * px).toFixed(2)}px` };
    }
    return {
      outer: enter === "rise" ? { overflow: "hidden", padding: "0.1em 0.04em 0.16em", margin: "-0.1em -0.04em -0.16em" } : {},
      inner: { display: "inline-block", opacity: o, transformOrigin: "50% 80%", ...inner },
    };
  };

  let k = 0;
  return (
    <div
      style={{
        fontFamily: fontFamily(ref),
        fontWeight: weight ?? ref.weight ?? 700,
        fontSize: px,
        lineHeight,
        letterSpacing: `${caps ? tracking(s, "caps") : tracking(s, font)}em`,
        textTransform: caps ? "uppercase" : undefined,
        color: color ?? s.palette.text,
        textAlign: align,
        maxWidth,
        fontKerning: "normal",
        ...style,
      }}
    >
      {words.map((w, wi) => {
        const hot = marks.has(norm(w));
        const wordColor = hot ? accent(s, 0) : undefined;
        const space = wi < words.length - 1 ? " " : "";
        if (mode === "words") {
          const u = unitStyle(k++, "w");
          return (
            <span key={wi}>
              <span style={{ display: "inline-block", verticalAlign: "top", ...u.outer }}>
                <span style={{ ...u.inner, color: wordColor }}>{w}</span>
              </span>
              {space}
            </span>
          );
        }
        return (
          <span key={wi}>
            <span style={{ display: "inline-block", whiteSpace: "nowrap", color: wordColor }}>
              {Array.from(w).map((ch, ci) => {
                const u = unitStyle(k++, "l");
                return (
                  <span key={ci} style={{ display: "inline-block", verticalAlign: "top", ...u.outer }}>
                    <span style={u.inner}>{ch}</span>
                  </span>
                );
              })}
            </span>
            {space}
          </span>
        );
      })}
    </div>
  );
}
