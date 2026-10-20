// Кинетическая типографика: текст входит по словам или буквам со сдвигом по времени.
// Входы: rise (из маски с перелётом), fade (проявление из размытия), scale (из глубины),
// slide (сдвиг со скосом), type (набор по буквам с кареткой). Задержки слегка разбросаны
// random(seed) — без «строя». Кегль — уровень шкалы от высоты кадра или шаг v0.1.
import type { Beat } from "@ms/contracts";
import type { CSSProperties } from "react";
import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { easingOf, frames, springAt } from "../easing.js";
import { CLAMP, clamp01 } from "../internal.js";
import { amplitudeOf } from "../style/intensity.js";
import { depthOf } from "../style/resolve.js";
import { type TypeLevel, typeSize } from "../style/type-scale.js";
import { useStyle } from "../style.js";
import { accent, alpha, fontFamily, isDark, tracking } from "../tokens.js";

export type KineticEnter = "rise" | "fade" | "scale" | "slide" | "type";

export interface KineticTextProps {
  text: string;
  beat: Pick<Beat, "start_frame" | "end_frame">;
  mode: "words" | "letters";
  enter: KineticEnter;
  /**
   * Уровень шкалы от высоты кадра (`display` | `h1` | `h2` | `body` | `caption`), шаг
   * шкалы v0.1 (0..8) или кегль в px (> 8). По умолчанию 6 (88 px).
   */
  size?: TypeLevel | number;
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
  const { fps, height } = useVideoConfig();
  const ref = s.typography[font];
  const px = typeof size === "string" ? typeSize(s, size, height) : size > 8 ? size : typeSize(s, size);
  const amp = amplitudeOf(s);
  const depth = depthOf(s);
  const marks = new Set(highlight.map(norm));

  const words = text.split(/\s+/).filter(Boolean);
  const units = mode === "letters" ? words.reduce((n, w) => n + Array.from(w).length, 0) : words.length;
  // разбег по биту: не дольше 60% его длины, чтобы последняя часть успела встать
  const len = Math.max(0, beat.end_frame - beat.start_frame);
  // stagger из props — своя константа (× интенсивность); по умолчанию — токен стиля
  const baseStagger = stagger !== undefined ? frames(s, stagger) : mode === "letters" ? Math.max(1, s.motion.stagger_frames * 0.5) : s.motion.stagger_frames;
  const step = Math.min(baseStagger, units > 1 ? (len * 0.6) / (units - 1) : baseStagger);
  const start = beat.start_frame + delay;
  const exitLen = s.motion.exit_frames;
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
      const p = interpolate(frame, [t0, t0 + s.motion.enter_frames * 1.2], [0, 1], { ...CLAMP, easing: enterEase });
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

  // глубина стиля 2–3: крупный текст чуть приподнят над фоном мягкой тенью
  const lift = depth >= 2 && px >= 40 ? `0 ${depth * 2}px ${depth * 9}px ${alpha(isDark(s) ? "#000000" : s.palette.text, isDark(s) ? 0.45 : 0.12)}` : undefined;
  const box: CSSProperties = {
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
    textShadow: lift,
    ...style,
  };

  if (enter === "type") {
    // набор: буквы появляются по одной (ритм — половина stagger стиля, не дольше 70 % бита),
    // ещё не набранные держат место (раскладка не прыгает); каретка мигает до конца бита
    const chars = Array.from(text);
    const perChar = Math.max(0.5, Math.min(stagger !== undefined ? frames(s, stagger) : Math.max(1, s.motion.stagger_frames * 0.5), (len * 0.7) / Math.max(1, chars.length)));
    const typed = frame < start ? 0 : Math.min(chars.length, Math.floor((frame - start) / perChar) + 1);
    const doneAt = start + chars.length * perChar;
    const caretOn = frame >= start && frame < beat.end_frame && (frame < doneAt || Math.floor((frame - doneAt) / 8) % 2 === 0);
    const caret = (
      <span key="caret" style={{ position: "relative", display: "inline-block", width: 0, height: "1em", verticalAlign: "-0.12em" }}>
        <span
          style={{
            position: "absolute",
            left: "0.03em",
            top: 0,
            width: "0.07em",
            height: "1em",
            background: accent(s, 0),
            boxShadow: `0 0 ${(px * 0.25).toFixed(1)}px ${alpha(accent(s, 0), 0.6)}`,
            opacity: caretOn ? 1 : 0,
          }}
        />
      </span>
    );
    let ci = 0;
    return (
      <div style={{ ...box, whiteSpace: "pre-wrap" }}>
        {words.flatMap((w, wi) => {
          const hot = marks.has(norm(w));
          const out = [
            <span key={`w${wi}`} style={{ color: hot ? accent(s, 0) : undefined, whiteSpace: "nowrap" }}>
              {Array.from(w).map((ch, li) => {
                const i = ci++;
                return (
                  <span key={li}>
                    <span style={{ opacity: i < typed ? 1 : 0 }}>{ch}</span>
                    {i === typed - 1 ? caret : null}
                  </span>
                );
              })}
            </span>,
          ];
          if (wi < words.length - 1) {
            const i = ci++;
            out.push(
              <span key={`s${wi}`}>
                {" "}
                {i === typed - 1 ? caret : null}
              </span>,
            );
          }
          return out;
        })}
        {typed === 0 ? caret : null}
      </div>
    );
  }

  let k = 0;
  return (
    <div
      style={box}
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
