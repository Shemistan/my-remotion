// S3: правила разнообразия плана сценария (спека §5.3) — `planDiversity`.
import { DEFAULT_READING, type ScriptSceneItem, type StructureRule, type Technique, readingFrames } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { planDiversity } from "../../src/script/diversity.js";

const F30 = { num: 30, den: 1 };
type Spec = Technique | { t: Technique; structure_rule?: StructureRule; status?: "accepted" | "rejected" };

function items(specs: Spec[]): ScriptSceneItem[] {
  return specs.map((s, i) => {
    const o = typeof s === "string" ? { t: s } : s;
    const n = String(i + 1).padStart(3, "0");
    return {
      id: `ss_${n}`, status: o.status ?? "accepted", origin: "agent",
      start_word_id: `w_000${n}`, end_word_id: `w_000${n}`, quote: "слово", block_id: "b1", words: 1, at_s: i,
      frames: readingFrames(1, DEFAULT_READING, F30), technique: o.t, pattern: "quantities",
      ...(o.structure_rule ? { structure_rule: o.structure_rule } : {}),
      purpose: "", idea: "", key_terms: [], data: [], importance: 2, anchor_ids: [],
    };
  });
}
const codes = (issues: { code: string }[]) => issues.map((x) => x.code);

describe("planDiversity", () => {
  it("правила спеки §5.3", () => {
    expect(codes(planDiversity(items(["hero-number", "race", "hero-number"])).issues)).toEqual([]); // 2 ≤ max(2, ⌈0,9⌉)
    expect(codes(planDiversity(items(["race", "hero-number", "race", "timeline", "race"])).issues)).toContain("technique_overuse"); // 3 > max(2, ⌈1,5⌉)
    expect(codes(planDiversity(items(["kinetic-quote", "race", "kinetic-quote", "timeline", "hero-number"])).issues)).toContain("kinetic_overuse"); // 40 %
    expect(codes(planDiversity(items(["race", "timeline", "race", "timeline", "race", "timeline"])).issues)).toContain("low_variety");
    expect(codes(planDiversity(items(["process-steps", "timeline"])).issues)).toContain("adjacent_structure_repeat"); // обе build-strike
    // правило request-answer → call-response: форма времени разная
    expect(codes(planDiversity(items(["process-steps", { t: "timeline", structure_rule: "request-answer" }])).issues)).not.toContain("adjacent_structure_repeat");
  });

  it("соседние одинаковые приёмы — blocking у поздней; отклонённые сцены не считаются", () => {
    const d = planDiversity(items(["race", "race", "hero-number"]));
    expect(d.issues.filter((x) => x.code === "adjacent_technique_repeat")).toEqual([
      expect.objectContaining({ severity: "blocking", item_id: "ss_002" }),
    ]);
    expect(d.adjacent_repeats).toBe(1);
    expect(d.techniques).toMatchObject({ race: 2, "hero-number": 1 });
    expect(codes(planDiversity(items(["race", { t: "race", status: "rejected" }, "hero-number"])).issues)).not.toContain("adjacent_technique_repeat");
  });

  it("доля kinetic-quote и счётчики", () => {
    const d = planDiversity(items(["kinetic-quote", "race", "hero-number", "timeline"]));
    expect(d.kinetic_share).toBe(0.25);
    expect(planDiversity([]).kinetic_share).toBe(0);
  });
});
