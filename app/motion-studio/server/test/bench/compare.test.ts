// Сравнение прогонов bench с прогонами до переименования харнесса: старые id отложенных сцен
// сопоставляются с `bench-…` через алиасы.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Scores, compareRuns } from "../../src/bench/compare.js";
import { EXPLAINER_SET, HELD_OUT, LEGACY_SCENE_ALIASES, canonicalSceneId } from "../../src/bench/sets.js";

const OLD = "eval";
const evidence = (run: string): Scores =>
  JSON.parse(readFileSync(new URL(`../../../../../docs/evidence/phase-1/bench/${run}/scores.json`, import.meta.url), "utf8")) as Scores;

describe("алиасы id сцен старых прогонов", () => {
  it("пять отложенных сцен: старый префикс → bench-, прочие id без изменений", () => {
    expect(Object.keys(LEGACY_SCENE_ALIASES).map((k) => k.startsWith(`${OLD}-`))).toEqual([true, true, true, true, true]);
    expect(new Set(Object.values(LEGACY_SCENE_ALIASES))).toEqual(HELD_OUT);
    expect(canonicalSceneId(`${OLD}-oauth`)).toBe("bench-oauth");
    expect(canonicalSceneId("bench-oauth")).toBe("bench-oauth");
    expect(canonicalSceneId("held-queue")).toBe("held-queue");
  });

  it("принятый прогон s3-6ef1f76 (старые id) сопоставляется с прогоном на bench-id по всем 12 сценам", () => {
    const before = evidence("s3-6ef1f76");
    expect(before.rows.filter((r) => r.id.startsWith(`${OLD}-`))).toHaveLength(5);
    // «после» — тот же прогон в нынешнем именовании, на полбалла выше
    const after: Scores = {
      summary: { ...before.summary, run: "bench-after" },
      rows: before.rows.map((r) => ({ id: canonicalSceneId(r.id), judge: r.judge && { ...r.judge, overall: r.judge.overall + 0.5 } })),
    };
    const c = compareRuns(before, after);
    expect(c.scenes.map((s) => s.id).sort()).toEqual(Object.keys(EXPLAINER_SET).sort());
    expect(c.scenes.every((s) => s.delta === 0.5)).toBe(true);
    // и в обратную сторону: старый прогон как «после»
    expect(compareRuns(after, before).scenes).toHaveLength(12);
  });
});
