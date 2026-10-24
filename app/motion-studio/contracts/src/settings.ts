import { z } from "zod";
import { FpsSchema } from "./time.js";

export const AspectRatioSchema = z.enum(["16:9", "9:16", "1:1"]);
export const StylePresetSchema = z.enum(["dark-premium", "light-clean", "tech-neon"]);
export const IntensitySchema = z.enum(["calm", "balanced", "energetic"]);

const Half = z.number().min(0).lt(0.5);
/** Безопасная зона — доли кадра по x и y (поле с каждой стороны). */
export const SafeAreaSchema = z.object({ x: Half, y: Half }).strict();
/**
 * Стиль проекта, зафиксированный для сцены (сценарий, спека §6.2): палитра, глубина и шрифт
 * берутся отсюда и важнее того, что предложили агенты (`scenePropsStyle`, `checkProps`).
 * Палитра — форма `PaletteOverrides` (motion-spec.ts импортирует этот файл — без цикла).
 */
export const StyleLockSchema = z.object({
  palette_overrides: z.object({
    bg: z.string(), surface: z.string(), text: z.string(), muted: z.string(),
    accent: z.array(z.string()).min(1), positive: z.string(), negative: z.string(),
  }).partial().strict().optional(),
  depth: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  font: z.string().min(1).optional(),
}).strict();
export type StyleLock = z.infer<typeof StyleLockSchema>;

const ASPECT: Record<string, number> = { "16:9": 16 / 9, "9:16": 9 / 16, "1:1": 1 };

/** Поля настроек без межпольных проверок: основа для частичного патча (`RenderBody`). */
export const SettingsFieldsSchema = z.object({
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
  safe_area: SafeAreaSchema,
  /** Сценарий: стиль проекта для сцены — приоритетнее палитры/глубины/шрифта агентов. */
  style_lock: StyleLockSchema.optional(),
}).strict();

/** Настройки сцены (ТЗ §6.4). safe_area — доли кадра. */
export const SettingsSchema = SettingsFieldsSchema.superRefine((s, ctx) => {
  const want = ASPECT[s.aspect_ratio]!;
  if (Math.abs(s.width / s.height / want - 1) > 0.01) {
    ctx.addIssue({ code: "custom", path: ["aspect_ratio"], message: `width/height не соответствуют ${s.aspect_ratio} (допуск 1%)` });
  }
});
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
