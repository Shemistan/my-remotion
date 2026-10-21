// Фон сцены: базовый цвет палитры + атмосфера по пресету (световые пятна, неоновая
// сетка, бумага с точечной сеткой), виньетка и плёночное зерно. Всё движение — от кадра.
// Глубина стиля (depth) усиливает атмосферу и виньетку; при transparent фон не рисуется
// (прозрачный экспорт: на корне сцены не должно быть фона).
import type { Beat } from "@ms/contracts";
import { AbsoluteFill, Easing, random, useCurrentFrame, useVideoConfig } from "remotion";
import { ramp, useSvgId } from "../internal.js";
import { fpsFrames } from "../easing.js";
import { depthOf, fpsScaleOf } from "../style/resolve.js";
import { useStyle } from "../style.js";
import { accent, alpha, isDark, mix } from "../tokens.js";

export type BackgroundVariant = "aurora" | "spotlight" | "blueprint" | "grid" | "paper" | "solid";

export interface BackgroundProps {
  /** Окно появления атмосферы (пятна разгораются, сетка проявляется). Без бита — видна сразу. */
  beat?: Pick<Beat, "start_frame" | "end_frame">;
  /** По умолчанию — по пресету: dark-premium → aurora, light-clean → paper, tech-neon → grid. */
  variant?: BackgroundVariant;
  /** Плёночное зерно (по умолчанию да). */
  grain?: boolean;
  /**
   * Сид раскладки: где стоят пятна, их форма и порядок оттенков акцента. Передавай id
   * сцены — две сцены с одним пресетом не получат одну карту света.
   */
  seed?: string;
  /** Где герой (доли кадра 0..1): самое яркое пятно / прожектор / центр сетки — за ним. */
  focus?: { x: number; y: number };
}

/** Световое пятно фона: центр (доли кадра), размер (% кадра), сила, индекс акцента, фаза дрейфа. */
export interface BackgroundBlob {
  x: number;
  y: number;
  size: number;
  /** Растяжение по вертикали (эллипс). */
  aspect: number;
  alpha: number;
  accent: number;
  phase: number;
}

const c01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Раскладка трёх пятен по `seed` (чистая функция): первое — самое яркое (в `focus`, если
 * задан, иначе в случайной точке кадра), второе — по другую сторону от него, третье — у
 * верхнего или нижнего края. Оттенки акцента идут со сдвигом от seed.
 */
export function backgroundLayout(seed: string, focus?: { x: number; y: number }): BackgroundBlob[] {
  const r = (k: string) => random(`${seed}-${k}`);
  const hue = Math.floor(r("hue") * 3);
  const px = focus ? c01(focus.x) : 0.12 + 0.76 * r("px");
  const py = focus ? c01(focus.y) : 0.12 + 0.62 * r("py");
  const sx = c01(1 - px + (r("sx") - 0.5) * 0.35);
  const sy = c01(0.2 + 0.6 * (1 - py) + (r("sy") - 0.5) * 0.2);
  const tTop = py > 0.5;
  const tx = c01(0.15 + 0.7 * r("tx"));
  const ty = tTop ? 0.04 + 0.08 * r("ty") : 0.88 + 0.08 * r("ty");
  const pos: [number, number][] = [[px, py], [sx, sy], [tx, ty]];
  return pos.map(([x, y], i) => ({
    x,
    y,
    size: [58, 48, 64][i]! + 14 * r(`size-${i}`),
    aspect: 0.8 + 0.5 * r(`asp-${i}`),
    alpha: [1, 0.68, 0.5][i]!,
    accent: (hue + i) % 3,
    phase: r(`ph-${i}`) * Math.PI * 2,
  }));
}

/**
 * Доля проявления атмосферы: с первого кадра видно 40 % (сцена не открывается чёрным),
 * к концу бита — вся. Без бита — сразу 1.
 */
export function backgroundReveal(frame: number, beat?: Pick<Beat, "start_frame" | "end_frame">): number {
  if (!beat) return 1;
  return 0.4 + 0.6 * ramp(frame, beat.start_frame, beat.end_frame, Easing.bezier(0.25, 1, 0.5, 1));
}

const DEFAULT_VARIANT: Record<string, BackgroundVariant> = {
  "dark-premium": "aurora",
  "light-clean": "paper",
  "tech-neon": "grid",
};

export function Background({ beat, variant, grain = true, seed = "bg", focus }: BackgroundProps) {
  const s = useStyle();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const dark = isDark(s);
  const v = variant ?? DEFAULT_VARIANT[s.id] ?? (dark ? "aurora" : "paper");
  const t = frame / fps;
  const reveal = backgroundReveal(frame, beat);
  const noiseId = useSvgId("ms-grain");
  // глубина: 0 — почти плоский фон, 1 — как задумано, 2–3 — плотнее свет и виньетка
  const depth = depthOf(s);
  const air = [0.45, 1, 1.25, 1.5][depth]!;
  const vig = [0.4, 1, 1.2, 1.4][depth]!;

  // три световых пятна по раскладке seed / focus: медленный дрейф по синусоидам
  const layout = backgroundLayout(seed, focus);
  const blobs = layout.map((b) => {
    const x = (b.x + Math.sin(t * 0.35 + b.phase) * 0.05) * 100;
    const y = (b.y + Math.cos(t * 0.28 + b.phase) * 0.05) * 100;
    const size = b.size * (0.85 + 0.15 * reveal);
    const a = (dark ? 0.27 : 0.12) * b.alpha * reveal * air;
    const col = accent(s, b.accent);
    return `radial-gradient(${size.toFixed(2)}% ${(size * b.aspect).toFixed(2)}% at ${x.toFixed(2)}% ${y.toFixed(2)}%, ${alpha(col, a)} 0%, ${alpha(col, 0)} 70%)`;
  });
  const hero = layout[0]!;
  const heroCol = accent(s, hero.accent);
  const fx = (hero.x * 100).toFixed(2);
  const fy = (hero.y * 100).toFixed(2);
  const cell = 72;
  // скорости заданы для 30 fps: на другом fps сетка едет с той же скоростью в секунду
  const gridShift = ((frame * 1.6) / fpsScaleOf(s)) % cell;
  const grainStep = fpsFrames(s, 2);

  if (s.transparent) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: s.palette.bg, overflow: "hidden" }}>
      {v === "aurora" ? <AbsoluteFill style={{ background: blobs.join(", ") }} /> : null}

      {v === "spotlight" ? (
        // прожектор за героем: один широкий мягкий свет и слабый встречный, пол чуть светлее
        <>
          <AbsoluteFill
            style={{
              background: [
                `radial-gradient(${(46 + 6 * reveal).toFixed(2)}% ${(52 + 6 * reveal).toFixed(2)}% at ${fx}% ${fy}%, ${alpha(heroCol, (dark ? 0.3 : 0.14) * reveal * air)} 0%, ${alpha(heroCol, (dark ? 0.1 : 0.05) * reveal * air)} 45%, ${alpha(heroCol, 0)} 75%)`,
                blobs[2]!,
                `linear-gradient(180deg, transparent 55%, ${alpha(s.palette.text, dark ? 0.035 : 0.03)} 100%)`,
              ].join(", "),
            }}
          />
        </>
      ) : null}

      {v === "blueprint" ? (
        // чертёж для схем: плоская сетка (мелкий и крупный шаг) проявляется вокруг героя
        <>
          <AbsoluteFill style={{ background: `radial-gradient(50% 55% at ${fx}% ${fy}%, ${alpha(heroCol, (dark ? 0.2 : 0.1) * reveal * air)} 0%, ${alpha(heroCol, 0)} 70%), ${blobs[1]!}` }} />
          <AbsoluteFill
            style={{
              backgroundImage: [
                `linear-gradient(${alpha(s.palette.text, (dark ? 0.07 : 0.08) * reveal)} 1px, transparent 1px)`,
                `linear-gradient(90deg, ${alpha(s.palette.text, (dark ? 0.07 : 0.08) * reveal)} 1px, transparent 1px)`,
                `linear-gradient(${alpha(s.palette.text, (dark ? 0.03 : 0.035) * reveal)} 1px, transparent 1px)`,
                `linear-gradient(90deg, ${alpha(s.palette.text, (dark ? 0.03 : 0.035) * reveal)} 1px, transparent 1px)`,
              ].join(", "),
              backgroundSize: `${cell * 2}px ${cell * 2}px, ${cell * 2}px ${cell * 2}px, ${cell / 2}px ${cell / 2}px, ${cell / 2}px ${cell / 2}px`,
              backgroundPosition: `${(t * 3).toFixed(2)}px 0px`,
              maskImage: `radial-gradient(ellipse 70% 75% at ${fx}% ${fy}%, black 20%, transparent 90%)`,
              WebkitMaskImage: `radial-gradient(ellipse 70% 75% at ${fx}% ${fy}%, black 20%, transparent 90%)`,
            }}
          />
        </>
      ) : null}

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
              background: `radial-gradient(60% 45% at 50% 62%, ${alpha(heroCol, 0.22 * reveal * air)} 0%, transparent 70%), radial-gradient(40% 30% at 85% 15%, ${alpha(accent(s, 1), 0.14 * reveal * air)} 0%, transparent 70%)`,
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
            {/* зерно меняется раз в 2 кадра (при 30 fps): живое, но без мерцания */}
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={Math.floor(frame / grainStep) % 97} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#${noiseId})`} />
        </svg>
      ) : null}
    </AbsoluteFill>
  );
}
