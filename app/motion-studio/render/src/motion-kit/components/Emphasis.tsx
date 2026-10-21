// Акцент на элементе: удар и дыхание удержания одной кривой (accentPulse) — масштаб,
// свечение по контуру цели, мягкий ореол <Halo> за ней и кольцо, расходящееся от
// неё. Заменяет ручные рецепты glow (`box-shadow`, `radial-gradient` вокруг блока).
// <Halo> — отдельный ореол: равные поля со всех сторон, гауссов спад до прозрачного края.
import type { Beat, StyleBible } from "@ms/contracts";
import type { CSSProperties, ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { type AccentPulse, type AccentPulseOptions, accentPulse } from "../choreo/accent.js";
import { clamp01 } from "../internal.js";
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
 * Акцент на цели: короткий удар масштаба, вспышка свечения и одно кольцо в начале бита,
 * затем спокойное дыхание свечением и масштабом (без кольца), пока идёт бит —
 * и до конца сцены при `loop`. Один акцент в момент: не ставь два Emphasis с
 * перекрывающимися битами.
 */
export function Emphasis({ beat, loop = true, children, accentIndex = 0, color, halo = true, ring = "strike", shape = "pill", radius, spread, strength, display = "inline-block", style }: EmphasisProps) {
  const s = useStyle();
  const dark = isDark(s);
  const col = color ?? accent(s, accentIndex);
  const p = useAccentPulse(beat, { loop, strength });
  const glow = p.level > 0.005;
  // кольцо: отходит от кромки цели на 4 → 30 px с торможением и гаснет
  const rp = p.ripple >= 0 ? 1 - (1 - p.ripple) ** 3 : 0;
  const offset = Number((4 + 26 * rp).toFixed(3));
  // свечение по контуру: плотная кромка и широкий мягкий шлейф — оба дышат с level;
  // на тёмном фоне шлейф — главный носитель «живого» удержания, на светлом он тише
  const filter = glow
    ? [
        `drop-shadow(0 0 ${(0.05 + 0.12 * p.level).toFixed(3)}em ${alpha(col, (dark ? 0.8 : 0.45) * p.level)})`,
        // шлейф уже и тише, чем в 0.2: широкий смазывал подпись рядом с числом («24 релиза»)
        `drop-shadow(0 0 ${(0.16 + 0.34 * p.level).toFixed(3)}em ${alpha(col, (dark ? 0.42 : 0.2) * p.level)})`,
        `brightness(${(1 + 0.18 * p.strike + (dark ? 0.06 : 0.03) * p.hold * (p.level - 0.5)).toFixed(4)})`,
      ].join(" ")
    : undefined;
  return (
    <span style={{ position: "relative", display, isolation: "isolate", transform: p.scale === 1 ? undefined : `scale(${p.scale.toFixed(5)})`, transformOrigin: "50% 50%", ...style }}>
      {halo ? <Halo level={p.level} color={col} spread={spread} /> : null}
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
