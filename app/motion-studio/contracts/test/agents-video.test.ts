import { describe, expect, it } from "vitest";
import {
  FootageAgentOutputSchema, ROUGH_CUT_TEXT_MAX, RoughCutAgentOutputSchema, SemanticAgentOutputSchema, VisualPlannerOutputSchema, toJsonSchema,
} from "../src/index.js";
import { planner } from "./video-fixtures.js";

// Произвольные записи, которые остаются нестрогими: переопределения палитры (ключ — токен палитры).
const RECORD_ALLOWLIST = new Set(["properties.style.properties.palette_overrides"]);

function walk(node: unknown, path: string, visit: (o: Record<string, unknown>, path: string) => void): void {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, path, visit));
  if (node && typeof node === "object") {
    visit(node as Record<string, unknown>, path);
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, visit);
  }
}

const AGENT_SCHEMAS = [
  ["RoughCutAgentOutput", RoughCutAgentOutputSchema],
  ["FootageAgentOutput", FootageAgentOutputSchema],
  ["SemanticAgentOutput", SemanticAgentOutputSchema],
  ["VisualPlannerOutput", VisualPlannerOutputSchema],
] as const;

describe("агенты Phase 2–3", () => {
  it.each(AGENT_SCHEMAS)("%s: JSON Schema без $ref, объекты строгие, времени нет", (_n, s) => {
    const js = toJsonSchema(s);
    const txt = JSON.stringify(js);
    expect(txt).not.toContain("$ref");
    walk(js, "", (o, path) => {
      if (o.type !== "object" || RECORD_ALLOWLIST.has(path)) return;
      expect(o.additionalProperties, `узел ${path}`).toBe(false);
    });
    // LLM не выдаёт время: ни одного поля *_us, кроме кадра наблюдения Footage (frame_us — момент ключевого кадра из входа)
    const usKeys = [...txt.matchAll(/"([a-z_]+_us)":/g)].map((m) => m[1]);
    expect(usKeys.filter((k) => k !== "frame_us")).toEqual([]);
  });

  it("VisualPlannerOutput: plan ⇒ режим не none и есть evidence", () => {
    expect(VisualPlannerOutputSchema.safeParse(planner()).success).toBe(true);
    expect(VisualPlannerOutputSchema.safeParse(planner({ decision: "plan", composition_mode: "none" })).success).toBe(false);
    expect(VisualPlannerOutputSchema.safeParse(planner({ decision: "plan", evidence: [] })).success).toBe(false);
    expect(VisualPlannerOutputSchema.safeParse(planner({ decision: "skip", composition_mode: "none", evidence: [], skip_reason: "лицо крупно" })).success).toBe(true);
    // skip без причины — не пропуск, а потеря решения
    expect(VisualPlannerOutputSchema.safeParse(planner({ decision: "skip", composition_mode: "none", evidence: [] })).success).toBe(false);
  });

  it("RoughCutAgentOutput", () => {
    const d = { start_word_id: "w_000001", end_word_id: "w_000002", reason: "false_start", confidence: 0.7, explanation: "фальстарт", quote: "мы мы" };
    expect(RoughCutAgentOutputSchema.safeParse({ decisions: [d], reviews: [{ decision_id: "cut_001", verdict: "keep_cut", why: "пауза" }] }).success).toBe(true);
    expect(RoughCutAgentOutputSchema.safeParse({ decisions: [{ ...d, reason: "pause" }], reviews: [] }).success).toBe(false);
    expect(RoughCutAgentOutputSchema.safeParse({ decisions: [{ ...d, confidence: 2 }], reviews: [] }).success).toBe(false);
    expect(RoughCutAgentOutputSchema.safeParse({ decisions: [{ ...d, source_start_us: 1 }], reviews: [] }).success).toBe(false);
    // ревью Task 28, M6: объяснения короткие — длинный текст в EDL и UI не нужен
    expect(RoughCutAgentOutputSchema.safeParse({ decisions: [{ ...d, explanation: "я".repeat(ROUGH_CUT_TEXT_MAX) }], reviews: [] }).success).toBe(true);
    expect(RoughCutAgentOutputSchema.safeParse({ decisions: [{ ...d, explanation: "я".repeat(ROUGH_CUT_TEXT_MAX + 1) }], reviews: [] }).success).toBe(false);
    expect(RoughCutAgentOutputSchema.safeParse({ decisions: [], reviews: [{ decision_id: "cut_001", verdict: "keep_cut", why: "я".repeat(ROUGH_CUT_TEXT_MAX + 1) }] }).success).toBe(false);
    const js = JSON.stringify(toJsonSchema(RoughCutAgentOutputSchema));
    expect(js).not.toContain("$ref");
    expect(js).toContain(`"maxLength":${ROUGH_CUT_TEXT_MAX}`);
  });

  it("FootageAgentOutput", () => {
    const shot = { shot_id: "shot_001", author_position: "left", motion: "static", gestures: "low", objects: [{ label: "доска", frame_us: 0, important: true }], background: "офис", notes: "", uncertainty: [] };
    expect(FootageAgentOutputSchema.safeParse({ shots: [shot] }).success).toBe(true);
    expect(FootageAgentOutputSchema.safeParse({ shots: [{ ...shot, gestures: "wild" }] }).success).toBe(false);
  });

  it("SemanticAgentOutput — без id и ссылок", () => {
    const out = { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] };
    expect(SemanticAgentOutputSchema.safeParse(out).success).toBe(true);
    expect(SemanticAgentOutputSchema.safeParse({ ...out, id: "sem_1" }).success).toBe(false);
  });
});
