import { z } from "zod";
import { FpsSchema } from "./time.js";
import { SettingsSchema } from "./settings.js";
import { RenderEnvSchema, Sha256Schema } from "./manifest.js";

/** Результат ffprobe видеофайла (`@ms/render` реэкспортирует тип). */
export const ProbeResultSchema = z.object({
  durationMs: z.number().nonnegative(),
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
}).strict();
export type ExportRequest = z.infer<typeof ExportRequestSchema>;

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
}).strict();
export type ExportManifest = z.infer<typeof ExportManifestSchema>;
