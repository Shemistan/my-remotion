import { z } from "zod";
import { PatternSlugSchema } from "./patterns.js";
import { PaletteOverridesSchema, type SceneStructure, SceneStructureSchema } from "./motion-spec.js";
import { StylePresetSchema } from "./settings.js";

export const CompositionModeSchema = z.enum(["fullscreen", "overlay", "split_screen", "pip", "callout", "none"]);
export type CompositionMode = z.infer<typeof CompositionModeSchema>;

/**
 * Правила выбора структуры сцены (S3a-fix), по порядку: Concept берёт первое подошедшее
 * (prompts/concept.md «Форма времени»). Правило однозначно задаёт структуру.
 */
export const STRUCTURE_RULES = [
  ["result-first", "cold-open"],
  ["two-sides", "split-reveal"],
  ["request-answer", "call-response"],
  ["one-number", "count-up"],
  ["always-on", "continuous-flow"],
  ["assembly", "build-strike"],
] as const satisfies readonly (readonly [string, SceneStructure])[];
export type StructureRule = (typeof STRUCTURE_RULES)[number][0];
export const StructureRuleSchema = z.enum(STRUCTURE_RULES.map(([r]) => r) as [StructureRule, ...StructureRule[]]);

/** Выбор структуры Concept: сработавшее правило, запасная структура и почему. */
export const StructureChoiceSchema = z.object({
  rule: StructureRuleSchema,
  runner_up: SceneStructureSchema,
  reason: z.string().min(1),
}).strict();
export type StructureChoice = z.infer<typeof StructureChoiceSchema>;

/** Структура по правилу Concept. */
export function structureOfRule(rule: StructureRule): SceneStructure {
  return STRUCTURE_RULES.find(([r]) => r === rule)![1];
}

/** Ответ агента Concept: идея сцены, паттерны, запросы к KB, форма времени, уточнения (не больше трёх). */
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
  structure: StructureChoiceSchema,
}).strict();
export type ConceptOutput = z.infer<typeof ConceptOutputSchema>;
