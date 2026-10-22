// holdModeFor: режим финала из фазы hold, у старой spec — по носителю итога.
import { describe, expect, it } from "vitest";
import { type MotionSpec, MotionSpecSchema, holdModeExplicit, holdModeFor } from "../src/index.js";
import { baseSpec } from "./fixtures.js";

const base = () => MotionSpecSchema.parse(baseSpec()) as MotionSpec;
const withEl = (kind: MotionSpec["elements"][number]["kind"], content: Record<string, unknown> = {}): MotionSpec => {
  const s = base();
  return { ...s, elements: [{ id: "hero", kind, role: "герой", entrance: "rise", content }] };
};

describe("holdModeFor", () => {
  it("фаза hold с режимом — он и есть (явный)", () => {
    const s = base();
    const ids = s.elements.map((e) => e.id);
    const sp: MotionSpec = { ...s, phases: [{ id: "a", role: "action", weight: 2, element_ids: ids }, { id: "h", role: "hold", weight: 1, element_ids: ids, hold_mode: "repeat-result" }] };
    expect(holdModeFor(sp)).toBe("repeat-result");
    expect(holdModeExplicit(sp)).toBe(true);
  });
  it("старая spec: схема с потоками — steady-flow, график — data-shimmer, иначе now-pulse", () => {
    expect(holdModeFor(withEl("graph", { flows: [{ edge: "e1" }] }))).toBe("steady-flow");
    expect(holdModeFor(withEl("graph"))).toBe("now-pulse");
    expect(holdModeFor(withEl("chart"))).toBe("data-shimmer");
    expect(holdModeFor(withEl("number"))).toBe("now-pulse");
    expect(holdModeExplicit(withEl("chart"))).toBe(false);
  });
});
