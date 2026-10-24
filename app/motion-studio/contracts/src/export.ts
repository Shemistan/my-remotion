import { z } from "zod";
import { FpsSchema } from "./time.js";
import { SettingsSchema } from "./settings.js";
import { RenderEnvSchema, Sha256Schema } from "./manifest.js";

/** Результат ffprobe видеофайла (`@ms/render` реэкспортирует тип). */
export const ProbeResultSchema = z.object({
  /** Длительность видеопотока (не `format.duration`: тот — максимум по потокам, с хвостом AAC). */
  durationMs: z.number().nonnegative(),
  /** Длительность первой звуковой дорожки (AAC добивается до целого кадра в 1024 сэмпла). */
  audioDurationMs: z.number().nonnegative().optional(),
  /** Профиль кодека видео (`4444` у ProRes 4444, `High` у H.264). */
  profile: z.string().min(1).optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: FpsSchema,
  codec: z.string().min(1),
  audioCodec: z.string().min(1).optional(),
  pixFmt: z.string().min(1).optional(),
}).strict();
export type ProbeResult = z.infer<typeof ProbeResultSchema>;

export const ExportFormatSchema = z.enum(["mp4", "prores4444"]);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const ExportRequestSchema = z.object({
  format: ExportFormatSchema,
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]).optional(),
  crf: z.number().int().min(14).max(28).default(18),
  scale: z.union([z.literal(1), z.literal(0.5)]).default(1),
  /** ProRes 4444 с альфой из непрозрачной версии (сценарий, спека §9): фон сцены не рисуется. */
  overlay: z.boolean().optional(),
}).strict();
export type ExportRequest = z.infer<typeof ExportRequestSchema>;

/**
 * Сверка темпа экспорта со сменой fps: кадр экспорта n·k (только точно совпадающие моменты,
 * n·k целое) против стоп-кадра версии n. Новые поля необязательны — манифесты первых экспортов.
 */
export const TempoCheckSchema = z.object({
  factor: z.number().positive(),
  threshold: z.number().positive(),
  hotTile: z.number().positive().optional(),
  hotTilesMin: z.number().int().positive().optional(),
  compare: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict().optional(),
  samples: z.array(z.object({
    frame: z.number().int().nonnegative(),
    exportFrame: z.number().int().nonnegative(),
    maxTile: z.number().nonnegative(),
    hotTiles: z.number().int().nonnegative().optional(),
    mean: z.number().nonnegative(),
    rendered: z.boolean().optional(),
  }).strict()),
  mismatched: z.array(z.number().int().nonnegative()),
}).strict();
export type TempoCheckRecord = z.infer<typeof TempoCheckSchema>;

/** `export-manifest.json` рядом с файлом экспорта. */
export const ExportManifestSchema = z.object({
  schema_version: z.literal(1),
  export_id: z.string().min(1),
  version_id: z.string().min(1),
  version_manifest_sha256: Sha256Schema,
  format: ExportFormatSchema,
  request: ExportRequestSchema,
  settings: SettingsSchema,
  ffprobe: ProbeResultSchema,
  sha256: Sha256Schema,
  render_env: RenderEnvSchema,
  created_at: z.string().datetime(),
  /** Сверка темпа со стоп-кадрами версии (только при fps экспорта ≠ fps версии). */
  tempo_check: TempoCheckSchema.optional(),
  /** Предупреждения экспорта: время вне договора кадров, MP4 прозрачной версии и т. п. */
  warnings: z.array(z.string()).optional(),
  /**
   * `overlay: true` (сценарий, спека §9): доля непрозрачных пикселей (`coverage`) и доля
   * полупрозрачной «дымки» (`haze`) по кадрам проверки `frames`.
   */
  overlay: z.object({
    coverage: z.number().min(0).max(1),
    haze: z.number().min(0).max(1),
    frames: z.array(z.number().int().nonnegative()),
  }).strict().optional(),
}).strict();
export type ExportManifest = z.infer<typeof ExportManifestSchema>;
