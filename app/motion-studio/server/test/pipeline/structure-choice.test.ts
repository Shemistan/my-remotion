// Структура сцены — выбор Concept (S3a-fix): правило по порядку и запасная; Director ставит
// её фазы и меняет только с причиной (`composition.structure_reason`).
import { describe, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import { buildDirectorTask, conceptStructure, scenePropsStyle, sceneStyle, withConceptStructure } from "../../src/pipeline/steps.js";
import { loadConfig } from "../../src/config.js";
import { conceptOutput, directorOutput } from "./helpers.js";

/** Фазы: две стороны (setup) — подходят под split-reveal; одна action — нет. */
const SIDES = [
  { id: "left", role: "setup" as const, weight: 1, element_ids: ["title"] },
  { id: "right", role: "setup" as const, weight: 1, element_ids: ["chart"] },
  { id: "race", role: "action" as const, weight: 2, element_ids: ["chart"] },
];
const ONE = [{ id: "p", role: "action" as const, weight: 1, element_ids: ["chart"] }];
const phased = (structure?: "count-up" | "split-reveal" | "build-strike", reason?: string, phases: { id: string; role: "setup" | "action"; weight: number; element_ids: string[] }[] = SIDES) => {
  const o = directorOutput();
  return {
    ...o,
    composition: { ...o.composition, ...(structure ? { structure } : {}), ...(reason ? { structure_reason: reason } : {}) },
    spec: { ...o.spec, phases },
  };
};
const concept = conceptOutput({ structure: { rule: "two-sides", runner_up: "count-up", reason: "сравни A и B" } });

describe("структура Concept → Director", () => {
  it("правило задаёт структуру; старый ответ без выбора — нет структуры", () => {
    expect(conceptStructure(concept)).toMatchObject({ value: "split-reveal", rule: "two-sides", runner_up: "count-up" });
    const old: Partial<typeof concept> = { ...concept };
    delete old.structure;
    expect(conceptStructure(old as typeof concept)).toBeUndefined();
  });

  it("Director без структуры или с другой без причины, фазы подходят под Concept — структура Concept, предупреждение и строка для раунда", () => {
    for (const d of [phased(), phased("build-strike")]) {
      const r = withConceptStructure(d, concept);
      expect(r.director.composition.structure).toBe("split-reveal");
      expect(r.warning).toMatch(/split-reveal.*two-sides/);
      expect(r.note).toMatch(/структура заменена на split-reveal \(Concept.*structure_reason/);
    }
  });

  it("фазы не подходят под структуру Concept — остаётся выбор Director, предупреждение и строка для раунда (s3afix-rereview m2)", () => {
    const r = withConceptStructure(phased("build-strike", undefined, ONE), concept);
    expect(r.director.composition.structure).toBe("build-strike");
    expect(r.warning).toMatch(/build-strike.*split-reveal/);
    expect(r.warning).toMatch(/сторон/);
    expect(r.note).toMatch(/split-reveal.*structure_reason/);
  });

  it("другая структура с причиной — остаётся, причина в предупреждении; та же — без предупреждения", () => {
    const r = withConceptStructure(phased("count-up", "число здесь важнее сторон"), concept);
    expect(r.director.composition.structure).toBe("count-up");
    expect(r.warning).toMatch(/число здесь важнее/);
    expect(withConceptStructure(phased("split-reveal"), concept).warning).toBeUndefined();
  });

  it("spec без фаз не трогается", () => {
    const d = directorOutput();
    expect(withConceptStructure(d, concept).director).toBe(d);
  });

  it("задача Director называет структуру Concept, правило и запасную", () => {
    const s = defaultSettings();
    const t = buildDirectorTask({ prompt: "x", settings: s, concept, candidates: [], patternTexts: [], kitApi: "", style: sceneStyle(scenePropsStyle(s), s), workdir: "/tmp/x" }, { root: "/tmp", runId: "r", attempt: 1, config: loadConfig({ MS_DATA_DIR: "/tmp/ms-none" }, {}) });
    expect(t.input).toMatch(/composition\.structure = "split-reveal"/);
    expect(t.input).toMatch(/two-sides/);
    expect(t.input).toMatch(/structure_reason/);
  });
});
