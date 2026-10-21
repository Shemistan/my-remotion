import { describe, expect, it } from "vitest";
import { EditPlanSchema, toJsonSchema } from "../src/index.js";

function plan(over: Record<string, unknown> = {}): Record<string, unknown> {
  const changes = (over.changes as Record<string, unknown>[] | undefined)?.map((c) => ({ target: "timing", kind: "param", description: "медленнее", ...c }));
  return {
    base_version_id: "ver_1",
    path: "param",
    borrow: [],
    preserve: ["composition", "palette"],
    reply: "Замедлю анимацию на 25 %",
    ...over,
    changes: changes ?? [{ target: "timing", kind: "param", description: "медленнее" }],
  };
}
const ok = (v: unknown) => EditPlanSchema.safeParse(v).success;

describe("EditPlan", () => {
  it("корректный план", () => expect(ok(plan({ timing_scale: 1 / 0.75 }))).toBe(true));
  it("path=param запрещает изменения code/spec", () => {
    expect(ok(plan({ path: "param", changes: [{ kind: "code" }] }))).toBe(false);
    expect(ok(plan({ path: "param", changes: [{ kind: "spec" }] }))).toBe(false);
    expect(ok(plan({ path: "code", changes: [{ kind: "code" }, { kind: "param" }] }))).toBe(true);
  });
  it("timing_scale в (0.25, 4]", () => {
    expect(ok(plan({ timing_scale: 0 }))).toBe(false);
    expect(ok(plan({ timing_scale: 0.25 }))).toBe(false);
    expect(ok(plan({ timing_scale: 4 }))).toBe(true);
    expect(ok(plan({ timing_scale: 4.01 }))).toBe(false);
  });
  it("borrow и param_patch", () => {
    expect(ok(plan({ borrow: [{ from_version_id: "ver_0", what: "palette" }] }))).toBe(true);
    expect(ok(plan({ borrow: [{ from: "ver_0", what: "palette" }] }))).toBe(false);
    expect(ok(plan({ param_patch: { style: { depth: 3 }, content: { title: "x" } } }))).toBe(true);
    expect(ok(plan({ param_patch: { style: { depth: 7 } } }))).toBe(false);
  });
  it("частичный style в param_patch не получает умолчаний", () => {
    const p = EditPlanSchema.parse(plan({ param_patch: { style: { intensity: "calm" } } }));
    expect(p.param_patch!.style).toEqual({ intensity: "calm" });
  });
  it("JSON Schema без $ref", () => expect(JSON.stringify(toJsonSchema(EditPlanSchema))).not.toContain("$ref"));
});
