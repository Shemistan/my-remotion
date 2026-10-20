import { z } from "zod";
import { FpsSchema } from "./time.js";

export const AspectRatioSchema = z.enum(["16:9", "9:16", "1:1"]);
export const StylePresetSchema = z.enum(["dark-premium", "light-clean", "tech-neon"]);
export const IntensitySchema = z.enum(["calm", "balanced", "energetic"]);

const Fraction = z.number().min(0).max(1);

/** Настройки сцены (ТЗ §6.4). safe_area — доли кадра. */
export const SettingsSchema = z.object({
  aspect_ratio: AspectRatioSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: FpsSchema,
  duration_frames: z.number().int().positive(),
  style_preset: StylePresetSchema,
  color_palette: z.array(z.string().min(1)).optional(),
  font: z.string().min(1).optional(),
  animation_intensity: IntensitySchema,
  background: z.string().min(1),
  transparent_export: z.boolean(),
  safe_area: z.object({ x: Fraction, y: Fraction }).strict(),
}).strict();
export type Settings = z.infer<typeof SettingsSchema>;

export function defaultSettings(): Settings {
  return {
    aspect_ratio: "16:9",
    width: 1920,
    height: 1080,
    fps: { num: 30, den: 1 },
    duration_frames: 180,
    style_preset: "dark-premium",
    animation_intensity: "balanced",
    background: "#0b0d12",
    transparent_export: false,
    safe_area: { x: 0.05, y: 0.05 },
  };
}
