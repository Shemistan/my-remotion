// Акцент на элементе: удар и дыхание удержания одной кривой (accentPulse) — масштаб,
// свечение по контуру цели, мягкий ореол <Halo> за ней и кольцо, расходящееся от
// неё. Заменяет ручные рецепты glow (`box-shadow`, `radial-gradient` вокруг блока).
// <Halo> — отдельный ореол: равные поля со всех сторон, гауссов спад до прозрачного края.
import type { Beat, HoldMode, StyleBible } from "@ms/contracts";
import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { type AccentPulse, type AccentPulseOptions, accentPulse } from "../choreo/accent.js";
import { clamp01 } from "../internal.js";
import { type Hold, type HoldFrame, holdTiming } from "../choreo/hold.js";
import { markHold } from "../layout-probe.js";
import { useHoldQuiet } from "./HoldLayers.js";
import { useStyle } from "../style.js";
import { accent, alpha, isDark, mix, radius as radiusOf } from "../tokens.js";

/** Акцент в текущем кадре (хук): то же, что accentPulse(frame, style, opts). */
export function useAccentPulse(beat: Pick<Beat, "start_frame" | "end_frame">, opts: Omit<AccentPulseOptions, "beat"> = {}): AccentPulse {
  const s = useStyle();
  const frame = useCurrentFrame();
  return accentPulse(frame, s, { ...opts, beat });
}

const len = (v: number | string) => (typeof v === "number" ? `${v}px` : v);

/**
 * Гауссов спад ореола (доля радиуса %, доля непрозрачности): плотный центр, долгий мягкий хвост, к краю блока — ровно 0
 * (`closest-side`: на кромке блока цвета нет, жёсткой плашки не бывает).
 */
export const HALO_FALLOFF: readonly (readonly [number, number])[] = [[0, 1], [18, 0.84], [38, 0.55], [58, 0.26], [76, 0.09], [90, 0.02], [100, 0]];

/** CSS-ореол: радиальный градиент по HALO_FALLOFF до прозрачного края блока. */
export function falloff(color: string, a: number): string {
  return `radial-gradient(closest-side, ${HALO_FALLOFF.map(([at, k]) => `${alpha(color, a * k)} ${at}%`).join(", ")})`;
}

export interface HaloProps {
  /** Сила 0..1 (например `useAccentPulse(...).level`); по умолчанию 1. */
  level?: number;
  color?: string;
  /** Индекс акцента, если `color` не задан. */
  accentIndex?: number;
  /** Поля ореола за блок цели — равные со всех сторон: px или CSS-длина (по умолчанию "0.6em"). */
  spread?: number | string;
  style?: CSSProperties;
}

/**
 * Мягкий ореол за элементом: кладётся первым ребёнком в блок цели с `position: relative`
 * и `isolation: isolate` (так делает <Emphasis>). Центр — центр блока; два слоя —
 * плотное ядро по размеру блока и широкое свечение на `spread` за его край.
 */
export function Halo({ level = 1, color, accentIndex = 0, spread = "0.6em", style }: HaloProps) {
  const s = useStyle();
  const dark = isDark(s);
  const col = color ?? accent(s, accentIndex);
  const k = clamp01(level);
  if (k <= 0) return null;
  const a = dark ? 0.6 : 0.34;
  const sp = len(spread);
  const layer: CSSProperties = { position: "absolute", pointerEvents: "none", zIndex: -1 };
  return (
    <span aria-hidden style={{ ...layer, inset: 0, opacity: Number(k.toFixed(4)), ...style }}>
      <span style={{ ...layer, inset: `calc(${sp} * -1)`, background: falloff(col, a) }} />
      <span style={{ ...layer, inset: 0, background: falloff(mix(col, "#ffffff", dark ? 0.2 : 0), a * 0.9) }} />
    </span>
  );
}

export interface EmphasisProps {
  /** Окно акцента: удар в `start_frame`, удержание до `end_frame`. */
  beat: Pick<Beat, "start_frame" | "end_frame">;
  /** Дышать до конца сцены (по умолчанию да); `false` — акцент гаснет после бита. */
  loop?: boolean;
  children?: ReactNode;
  accentIndex?: number;
  color?: string;
  /** Ореол за целью (по умолчанию да). */
  halo?: boolean;
  /**
   * Кольцо, расходящееся от цели: `"strike"` (по умолчанию, и `true`) — один раз на ударе,
   * удержание дышит только свечением и масштабом; `"every-breath"` — ещё и на каждом вдохе
   * (радар «живого сейчас»; вокруг слова или числа читается как мигающий бейдж); `false` — нет.
   */
  ring?: boolean | "strike" | "every-breath";
  /** Скругление кольца: pill — капсула (по умолчанию), rounded — карточка, circle — круг. */
  shape?: "pill" | "rounded" | "circle";
  /** `rounded`: радиус углов цели, px (по умолчанию — радиус карточки стиля); кольцо идёт концентрично. */
  radius?: number;
  /** Поля ореола за блок цели (см. Halo); em — от кегля самого Emphasis (наследуется). */
  spread?: number | string;
  /** Размах масштаба (по умолчанию 1). */
  strength?: number;
  /** inline-block (по умолчанию — для слова, числа, плашки) или block. */
  display?: "inline-block" | "block";
  style?: CSSProperties;
  /**
   * Финал (hold engine 0.5.0) у героя без своего примитива (число, вывод): дыхание ореола
   * держится до последнего кадра; `now-pulse` — ещё мягкая волна света от цели (без рамки),
   * `repeat-result` / `data-shimmer` — вспышка ореола в такт тикам / бликам.
   */
  hold?: Hold;
}

/** Рисовать ли кольцо акцента в этом кадре при настройке `ring`. */
export function emphasisRingVisible(ring: EmphasisProps["ring"], p: AccentPulse): boolean {
  if (ring === false || p.ripple < 0) return false;
  return ring === "every-breath" || !p.rippleBreath;
}

/**
 * Скругление кольца, отошедшего от кромки цели на `offset` px: у `rounded` — радиус цели
 * плюс отступ (концентрично углам карточки, без острых углов), у `pill` и `circle` — свои.
 */
export function emphasisRingRadius(shape: NonNullable<EmphasisProps["shape"]>, s: StyleBible, offset: number, target?: number): number | string {
  if (shape === "circle") return "50%";
  if (shape === "pill") return 999;
  return (target ?? radiusOf(s, 2)) + offset;
}

/**
 * CSS-фильтр цели Emphasis (чистая функция): одно широкое мягкое свечение за глифами
 * (радиус ≥ 0.3 em, у кромки букв α ≤ 0.32) и вспышка яркости на ударе. Плотной кромки
 * у контура больше нет: она заливала просветы букв и размывала слово («релиза»,
 * «Одна мысль»); основной свет удержания несёт <Halo> за блоком. undefined — в покое.
 */
export function emphasisFilter(p: AccentPulse, col: string, dark: boolean): string | undefined {
  if (p.level <= 0.005) return undefined;
  return [
    `drop-shadow(0 0 ${(0.3 + 0.5 * p.level).toFixed(3)}em ${alpha(col, (dark ? 0.32 : 0.18) * p.level)})`,
    `brightness(${(1 + 0.18 * p.strike + (dark ? 0.06 : 0.03) * p.hold * (p.level - 0.5)).toFixed(4)})`,
  ].join(" ");
}

/**
 * Сила ореола Emphasis: дыхание удержания вокруг середины 0.66 шире, чем у свечения
 * (× 1.4) — свет удержания живёт в ореоле за блоком, а не в кромке у букв.
 */
export function haloLevel(p: AccentPulse): number {
  return Math.max(0, Math.min(1, p.level <= 0.005 ? 0 : 0.66 + (p.level - 0.66) * 1.4));
}

/**
 * Акцент в удержании (0.5.0): дыхание финала поверх акцента — ореол 0.62 ± 0.24 × дыхание;
 * `flare` 1 — вспышка в пик дыхания (тик, приход блика). Удар бита сохраняется.
 * Передача — смешением по `live` (0.5.2): на входе в удержание (live 0) акцент ровно свой,
 * к live 1 — дыхание финала; ни кадра провала или вспышки ореола (S3-fix C1).
 */
export function holdAccent(p: AccentPulse, live: number, breath: number, flare = 0): AccentPulse {
  const k = clamp01(live);
  const peak = flare * Math.max(0, breath) ** 4;
  const target = Math.min(1, 0.62 + 0.24 * breath + 0.3 * peak);
  const mixK = (a: number, b: number) => (1 - k) * a + k * b;
  const scaleTarget = Math.max(p.scale, 1 + 0.01 * (0.5 + 0.5 * breath));
  return {
    ...p,
    level: Math.max(p.strike, mixK(p.level, target)),
    hold: Math.max(p.hold, k),
    swell: mixK(p.swell, breath),
    scale: mixK(p.scale, scaleTarget),
    // кольцо удара бита доигрывает; кольцо вдоха акцента гаснет с набором дыхания финала
    rippleAlpha: p.rippleBreath ? p.rippleAlpha * (1 - k) : p.rippleAlpha,
  };
}

/**
 * Акцент Emphasis в кадре удержания `hf` (чистая функция): передача от своего акцента к
 * дыханию финала идёт вдвое дольше набора живости (2 × `holdTiming.live`, smoothstep) —
 * две волны разного периода сходятся без рывка; вспышка ореола в такт тикам и бликам у
 * repeat-result / data-shimmer / steady-flow.
 */
export function emphasisHold(p: AccentPulse, hf: HoldFrame | null, mode: HoldMode | undefined, s: StyleBible): AccentPulse {
  if (!hf?.on || !mode) return p;
  const u = clamp01(hf.local / Math.max(1, 2 * holdTiming(s).live));
  return holdAccent(p, u * u * (3 - 2 * u), hf.breath, mode === "now-pulse" || mode === "settle-push" ? 0 : 1);
}

/**
 * Акцент на цели: короткий удар масштаба, вспышка свечения и одно кольцо в начале бита,
 * затем спокойное дыхание свечением и масштабом (без кольца), пока идёт бит —
 * и до конца сцены при `loop`. Один акцент в момент: не ставь два Emphasis с
 * перекрывающимися битами.
 */
export function Emphasis({ beat, loop = true, children, accentIndex = 0, color, halo = true, ring = "strike", shape = "pill", radius, spread, strength, display = "inline-block", style, hold }: EmphasisProps) {
  const s = useStyle();
  const dark = isDark(s);
  const col = color ?? accent(s, accentIndex);
  const base = useAccentPulse(beat, { loop, strength });
  const hf = useHoldQuiet(hold);
  const p = emphasisHold(base, hf, hold?.mode, s);
  const wave = hf?.on && hold!.mode === "now-pulse" && hf.ripple >= 0 ? hf.ripple : -1;
  // проба QA (S3-fix2): Emphasis ведёт финал только волной now-pulse; ореол в такт тикам и
  // бликам — акцент, не движение режима (его носитель — граф, график, гонка)
  if (hf?.on && hold!.mode === "now-pulse") markHold("now-pulse");
  // кольцо: отходит от кромки цели на 4 → 30 px с торможением и гаснет
  const rp = p.ripple >= 0 ? 1 - (1 - p.ripple) ** 3 : 0;
  const offset = Number((4 + 26 * rp).toFixed(3));
  // свечение — широкое и мягкое за глифами, свет удержания несёт Halo за блоком
  const filter = emphasisFilter(p, col, dark);
  return (
    // data-ms-accent (0.5.6): сила акцента для пробы QA — accent_conflict по данным, не догадкой
    <span data-ms-accent={p.level > 0.005 ? p.level.toFixed(2) : undefined} style={{ position: "relative", display, isolation: "isolate", transform: p.scale === 1 ? undefined : `scale(${p.scale.toFixed(5)})`, transformOrigin: "50% 50%", ...style }}>
      {halo ? <Halo level={haloLevel(p)} color={col} spread={spread} /> : null}
      {wave >= 0 ? (
        // волна света now-pulse: ореол расходится от цели и гаснет — без рамки вокруг слова
        <span aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, transform: `scale(${(1 + 0.7 * (1 - (1 - wave) ** 3)).toFixed(4)})`, opacity: Number((0.75 * (1 - wave) ** 1.6 * hf!.rippleAlpha).toFixed(4)), pointerEvents: "none" }}>
          <Halo level={1} color={col} spread={spread} />
        </span>
      ) : null}
      {emphasisRingVisible(ring, p) ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: -offset,
            borderRadius: emphasisRingRadius(shape, s, offset, radius),
            border: `2px solid ${alpha(col, 0.75 * (1 - p.ripple) * p.rippleAlpha)}`,
            boxShadow: `0 0 12px ${alpha(col, 0.35 * (1 - p.ripple) * p.rippleAlpha)}`,
            pointerEvents: "none",
          }}
        />
      ) : null}
      <span style={{ position: "relative", display, filter }}>{children}</span>
    </span>
  );
}
