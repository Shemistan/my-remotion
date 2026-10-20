import { z } from "zod";
import { BeatSchema, PaletteOverridesSchema } from "./motion-spec.js";
import { IntensitySchema, StylePresetSchema } from "./settings.js";

/** Стиль сцены в `props.json`: единственный источник интенсивности и глубины для кода сцены. */
export const ScenePropsStyleSchema = z.object({
  preset: StylePresetSchema,
  palette_overrides: PaletteOverridesSchema.optional(),
  intensity: IntensitySchema,
  depth: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(1),
  transparent: z.boolean(),
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
