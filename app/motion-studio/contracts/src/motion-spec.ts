import { z } from "zod";
import { FpsSchema } from "./time.js";
import { StylePresetSchema } from "./settings.js";

const Fraction = z.number().min(0).max(1);
const Frame = z.number().int().nonnegative();

export const ElementSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["text", "number", "chart", "graph", "card", "shape", "group"]),
  role: z.string().min(1),
  entrance: z.enum(["rise", "fade", "scale", "slide", "draw", "count", "none"]),
  content: z.record(z.unknown()),
  layout: z.object({ x: Fraction, y: Fraction, w: Fraction, h: Fraction }).strict().optional(),
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

export const MotionSpecSchema = z.object({
  title: z.string().min(1),
  purpose: z.string(),
  duration_frames: z.number().int().positive(),
  fps: FpsSchema,
  style_preset: StylePresetSchema,
  palette_overrides: z.record(z.string()).optional(),
  elements: z.array(ElementSchema).min(1),
  beats: z.array(BeatSchema).min(1),
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
});
export type MotionSpec = z.infer<typeof MotionSpecSchema>;
