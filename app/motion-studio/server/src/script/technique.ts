// Выбор приёма сцены по паттерну и соседям (спека §7, операция `add` без приёма): код, а не
// `kinetic-quote` по умолчанию — соседние сцены должны отличаться.
import { type PatternSlug, TECHNIQUES, type Technique } from "@ms/contracts";

/** Приёмы паттерна KB по убыванию уместности (таблица §5.3 «что показывает»). */
export const TECHNIQUE_BY_PATTERN: Record<PatternSlug, readonly Technique[]> = {
  "growth-decline": ["line-trend", "bar-compare", "hero-number"],
  comparison: ["bar-compare", "split-versus", "race"],
  "cause-effect": ["flow-graph", "process-steps", "callout-diagram"],
  "sequence-steps": ["process-steps", "timeline", "flow-graph"],
  "system-structure": ["structure-build", "flow-graph", "callout-diagram"],
  relationships: ["flow-graph", "structure-build", "callout-diagram"],
  timeline: ["timeline", "line-trend", "process-steps"],
  transformation: ["split-versus", "data-token", "process-steps"],
  quantities: ["hero-number", "bar-compare", "line-trend"],
  spatial: ["structure-build", "callout-diagram", "flow-graph"],
  "abstract-concepts": ["callout-diagram", "structure-build", "kinetic-quote"],
  "key-point-emphasis": ["kinetic-quote", "callout-diagram", "checklist"],
};

/**
 * Первый приём паттерна, которого нет у соседей; затем `structure-build`; затем любой приём из
 * таблицы, кроме `kinetic-quote` (тезис словами человек выбирает сам).
 */
export function pickTechnique(pattern: PatternSlug | undefined, neighbours: readonly Technique[]): Technique {
  const order: Technique[] = [
    ...(pattern ? TECHNIQUE_BY_PATTERN[pattern] : []),
    "structure-build",
    ...TECHNIQUES.map((t) => t.slug).filter((t) => t !== "kinetic-quote"),
  ];
  return order.find((t) => !neighbours.includes(t)) ?? "structure-build";
}
