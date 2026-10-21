import { describe, expect, it } from "vitest";
import {
  ConceptOutputSchema, DirectorOutputSchema, EditPlanSchema, EngineerReportSchema, VersionManifestSchema, VisualQAOutputSchema, toJsonSchema,
} from "../src/index.js";

// Произвольные записи, которые остаются нестрогими. Эмпирика (fix round 1, R-JSON): реальный вызов
// `claude -p --model haiku --json-schema` со схемой DirectorOutput принял record `content`
// (additionalProperties: {}), вернул structured_output, который прошёл DirectorOutputSchema.
// Остальные записи (tracking, spring) лежат в StyleBible и не входят в агентские схемы.
// `param_patch.content` EditPlan — та же произвольная запись контента сцены (props.content).
const RECORD_ALLOWLIST = new Set([
  "properties.spec.properties.elements.items.properties.content",
  "properties.param_patch.properties.content",
  "properties.edit_plan.anyOf.anyOf.properties.param_patch.properties.content",
]);

function walk(node: unknown, path: string, visit: (o: Record<string, unknown>, path: string) => void): void {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, path, visit));
  if (node && typeof node === "object") {
    visit(node as Record<string, unknown>, path);
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, visit);
  }
}

describe("toJsonSchema", () => {
  it("DirectorOutput без $ref, корень — объект", () => {
    const js = toJsonSchema(DirectorOutputSchema);
    expect(JSON.stringify(js)).not.toContain("$ref");
    expect(js).toMatchObject({ type: "object", required: expect.arrayContaining(["spec", "selection", "rationale"]) });
  });
  it("minimum/maximum/minItems сохраняются в схеме", () => {
    const txt = JSON.stringify(toJsonSchema(DirectorOutputSchema));
    for (const k of ["minimum", "maximum", "minItems"]) expect(txt).toContain(`"${k}"`);
  });
  it.each([
    ["DirectorOutput", DirectorOutputSchema],
    ["EngineerReport", EngineerReportSchema],
    ["VersionManifest", VersionManifestSchema],
    ["ConceptOutput", ConceptOutputSchema],
    ["VisualQAOutput", VisualQAOutputSchema],
    ["EditPlan", EditPlanSchema],
  ])("%s: у всех объектов additionalProperties=false (кроме allowlist)", (_n, schema) => {
    const js = toJsonSchema(schema);
    expect(JSON.stringify(js)).not.toContain("$ref");
    walk(js, "", (o, path) => {
      if (o.type !== "object") return;
      if (RECORD_ALLOWLIST.has(path)) return;
      expect(o.additionalProperties, `узел ${path}`).toBe(false);
    });
  });
});
