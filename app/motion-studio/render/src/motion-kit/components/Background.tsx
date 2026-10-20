// Фон сцены: базовый цвет палитры + атмосфера по пресету (световые пятна, неоновая
// сетка, бумага с точечной сеткой), виньетка и плёночное зерно. Всё движение — от кадра.
// Глубина стиля (depth) усиливает атмосферу и виньетку; при transparent фон не рисуется
// (прозрачный экспорт: на корне сцены не должно быть фона).
import type { Beat } from "@ms/contracts";
import { AbsoluteFill, Easing, random, useCurrentFrame, useVideoConfig } from "remotion";
import { ramp, useSvgId } from "../internal.js";
import { depthOf } from "../style/resolve.js";
import { useStyle } from "../style.js";
import { accent, alpha, isDark, mix } from "../tokens.js";

export type BackgroundVariant = "aurora" | "grid" | "paper" | "solid";

export interface BackgroundProps {
  /** Окно появления атмосферы (пятна разгораются, сетка проявляется). Без бита — видна сразу. */
  beat?: Pick<Beat, "start_frame" | "end_frame">;
  /** По умолчанию — по пресету: dark-premium → aurora, light-clean → paper, tech-neon → grid. */
  variant?: BackgroundVariant;
  /** Плёночное зерно (по умолчанию да). */
  grain?: boolean;
  /** Сид разброса пятен — разные сцены с одним пресетом выглядят по-разному. */
  seed?: string;
}

const DEFAULT_VARIANT: Record<string, BackgroundVariant> = {
  "dark-premium": "aurora",
  "light-clean": "paper",
  "tech-neon": "grid",
};

export function Background({ beat, variant, grain = true, seed = "bg" }: BackgroundProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const dark = isDark(s);
  const v = variant ?? DEFAULT_VARIANT[s.id] ?? (dark ? "aurora" : "paper");
  const t = frame / fps;
  const reveal = beat
    ? ramp(frame, beat.start_frame, beat.end_frame, Easing.bezier(0.25, 1, 0.5, 1))
    : 1;
  const noiseId = useSvgId("ms-grain");
  // глубина: 0 — почти плоский фон, 1 — как задумано, 2–3 — плотнее свет и виньетка
  const depth = depthOf(s);
  const air = [0.45, 1, 1.25, 1.5][depth]!;
  const vig = [0.4, 1, 1.2, 1.4][depth]!;

  // три световых пятна: медленный дрейф по синусоидам с фазами из random(seed)
  const blobs = [0, 1, 2].map((i) => {
    const ph = random(`${seed}-${i}`) * Math.PI * 2;
    const bx = [0.18, 0.82, 0.62][i]!;
    const by = [0.22, 0.3, 0.92][i]!;
    const x = (bx + Math.sin(t * 0.35 + ph) * 0.05) * 100;
    const y = (by + Math.cos(t * 0.28 + ph) * 0.05) * 100;
    const size = [62, 55, 70][i]! * (0.85 + 0.15 * reveal);
    const a = (dark ? [0.26, 0.2, 0.14] : [0.12, 0.09, 0.07])[i]! * reveal * air;
    return `radial-gradient(${size}% ${size * 1.1}% at ${x.toFixed(2)}% ${y.toFixed(2)}%, ${alpha(accent(s, i), a)} 0%, ${alpha(accent(s, i), 0)} 70%)`;
  });

  const cell = 72;
  const gridShift = (frame * 1.6) % cell;

  if (s.transparent) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: s.palette.bg, overflow: "hidden" }}>
      {v === "aurora" ? <AbsoluteFill style={{ background: blobs.join(", ") }} /> : null}

      {v === "paper" ? (
        <>
          <AbsoluteFill style={{ background: `linear-gradient(180deg, ${mix(s.palette.bg, "#ffffff", 0.6)} 0%, ${s.palette.bg} 55%, ${mix(s.palette.bg, s.palette.text, 0.04)} 100%)` }} />
          <AbsoluteFill
            style={{
              backgroundImage: `radial-gradient(${alpha(s.palette.text, 0.13 * reveal)} 1.2px, transparent 1.6px)`,
              backgroundSize: "28px 28px",
              backgroundPosition: `${(t * 4).toFixed(2)}px 0px`,
              maskImage: "radial-gradient(ellipse 75% 70% at 50% 45%, black 25%, transparent 85%)",
            }}
          />
          <AbsoluteFill style={{ background: blobs.slice(0, 2).join(", ") }} />
        </>
      ) : null}

      {v === "grid" ? (
        <>
          <AbsoluteFill
            style={{
              background: `radial-gradient(60% 45% at 50% 62%, ${alpha(accent(s, 0), 0.22 * reveal * air)} 0%, transparent 70%), radial-gradient(40% 30% at 85% 15%, ${alpha(accent(s, 1), 0.14 * reveal * air)} 0%, transparent 70%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: -width * 0.5,
              width: width * 2,
              top: height * 0.6,
              height: height * 0.9,
              transformOrigin: "50% 0%",
              transform: "perspective(700px) rotateX(62deg)",
              backgroundImage: `linear-gradient(${alpha(accent(s, 0), 0.2)} 1.5px, transparent 1.5px), linear-gradient(90deg, ${alpha(accent(s, 0), 0.2)} 1.5px, transparent 1.5px)`,
              backgroundSize: `${cell}px ${cell}px`,
              backgroundPosition: `0px ${gridShift.toFixed(2)}px`,
              maskImage: "linear-gradient(180deg, transparent 0%, black 30%, black 60%, transparent 100%)",
              opacity: reveal,
            }}
          />
          <AbsoluteFill
            style={{
              backgroundImage: `linear-gradient(${alpha(s.palette.text, 0.03)} 1px, transparent 1px)`,
              backgroundSize: "100% 4px",
            }}
          />
        </>
      ) : null}

      {/* виньетка: края темнее (на светлой теме — мягче) */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 85% 80% at 50% 45%, transparent 55%, ${alpha(dark ? "#000000" : s.palette.text, (dark ? 0.55 : 0.06) * vig)} 100%)`,
        }}
      />

      {grain ? (
        <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity: dark ? 0.07 : 0.04, mixBlendMode: dark ? "screen" : "multiply" }}>
          <filter id={noiseId}>
            {/* зерно меняется раз в 2 кадра: живое, но без мерцания */}
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={Math.floor(frame / 2) % 97} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#${noiseId})`} />
        </svg>
      ) : null}
    </AbsoluteFill>
  );
}
