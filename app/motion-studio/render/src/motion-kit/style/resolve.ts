// Разрешённый стиль сцены: пресет + правки палитры и шрифта + интенсивность + глубина +
// fps. Код сцены и компоненты kit читают только его (useStyle()): «медленнее»,
// «палитра из v1», «объёмнее» — это другой вход resolveStyle, а не правка кода.
import type { Fps, StyleBible } from "@ms/contracts";
import { type PresetId, presets } from "../presets.js";
import { type Intensity, intensityScale } from "./intensity.js";

export type Depth = 0 | 1 | 2 | 3;
export type PaletteOverrides = Partial<StyleBible["palette"]>;

/**
 * StyleBible с кадрами под fps и интенсивность сцены, плюс амплитуда, глубина и прозрачность.
 * `fpsScale` = fps / 30: им frames() пересчитывает свои константы компонентов.
 */
export type ResolvedStyle = StyleBible & { amplitude: number; depth: Depth; transparent: boolean; fpsScale: number };

export interface ResolveStyleInput {
  /** Id пресета или свой StyleBible. */
  preset: PresetId | StyleBible;
  palette_overrides?: PaletteOverrides;
  /** Семейство шрифта заголовков и текста (только шрифты kit). */
  font?: string;
  intensity: Intensity;
  /** 0 — плоско, 1 — как задумано пресетом, 2–3 — объёмнее (тени, перспектива, атмосфера). */
  depth?: Depth;
  /** Прозрачный экспорт: фон сцены не рисуется. */
  transparent?: boolean;
  /** Безопасная зона из настроек сцены (доли кадра); по умолчанию — из пресета. */
  safe_area?: { x: number; y: number };
  /** По умолчанию 30/1: кадровые токены пресетов заданы для 30 fps. */
  fps?: Fps;
}

/** Загруженные начертания шрифтов kit (fonts.ts): у font выбирается ближайшее. */
const KIT_WEIGHTS: Readonly<Record<string, readonly number[]>> = {
  Inter: [400, 500, 600, 700],
  Manrope: [600, 700, 800],
  "JetBrains Mono": [400, 500, 700],
};

const BASE_FPS = 30;

function nearestWeight(family: string, weight: number | undefined): number {
  const list = KIT_WEIGHTS[family]!;
  const want = weight ?? 400;
  return list.reduce((best, w) => (Math.abs(w - want) < Math.abs(best - want) ? w : best), list[0]!);
}

/**
 * Проверка palette_overrides по форме PaletteOverridesSchema (@ms/contracts): kit не тянет
 * zod в бандл сцены, поэтому правила повторены здесь; совпадение держит тест resolve.
 */
const PALETTE_KEYS = new Set(["bg", "surface", "text", "muted", "accent", "positive", "negative"]);

function checkPalette(o: unknown): PaletteOverrides {
  if (typeof o !== "object" || o === null || Array.isArray(o)) throw new RangeError("palette_overrides: ожидается объект");
  const problems: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (!PALETTE_KEYS.has(k)) problems.push(`неизвестный ключ ${k}`);
    else if (k === "accent") {
      if (!Array.isArray(v) || v.length === 0 || !v.every((c) => typeof c === "string")) problems.push("accent — непустой массив строк");
    } else if (typeof v !== "string") problems.push(`${k} — строка`);
  }
  if (problems.length > 0) throw new RangeError(`palette_overrides: ${problems.join("; ")}`);
  return o as PaletteOverrides;
}

function isPresetId(p: unknown): p is PresetId {
  return typeof p === "string" && Object.prototype.hasOwnProperty.call(presets, p);
}

export function resolveStyle(input: ResolveStyleInput): ResolvedStyle {
  const bible = typeof input.preset === "string" ? (isPresetId(input.preset) ? presets[input.preset] : undefined) : input.preset;
  if (!bible) throw new RangeError(`неизвестный пресет стиля: ${String(input.preset)}`);

  const palette = { ...bible.palette, accent: [...bible.palette.accent] };
  if (input.palette_overrides !== undefined) {
    const { accent, ...rest } = checkPalette(input.palette_overrides);
    Object.assign(palette, rest);
    accent?.forEach((c, i) => {
      palette.accent[i] = c;
    });
  }

  let typography = bible.typography;
  if (input.font !== undefined) {
    const family = input.font.trim();
    if (!KIT_WEIGHTS[family]) throw new RangeError(`шрифт ${input.font} не входит в motion-kit: ${Object.keys(KIT_WEIGHTS).join(", ")}`);
    typography = {
      ...bible.typography,
      display: { ...bible.typography.display, family, weight: nearestWeight(family, bible.typography.display.weight) },
      body: { ...bible.typography.body, family, weight: nearestWeight(family, bible.typography.body.weight) },
    };
  }

  const fps = input.fps ?? { num: BASE_FPS, den: 1 };
  if (!(fps.num > 0 && fps.den > 0)) throw new RangeError(`fps должен быть > 0: ${fps.num}/${fps.den}`);
  const fpsScale = fps.num / fps.den / BASE_FPS;
  const k = fpsScale * intensityScale(input.intensity).time;
  const m = bible.motion;
  const motion = {
    ...m,
    intensity: input.intensity,
    // вход и выход не короче кадра: иначе округление превращает движение в ступеньку
    enter_frames: Math.max(1, Math.round(m.enter_frames * k)),
    exit_frames: Math.max(1, Math.round(m.exit_frames * k)),
    stagger_frames: Math.max(0, Math.round(m.stagger_frames * k)),
  };

  return {
    ...bible,
    palette,
    typography,
    grid: input.safe_area ? { ...bible.grid, safe_area: { x: input.safe_area.x, y: input.safe_area.y } } : bible.grid,
    motion,
    amplitude: intensityScale(input.intensity).amplitude,
    depth: input.depth ?? 1,
    transparent: input.transparent ?? false,
    fpsScale,
  };
}

/** Уже разрешённый стиль (есть амплитуда и глубина) — не разрешать второй раз. */
export function isResolved(s: StyleBible): s is ResolvedStyle {
  const r = s as Partial<ResolvedStyle>;
  return typeof r.amplitude === "number" && typeof r.depth === "number" && typeof r.transparent === "boolean" && typeof r.fpsScale === "number";
}

/** Глубина стиля: у сырого StyleBible — 1 (как задумано пресетом). */
export const depthOf = (s: StyleBible): Depth => (isResolved(s) ? s.depth : 1);

/** fps / 30 стиля: у сырого StyleBible — 1. */
export const fpsScaleOf = (s: StyleBible): number => (isResolved(s) ? s.fpsScale : 1);
