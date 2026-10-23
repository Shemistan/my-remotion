import { z } from "zod";
import { BeatSchema, PaletteOverridesSchema } from "./motion-spec.js";
import { IntensitySchema, SafeAreaSchema, StylePresetSchema } from "./settings.js";

/** Стиль сцены в `props.json`: единственный источник интенсивности и глубины для кода сцены. */
export const ScenePropsStyleSchema = z.object({
  preset: StylePresetSchema,
  palette_overrides: PaletteOverridesSchema.optional(),
  intensity: IntensitySchema,
  depth: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(1),
  transparent: z.boolean(),
  /** Поля кадра из `settings.safe_area` (без поля — поля пресета). */
  safe_area: SafeAreaSchema.optional(),
  /** Шрифт из `settings.font` (только шрифты motion-kit). */
  font: z.string().min(1).optional(),
}).strict();
export type ScenePropsStyle = z.infer<typeof ScenePropsStyleSchema>;

export const SceneTimingSchema = z.object({
  duration_frames: z.number().int().positive(),
  beats: z.array(BeatSchema.pick({ id: true, start_frame: true, end_frame: true })),
}).strict().superRefine((t, ctx) => {
  t.beats.forEach((b, i) => {
    if (b.end_frame <= b.start_frame) ctx.addIssue({ code: "custom", path: ["beats", i, "end_frame"], message: "end_frame должен быть больше start_frame" });
    if (b.end_frame > t.duration_frames) ctx.addIssue({ code: "custom", path: ["beats", i, "end_frame"], message: `бит выходит за duration_frames (${t.duration_frames})` });
  });
});
export type SceneTiming = z.infer<typeof SceneTimingSchema>;

/**
 * Общая часть `props.json` сцены: тайминги битов и стиль сцена берёт отсюда, иначе
 * правки «медленнее», «палитра из v1», «объёмнее» невозможны без переписывания кода.
 */
export const ScenePropsBaseSchema = z.object({
  timing: SceneTimingSchema,
  style: ScenePropsStyleSchema,
  content: z.record(z.unknown()),
}).strict();
export type ScenePropsBase = z.infer<typeof ScenePropsBaseSchema>;

/**
 * Масштабирует тайминги: границы битов округляются, бит не короче кадра, бит, кончавшийся
 * на старой длительности, кончается ровно на новой. Вход не меняется.
 */
export function scaleTiming<T extends { duration_frames: number; beats: { start_frame: number; end_frame: number }[] }>(t: T, factor: number): T {
  if (!Number.isFinite(factor) || factor <= 0) throw new RangeError(`scaleTiming: коэффициент должен быть > 0: ${factor}`);
  const duration = Math.max(1, Math.round(t.duration_frames * factor));
  const beats = t.beats.map((b) => {
    const start = Math.min(Math.round(b.start_frame * factor), duration - 1);
    const end = b.end_frame >= t.duration_frames ? duration : Math.min(Math.max(Math.round(b.end_frame * factor), start + 1), duration);
    return { ...b, start_frame: start, end_frame: end };
  });
  return { ...t, duration_frames: duration, beats };
}

/**
 * Договор кадровых величин `props.content` (Engineer ↔ правка темпа): поле — длительность или
 * момент в кадрах, если его имя из `CONTENT_FRAME_KEYS` (`travel` импульса, `delay`, `stagger`,
 * `hold`, `frame` ключа камеры) или кончается на `_frames`/`Frames`/`_frame`/`Frame`
 * (`fan_stagger_frames`, `start_frame`). «Медленнее на N %» масштабирует ровно их — вместе с
 * битами; прочие числа content (индексы, размеры, доли раскладки) не трогаются.
 */
export const CONTENT_FRAME_KEYS = ["travel", "delay", "stagger", "hold", "frame"] as const;
const FRAME_SUFFIX = /(_frames|Frames|_frame|Frame)$/;

export function isContentFrameKey(key: string): boolean {
  return (CONTENT_FRAME_KEYS as readonly string[]).includes(key) || FRAME_SUFFIX.test(key);
}

/**
 * Масштаб кадровых величин content (договор `isContentFrameKey`): целые округляются, длительность
 * > 0 остаётся ≥ 1 кадра, дробные умножаются как есть; массив чисел под таким ключом — поэлементно.
 * Вход не меняется; `scaled` — пути изменённых полей.
 */
export function scaleContentFrames<T>(content: T, factor: number): { content: T; scaled: string[] } {
  if (!Number.isFinite(factor) || factor <= 0) throw new RangeError(`scaleContentFrames: коэффициент должен быть > 0: ${factor}`);
  const scaled: string[] = [];
  const num = (v: number, path: string): number => {
    const r = Number.isInteger(v) ? (v > 0 ? Math.max(1, Math.round(v * factor)) : Math.round(v * factor)) : v * factor;
    if (r !== v) scaled.push(path);
    return r;
  };
  const walk = (v: unknown, path: string, frameKey: boolean): unknown => {
    if (typeof v === "number") return frameKey && Number.isFinite(v) ? num(v, path) : v;
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`, frameKey && typeof x === "number"));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, `${path}.${k}`, isContentFrameKey(k))]));
    return v;
  };
  return { content: walk(content, "content", false) as T, scaled };
}
