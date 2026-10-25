// Акцент на ключевой мысли (key-point-emphasis) внутри строки текста:
// - marker — мазок маркера за текстом прокатывается слева направо; кромки мазка
//   неровные (random(seed)), как от настоящего маркера;
// - underline — рукописная линия под текстом прорисовывается, следом — вторая, тоньше;
// - glow — текст разгорается акцентом со свечением и коротким «ударом» масштаба, по
//   буквам проходит блик.
// Фраза не переносится (inline-block): выделяй 1–4 слова.
import type { Beat } from "@ms/contracts";
import type { CSSProperties, ReactNode } from "react";
import { random, useCurrentFrame, useVideoConfig } from "remotion";
import { EASE, frames, springAt } from "../easing.js";
import { clamp01, drawDash, ramp, useSvgId } from "../internal.js";
import { useStyle } from "../style.js";
import { accent, alpha, isDark, mix } from "../tokens.js";

export interface HighlightProps {
  children: ReactNode;
  beat: Pick<Beat, "start_frame" | "end_frame">;
  mode: "marker" | "underline" | "glow";
  accentIndex?: number;
  /** Сид неровности кромок маркера и линии. */
  seed?: string;
  style?: CSSProperties;
}

/**
 * Мазок маркера в координатах 0..100: верхняя и нижняя кромки чуть волнистые, торцы
 * скошены и неровные, весь мазок слегка наклонён — как проведённый рукой фетр.
 */
function markerPath(seed: string): string {
  const r = (k: string) => random(`${seed}-${k}`);
  const top = 34 + r("t") * 6;
  const bot = 94 + r("b") * 4;
  const tilt = (r("tilt") - 0.5) * 7;
  const f = (v: number) => v.toFixed(2);
  const yTop = (x: number, i: number) => top - (tilt * x) / 100 + (r(`tw${i}`) - 0.5) * 3.5;
  const yBot = (x: number, i: number) => bot - (tilt * x) / 100 + (r(`bw${i}`) - 0.5) * 3.5;
  const xs = [4, 22, 41, 60, 79, 96];
  const topEdge = xs.map((x, i) => `L${f(x)} ${f(yTop(x, i))}`).join(" ");
  const botEdge = [...xs].reverse().map((x, i) => `L${f(x)} ${f(yBot(x, i))}`).join(" ");
  // торцы: скос и пара зазубрин
  const l0 = -1.5 + r("l0") * 2;
  const r0 = 100 + r("r0") * 2.5;
  return `M${f(l0 + 2.5)} ${f(yTop(0, 9))} ${topEdge} L${f(r0)} ${f(yTop(100, 8) + 4)} L${f(r0 - 1.2)} ${f((top + bot) / 2 - tilt)} L${f(r0 - 2.6)} ${f(yBot(100, 7))} ${botEdge} L${f(l0)} ${f(yBot(0, 6))} L${f(l0 + 1.2)} ${f((top + bot) / 2)} Z`;
}

/** Рукописная линия под текстом: плавная кривая с небольшим провисом и подъёмом в конце. */
function underlinePath(seed: string, k: number): string {
  const r = (n: string) => random(`${seed}-u${k}-${n}`);
  const y0 = 8 + r("a") * 4;
  const sag = 12 + r("b") * 5;
  const y1 = 5 + r("c") * 5;
  return `M${(-1 + r("d") * 2).toFixed(2)} ${y0.toFixed(2)} C 30 ${sag.toFixed(2)}, 70 ${(sag - 2).toFixed(2)}, ${(101 + r("e") * 2).toFixed(2)} ${y1.toFixed(2)}`;
}

export function Highlight({ children, beat, mode, accentIndex = 0, seed = "hl", style }: HighlightProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const id = useSvgId("ms-hl");
  const dark = isDark(s);
  const color = accent(s, accentIndex);
  const b0 = beat.start_frame;
  const L = Math.max(1, beat.end_frame - b0);
  const sweepLen = Math.max(frames(s, 14), Math.min(L * 0.45, frames(s, 26)));
  const p = ramp(frame, b0, b0 + sweepLen, EASE.inOutCubic);

  if (mode === "glow") {
    const g = ramp(frame, b0, b0 + sweepLen, EASE.outQuart);
    const hit = springAt(frame, fps, s, b0, "pop");
    const bump = 1 + 0.06 * Math.max(0, Math.min(1.3, hit)) * (1 - g * 0.5) * (frame >= b0 ? 1 : 0);
    const sheen = ramp(frame, b0 + sweepLen * 0.4, b0 + sweepLen * 0.4 + frames(s, 22), EASE.inOutCubic);
    const textColor = mix(s.palette.text, color, g);
    return (
      <span data-ms-accent={g > 0 ? g.toFixed(2) : undefined} style={{ position: "relative", display: "inline-block", whiteSpace: "nowrap", transform: `scale(${bump.toFixed(4)})`, transformOrigin: "50% 60%", ...style }}>
        <span style={{ color: textColor, textShadow: g > 0 ? `0 0 ${(0.35 * g).toFixed(3)}em ${alpha(color, (dark ? 0.75 : 0.45) * g)}, 0 0 ${(0.9 * g).toFixed(3)}em ${alpha(color, (dark ? 0.35 : 0.2) * g)}` : undefined }}>
          {children}
        </span>
        {sheen > 0 && sheen < 1 ? (
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              color: "transparent",
              backgroundImage: `linear-gradient(105deg, transparent 0%, transparent 40%, ${alpha("#ffffff", dark ? 0.85 : 0.7)} 50%, transparent 60%, transparent 100%)`,
              backgroundSize: "300% 100%",
              backgroundPosition: `${(100 - sheen * 100).toFixed(2)}% 0%`,
              backgroundRepeat: "no-repeat",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
            }}
          >
            {children}
          </span>
        ) : null}
      </span>
    );
  }

  if (mode === "marker") {
    return (
      <span data-ms-accent={p > 0 ? p.toFixed(2) : undefined} style={{ position: "relative", display: "inline-block", whiteSpace: "nowrap", isolation: "isolate", ...style }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", left: "-0.12em", right: "-0.12em", top: 0, width: "calc(100% + 0.24em)", height: "100%", zIndex: -1, overflow: "visible" }}>
          <defs>
            <clipPath id={`${id}-sweep`}>
              <rect x={-5} y={-10} width={110 * p} height={120} />
            </clipPath>
          </defs>
          <path d={markerPath(seed)} fill={alpha(color, dark ? 0.5 : 0.32)} clipPath={`url(#${id}-sweep)`} />
          {/* более плотная середина мазка */}
          <path d={markerPath(`${seed}-core`)} fill={alpha(color, dark ? 0.22 : 0.14)} clipPath={`url(#${id}-sweep)`} transform="translate(0 6) scale(1 0.9)" />
        </svg>
        <span style={{ color: p > 0.5 && dark ? mix(s.palette.text, "#ffffff", 0.4) : undefined }}>{children}</span>
      </span>
    );
  }

  // underline: основная линия, следом — вторая, тоньше
  const p2 = ramp(frame, b0 + frames(s, 6), b0 + frames(s, 6) + sweepLen, EASE.inOutCubic);
  return (
    <span data-ms-accent={p > 0 ? p.toFixed(2) : undefined} style={{ position: "relative", display: "inline-block", whiteSpace: "nowrap", ...style }}>
      <span>{children}</span>
      <svg viewBox="0 0 100 20" preserveAspectRatio="none" style={{ position: "absolute", left: "-0.04em", width: "calc(100% + 0.08em)", bottom: "-0.24em", height: "0.32em", overflow: "visible" }}>
        {p > 0 ? <path d={underlinePath(seed, 0)} fill="none" stroke={color} strokeWidth={4.2} strokeLinecap="round" pathLength={1} strokeDasharray={drawDash(p)} /> : null}
        {p2 > 0 ? <path d={underlinePath(seed, 1)} fill="none" stroke={alpha(color, 0.7)} strokeWidth={2.2} strokeLinecap="round" pathLength={1} strokeDasharray={drawDash(p2)} transform="translate(0 6)" /> : null}
      </svg>
      {dark && p > 0 ? <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: "-0.3em", height: "0.4em", background: `radial-gradient(60% 50% at 50% 50%, ${alpha(color, 0.25 * clamp01(p))}, transparent)`, filter: "blur(6px)" }} /> : null}
    </span>
  );
}
