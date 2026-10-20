import { z } from "zod";
import { FpsSchema } from "./time.js";
import { StylePresetSchema } from "./settings.js";

const Fraction = z.number().min(0).max(1);
const Frame = z.number().int().nonnegative();

/** Переопределения палитры StyleBible: фиксированные необязательные ключи. */
export const PaletteOverridesSchema = z.object({
  bg: z.string(), surface: z.string(), text: z.string(), muted: z.string(),
  accent: z.array(z.string()).min(1), positive: z.string(), negative: z.string(),
}).partial().strict();

export const ElementSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["text", "number", "chart", "graph", "card", "shape", "group"]),
  role: z.string().min(1),
  /** Вид входа (motion-kit enterStyle / <Enter>): type, count, draw анимирует сам компонент. */
  entrance: z.enum(["rise", "fade", "scale", "slide", "mask", "blur", "pop", "type", "draw", "count", "none"]),
  /** Слой параллакса: 0 — дальний (как камера), 2 — ближний. */
  depth_layer: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  content: z.record(z.unknown()),
  layout: z.object({ x: Fraction, y: Fraction, w: Fraction, h: Fraction }).strict()
    .refine((l) => l.x + l.w <= 1 + 1e-9 && l.y + l.h <= 1 + 1e-9, "layout выходит за кадр (x+w<=1, y+h<=1)")
    .optional(),
}).strict();
export type Element = z.infer<typeof ElementSchema>;

export const BeatSchema = z.object({
  id: z.string().min(1),
  start_frame: Frame,
  end_frame: Frame,
  action: z.string().min(1),
  description: z.string(),
  element_ids: z.array(z.string().min(1)),
}).strict();
export type Beat = z.infer<typeof BeatSchema>;

/**
 * Композиционная идея сцены (Motion Director): архетип раскладки, фокус/движение камеры,
 * как сцена переходит из состояния в состояние. Пишется в spec.json для Engineer.
 */
export const CompositionSchema = z.object({
  archetype: z.enum(["centered-hero", "split", "diagonal", "full-bleed-data", "network-centric", "stacked", "orbit", "other"]),
  idea: z.string().min(1),
  focus: z.string(),
  transitions: z.string().min(1),
}).strict();
export type Composition = z.infer<typeof CompositionSchema>;

/** Ключ камеры: наезд `scale` (1 — без масштаба) и точка интереса `x, y` (px от центра кадра). */
export const CameraKeySchema = z.object({
  frame: Frame,
  scale: z.number().positive(),
  x: z.number(),
  y: z.number(),
}).strict();
export type CameraKey = z.infer<typeof CameraKeySchema>;

export const MotionSpecSchema = z.object({
  title: z.string().min(1),
  purpose: z.string(),
  duration_frames: z.number().int().positive(),
  fps: FpsSchema,
  style_preset: StylePresetSchema,
  palette_overrides: PaletteOverridesSchema.optional(),
  composition: CompositionSchema.optional(),
  elements: z.array(ElementSchema).min(1),
  beats: z.array(BeatSchema).min(1),
  /** Движение камеры по ключам; без поля камера стоит. */
  camera: z.array(CameraKeySchema).optional(),
}).strict().superRefine((spec, ctx) => {
  const ids = new Set<string>();
  spec.elements.forEach((e, i) => {
    if (ids.has(e.id)) ctx.addIssue({ code: "custom", path: ["elements", i, "id"], message: `дубль id элемента: ${e.id}` });
    ids.add(e.id);
  });
  const beatIds = new Set<string>();
  spec.beats.forEach((b, i) => {
    if (beatIds.has(b.id)) ctx.addIssue({ code: "custom", path: ["beats", i, "id"], message: `дубль id бита: ${b.id}` });
    beatIds.add(b.id);
    if (b.end_frame <= b.start_frame) {
      ctx.addIssue({ code: "custom", path: ["beats", i, "end_frame"], message: "end_frame должен быть больше start_frame" });
    }
    if (b.end_frame > spec.duration_frames) {
      ctx.addIssue({ code: "custom", path: ["beats", i, "end_frame"], message: `бит выходит за duration_frames (${spec.duration_frames})` });
    }
    b.element_ids.forEach((id, j) => {
      if (!ids.has(id)) ctx.addIssue({ code: "custom", path: ["beats", i, "element_ids", j], message: `неизвестный элемент: ${id}` });
    });
  });
  spec.camera?.forEach((k, i) => {
    if (k.frame > spec.duration_frames) {
      ctx.addIssue({ code: "custom", path: ["camera", i, "frame"], message: `ключ камеры за duration_frames (${spec.duration_frames})` });
    }
  });
});
export type MotionSpec = z.infer<typeof MotionSpecSchema>;
