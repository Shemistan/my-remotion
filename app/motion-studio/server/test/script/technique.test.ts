// S3: выбор приёма по паттерну и соседям (для `add` без приёма, S4).
import { PATTERN_SLUGS } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { TECHNIQUE_BY_PATTERN, pickTechnique } from "../../src/script/technique.js";

describe("pickTechnique", () => {
  it("первый приём паттерна не из соседей; без паттерна — structure-build", () => {
    expect(pickTechnique("quantities", [])).toBe("hero-number");
    expect(pickTechnique("quantities", ["hero-number"])).toBe("bar-compare");
    expect(pickTechnique(undefined, [])).toBe("structure-build");
    expect(pickTechnique("sequence-steps", ["process-steps"])).toBe("timeline");
  });

  it("все приёмы паттерна заняты соседями — следующий подходящий, но не kinetic-quote по умолчанию", () => {
    const all = TECHNIQUE_BY_PATTERN.quantities;
    const t = pickTechnique("quantities", [...all, "structure-build"]);
    expect([...all, "structure-build", "kinetic-quote"]).not.toContain(t);
    expect(pickTechnique(undefined, ["structure-build"])).not.toBe("kinetic-quote");
  });

  it("таблица покрывает все паттерны KB", () => {
    for (const p of PATTERN_SLUGS) expect(TECHNIQUE_BY_PATTERN[p].length).toBeGreaterThan(0);
  });
});
