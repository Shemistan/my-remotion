import { z } from "zod";
import { IntensitySchema, StylePresetSchema } from "./settings.js";
import { StyleBibleSchema } from "./style.js";

/** Основа стиля проекта (V6): пресет Phase 1 + переопределения; `resolved = resolveStyle(base)`. */
export const ProjectStyleBaseSchema = z.object({
  preset: StylePresetSchema,
  palette_overrides: z.record(z.string()).optional(),
  font: z.string().min(1).optional(),
  intensity: IntensitySchema,
  depth: z.number().int().min(0).max(3),
}).strict();
export type ProjectStyleBase = z.infer<typeof ProjectStyleBaseSchema>;

/** Документ ревизии StyleBible проекта `r<N>` (вход Approval B). */
export const ProjectStyleDocSchema = z.object({
  schema_version: z.literal(1),
  style_id: z.string().min(1),
  revision: z.number().int().positive(),
  base: ProjectStyleBaseSchema,
  resolved: StyleBibleSchema,
  rationale: z.string(),
  author: z.enum(["agent", "user"]),
}).strict();
export type ProjectStyleDoc = z.infer<typeof ProjectStyleDocSchema>;
