import { EditPlanSchema, type QAReport } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { planFromQa } from "../../src/pipeline/improve-plan.js";

const report = (scores = true): QAReport => ({
  gate: { technical: "pass", visual: "warn", semantic: "pass", style: "pass" },
  issues: [
    { source: "agent", code: "clipping", severity: "blocking", frame: 42, description: "заголовок обрезан", fix_hint: "сдвинуть заголовок" },
    { source: "agent", code: "accent_static", severity: "warning", description: "финал застыл", fix_hint: "добавить движение" },
  ],
  checked_frames: [0, 42],
  ocr: [],
  ...(scores ? {
    scores: { overall: 5.5, hierarchy: 6, composition: 4, entrance: 7, choreography: 5, hold: 3, legibility: 8, meaning: 9 },
    score_notes: [{ axis: "hold" as const, frame: 42, note: "финал неподвижен" }],
  } : {}),
  automated: true,
});

describe("planFromQa", () => {
  it("строит code-план по трём слабым осям, кадрам и замечаниям QA", () => {
    const plan = planFromQa(report(), "ver_1");
    expect(plan.changes.slice(0, 3).map((x) => x.target)).toEqual(["hold", "composition", "choreography"]);
    expect(plan.changes[0]?.description).toContain("сейчас 3/10");
    expect(plan.changes[0]?.description).toContain("кадр 42: финал неподвижен");
    expect(plan.changes.find((x) => x.target === "qa")?.description).toMatch(/clipping[\s\S]*accent_static/);
    expect(plan).toMatchObject({ base_version_id: "ver_1", path: "code", borrow: [], preserve: ["timing"] });
    expect(plan.reply).toContain("5.5/10");
    expect(EditPlanSchema.parse(plan)).toEqual(plan);
  });

  it("отказывает без scores", () => {
    expect(() => planFromQa(report(false), "ver_1")).toThrow(/no_scores/);
  });
});
