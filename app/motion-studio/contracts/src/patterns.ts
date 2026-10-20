import { z } from "zod";

/** Смысловые паттерны визуализации (KB `knowledge/patterns/`): словарь Concept и поиска. */
export const PATTERN_SLUGS = [
  "growth-decline",
  "comparison",
  "cause-effect",
  "sequence-steps",
  "system-structure",
  "relationships",
  "timeline",
  "transformation",
  "quantities",
  "spatial",
  "abstract-concepts",
  "key-point-emphasis",
] as const;
export const PatternSlugSchema = z.enum(PATTERN_SLUGS);
export type PatternSlug = z.infer<typeof PatternSlugSchema>;
