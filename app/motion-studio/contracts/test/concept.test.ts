import { describe, expect, it } from "vitest";
import { ConceptOutputSchema, PATTERN_SLUGS, toJsonSchema } from "../src/index.js";

function concept(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    needs_clarification: [],
    concept: "Рост выручки за год как поднимающаяся линия",
    patterns: ["growth-decline"],
    kb_queries: { ru: ["график роста"], en: [] },
    composition_mode: "fullscreen",
    style_hint: { preset: "dark-premium" },
    structure: { rule: "one-number", runner_up: "build-strike", reason: "одна величина от и до" },
    ...over,
  };
}
const ok = (v: unknown) => ConceptOutputSchema.safeParse(v).success;

describe("ConceptOutput", () => {
  it("корректный ответ", () => expect(ok(concept())).toBe(true));
  it("12 паттернов", () => expect(PATTERN_SLUGS).toHaveLength(12));
  it("неизвестный паттерн отвергается", () => expect(ok(concept({ patterns: ["made-up"] }))).toBe(false));
  it("паттернов 1..3", () => {
    expect(ok(concept({ patterns: [] }))).toBe(false);
    expect(ok(concept({ patterns: ["comparison", "timeline", "spatial"] }))).toBe(true);
    expect(ok(concept({ patterns: ["comparison", "timeline", "spatial", "quantities"] }))).toBe(false);
  });
  it("уточнений не больше трёх", () => {
    const q = { question: "Какой период?", default_if_skipped: "год" };
    expect(ok(concept({ needs_clarification: [q, q, q] }))).toBe(true);
    expect(ok(concept({ needs_clarification: [q, q, q, q] }))).toBe(false);
  });
  it("kb_queries: ru 1..5, en 0..5", () => {
    expect(ok(concept({ kb_queries: { ru: [], en: [] } }))).toBe(false);
    expect(ok(concept({ kb_queries: { ru: ["a"], en: ["a", "b", "c", "d", "e", "f"] } }))).toBe(false);
  });
  it("palette_overrides — форма PaletteOverrides (accent — массив)", () => {
    expect(ok(concept({ style_hint: { preset: "tech-neon", palette_overrides: { accent: ["#9B5CFF"] } } }))).toBe(true);
    expect(ok(concept({ style_hint: { preset: "tech-neon", palette_overrides: { accent0: "#9B5CFF" } } }))).toBe(false);
  });
  it("structure обязательна: правило из списка, запасная структура, причина", () => {
    expect(ok(concept({ structure: undefined }))).toBe(false);
    expect(ok(concept({ structure: { rule: "made-up", runner_up: "count-up", reason: "x" } }))).toBe(false);
    expect(ok(concept({ structure: { rule: "two-sides", runner_up: "count-up" } }))).toBe(false);
    expect(ok(concept({ structure: { rule: "two-sides", runner_up: "count-up", reason: "сравни A и B" } }))).toBe(true);
  });
  it("JSON Schema без $ref", () => expect(JSON.stringify(toJsonSchema(ConceptOutputSchema))).not.toContain("$ref"));
});
