import { z } from "zod";
import { PatternSlugSchema } from "./patterns.js";
import { PaletteOverridesSchema } from "./motion-spec.js";
import { StylePresetSchema } from "./settings.js";

export const CompositionModeSchema = z.enum(["fullscreen", "overlay", "split_screen", "pip", "callout", "none"]);
export type CompositionMode = z.infer<typeof CompositionModeSchema>;

/** Ответ агента Concept: идея сцены, паттерны, запросы к KB, уточнения (не больше трёх). */
export const ConceptOutputSchema = z.object({
  needs_clarification: z.array(z.object({
    question: z.string().min(1),
    default_if_skipped: z.string(),
  }).strict()).max(3),
  concept: z.string().min(1),
  patterns: z.array(PatternSlugSchema).min(1).max(3),
  kb_queries: z.object({
    ru: z.array(z.string().min(1)).min(1).max(5),
    en: z.array(z.string().min(1)).max(5),
  }).strict(),
  composition_mode: CompositionModeSchema,
  style_hint: z.object({
    preset: StylePresetSchema,
    palette_overrides: PaletteOverridesSchema.optional(),
  }).strict(),
}).strict();
export type ConceptOutput = z.infer<typeof ConceptOutputSchema>;
