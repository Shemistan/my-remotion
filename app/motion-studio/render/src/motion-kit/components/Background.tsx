// Фон сцены: базовый цвет палитры + атмосфера по пресету (световые пятна, неоновая
// сетка, бумага с точечной сеткой), виньетка и плёночное зерно. Всё движение — от кадра.
// Глубина стиля (depth) усиливает атмосферу и виньетку; при transparent фон не рисуется
// (прозрачный экспорт: на корне сцены не должно быть фона).
import type { Beat } from "@ms/contracts";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import { useSvgId } from "../internal.js";
import { fpsFrames } from "../easing.js";
import { depthOf, fpsScaleOf } from "../style/resolve.js";
import { useStyle } from "../style.js";
import { accent, alpha, isDark, mix } from "../tokens.js";

/** Маска сетки blueprint: гаснет к краям кадра за 3 % ширины / высоты. */
const BLUEPRINT_EDGE_FADE = "linear-gradient(to right, transparent 0%, black 3%, black 97%, transparent 100%), linear-gradient(to bottom, transparent 0%, black 3%, black 97%, transparent 100%)";

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
 * Доля проявления атмосферы (0.4.0): 1 с кадра 0 — кадр 0 — постер сцены, фон в полную силу
 * (0.3: 70 % и разгорание за бит — первые кадры читались пустыми). `beat` оставлен для
 * совместимости и на яркость не влияет.
 */
export function backgroundReveal(...args: [frame: number, beat?: Pick<Beat, "start_frame" | "end_frame">]): number {
  void args;
  return 1;
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
  // blueprint: шаг и толщины — от высоты кадра (на 540p сетка не тоньше пикселя)
  const k = height / 1080;
  const major = cell * 2 * k;
  const cross = 9 * k;
  const lineCol = mix(heroCol, s.palette.text, 0.55);
  const gridId = useSvgId("ms-blueprint");
  // spotlight: свет — акцент, разбавленный белым (свет, а не цветное пятно); пол под героем
  const beam = mix(heroCol, "#ffffff", dark ? 0.45 : 0.2);
  const floorY = Math.min(97, hero.y * 100 + 24).toFixed(2);
  // скорости заданы для 30 fps: на другом fps сетка едет с той же скоростью в секунду
  const gridShift = ((frame * 1.6) / fpsScaleOf(s)) % cell;
  const grainStep = fpsFrames(s, 2);

  if (s.transparent) return null;

  return (
    <AbsoluteFill style={{ backgroundColor: s.palette.bg, overflow: "hidden" }}>
      {v === "aurora" ? <AbsoluteFill style={{ background: blobs.join(", ") }} /> : null}

      {v === "spotlight" ? (
        // сцена под прожектором: окружение темнее базы, луч сверху на героя, яркое пятно на
        // нём и световой «пол» под ним; без сетки — на 540p не спутать с blueprint
        <>
          <AbsoluteFill style={{ backgroundColor: alpha(dark ? "#000000" : s.palette.text, dark ? 0.32 : 0.05) }} />
          <AbsoluteFill
            style={{
              background: [
                `radial-gradient(${(24 + 4 * reveal).toFixed(2)}% 95% at ${fx}% -12%, ${alpha(beam, (dark ? 0.13 : 0.08) * reveal * air)} 0%, ${alpha(beam, 0)} 100%)`,
                `radial-gradient(${(34 + 6 * reveal).toFixed(2)}% ${(40 + 6 * reveal).toFixed(2)}% at ${fx}% ${fy}%, ${alpha(beam, (dark ? 0.34 : 0.16) * reveal * air)} 0%, ${alpha(heroCol, (dark ? 0.12 : 0.06) * reveal * air)} 50%, ${alpha(heroCol, 0)} 78%)`,
                `radial-gradient(36% 7% at ${fx}% ${floorY}%, ${alpha(beam, (dark ? 0.16 : 0.08) * reveal * air)} 0%, ${alpha(beam, 0)} 100%)`,
              ].join(", "),
            }}
          />
        </>
      ) : null}

      {v === "blueprint" ? (
        // чертёж для схем: ровный холодный тон, чёткая сетка (крупный шаг толще, кресты на
        // узлах) почти на весь кадр; свет — слабый и плоский, без пятна прожектора
        <>
          <AbsoluteFill style={{ background: `${alpha(heroCol, (dark ? 0.05 : 0.035) * reveal)}` }} />
          <AbsoluteFill style={{ background: `radial-gradient(70% 75% at ${fx}% ${fy}%, ${alpha(heroCol, (dark ? 0.09 : 0.05) * reveal * air)} 0%, ${alpha(heroCol, 0)} 80%)` }} />
          {/* у краёв кадра сетка гаснет: дрейф не кладёт линию и кресты на край (иначе
              край кадра читается как обрезанный объект) */}
          <AbsoluteFill style={{ maskImage: BLUEPRINT_EDGE_FADE, WebkitMaskImage: BLUEPRINT_EDGE_FADE, maskComposite: "intersect", WebkitMaskComposite: "source-in" }}>
          <svg
            width={width}
            height={height}
            style={{
              position: "absolute",
              inset: 0,
              opacity: reveal,
              maskImage: `radial-gradient(ellipse 95% 100% at ${fx}% ${fy}%, black 45%, transparent 100%)`,
              WebkitMaskImage: `radial-gradient(ellipse 95% 100% at ${fx}% ${fy}%, black 45%, transparent 100%)`,
            }}
          >
            <defs>
              <pattern id={gridId} width={major} height={major} patternUnits="userSpaceOnUse" patternTransform={`translate(${((t * 3) % major).toFixed(2)} 0)`}>
                {[1, 2, 3].map((i) => (
                  <path key={i} d={`M ${(i * major) / 4} 0 V ${major} M 0 ${(i * major) / 4} H ${major}`} stroke={alpha(lineCol, dark ? 0.06 : 0.07)} strokeWidth={k} fill="none" />
                ))}
                <path d={`M 0 0 V ${major} M 0 0 H ${major}`} stroke={alpha(lineCol, dark ? 0.13 : 0.15)} strokeWidth={2 * k} fill="none" />
                <path d={`M ${-cross} 0 H ${cross} M 0 ${-cross} V ${cross} M ${major - cross} 0 H ${major + cross} M 0 ${major - cross} V ${major + cross} M ${-cross} ${major} H ${cross} M ${major} ${-cross} V ${cross} M ${major - cross} ${major} H ${major + cross} M ${major} ${major - cross} V ${major + cross}`} stroke={alpha(lineCol, 0.3)} strokeWidth={2 * k} fill="none" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#${gridId})`} />
          </svg>
          </AbsoluteFill>
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
          background: `radial-gradient(ellipse 85% 80% at 50% 45%, transparent ${v === "spotlight" ? 40 : 55}%, ${alpha(dark ? "#000000" : s.palette.text, (dark ? 0.55 : 0.06) * vig * (v === "spotlight" ? 1.35 : 1))} 100%)`,
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
