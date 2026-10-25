// S11 (спека §12 п.2, Р22): существующая `uniform_entrance` — порог warning для `fade` 0,5
// (для прочих видов — прежние 0,6), blocking (все входы одинаковы) без изменений.
import type { Element, MotionSpec, QAIssue } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { UNIFORM_FADE_WARN_SHARE, specChecks } from "../../src/qa/spec-checks.js";
import { beat, el, settings as makeSettings, spec as makeSpec } from "./helpers.js";

const settings = makeSettings();
const codes = (issues: QAIssue[]) => issues.map((i) => i.code);

/** Элементы в столбик внутри safe area, бит акцента есть. */
function specWithEntrances(list: Element["entrance"][]): MotionSpec {
  const elements = list.map((e, i) => el(`e${i}`, { entrance: e, layout: { x: 0.1, y: 0.05 + i * 0.18, w: 0.3, h: 0.1 } }));
  return makeSpec({ elements, beats: [beat("b0", 0, 60, elements.map((e) => e.id)), beat("b1", 60, 90, ["e0"], "final-emphasis")] });
}

describe("uniform_entrance: порог для fade", () => {
  it("fade > 50 % — warning; прочие виды — прежние 60 %; blocking как раньше", () => {
    expect(UNIFORM_FADE_WARN_SHARE).toBe(0.5);
    expect(codes(specChecks(specWithEntrances(["fade", "fade", "fade", "rise", "count"]), settings, {}))).toContain("uniform_entrance"); // 0,6 > 0,5 (fade)
    expect(codes(specChecks(specWithEntrances(["rise", "rise", "rise", "fade", "count"]), settings, {}))).not.toContain("uniform_entrance"); // 0,6 не > 0,6
    expect(codes(specChecks(specWithEntrances(["fade", "count", "draw", "rise"]), settings, {}))).not.toContain("uniform_entrance");
    expect(codes(specChecks(specWithEntrances(["fade", "fade", "fade"]), settings, {}))).toEqual(expect.arrayContaining(["uniform_entrance"]));
    expect(specChecks(specWithEntrances(["fade", "fade", "fade"]), settings, {}).find((i) => i.code === "uniform_entrance")?.severity).toBe("blocking");
    expect(specChecks(specWithEntrances(["fade", "fade", "fade", "rise", "count"]), settings, {}).find((i) => i.code === "uniform_entrance")?.severity).toBe("warning");
    // ровно половина fade — не больше 0,5
    expect(codes(specChecks(specWithEntrances(["fade", "fade", "rise", "count"]), settings, {}))).not.toContain("uniform_entrance");
  });

  it("подсказка — разные входы по роли; второй проверки нет", () => {
    const sp = specWithEntrances(["fade", "fade", "fade", "rise", "count"]);
    const hit = specChecks(sp, settings, {}).find((i) => i.code === "uniform_entrance")!;
    expect(hit.fix_hint).toContain("разные входы по роли: число — count, линия — draw, карточки — rise/slide, акцент — mask/pop");
    expect(codes(specChecks(sp, settings, {}))).not.toContain("entrance_monotony");
  });
});
