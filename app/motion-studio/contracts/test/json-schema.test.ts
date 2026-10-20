import { describe, expect, it } from "vitest";
import {
  DirectorOutputSchema, EngineerReportSchema, VersionManifestSchema, toJsonSchema,
} from "../src/index.js";

function walk(node: unknown, visit: (o: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (node && typeof node === "object") {
    visit(node as Record<string, unknown>);
    Object.values(node).forEach((n) => walk(n, visit));
  }
}

describe("toJsonSchema", () => {
  it("DirectorOutput без $ref, корень — объект", () => {
    const js = toJsonSchema(DirectorOutputSchema);
    expect(JSON.stringify(js)).not.toContain("$ref");
    expect(js).toMatchObject({ type: "object", required: expect.arrayContaining(["spec", "selection", "rationale"]) });
  });
  it.each([
    ["DirectorOutput", DirectorOutputSchema],
    ["EngineerReport", EngineerReportSchema],
    ["VersionManifest", VersionManifestSchema],
  ])("%s: у всех объектов additionalProperties=false (кроме записей)", (_n, schema) => {
    const js = toJsonSchema(schema);
    expect(JSON.stringify(js)).not.toContain("$ref");
    walk(js, (o) => {
      if (o.type === "object" && o.properties) expect(o.additionalProperties).toBe(false);
    });
  });
});
