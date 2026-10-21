// Проверки спецификации до рендера: одинаковые входы, перекрытия, safe area, акцент.
import type { Element, MotionSpec } from "@ms/contracts";
import { describe, expect, it } from "vitest";
import { specChecks } from "../../src/qa/spec-checks.js";
import { beat, el, settings, spec } from "./helpers.js";

const s = settings();
const codes = (sp: MotionSpec) => specChecks(sp, s).map((i) => [i.code, i.severity]);

/** n элементов в столбик внутри safe area, бит акцента есть. */
function specAll(entrances: Element["entrance"][] | Element["entrance"], n = 4): MotionSpec {
  const list = Array.isArray(entrances) ? entrances : Array.from({ length: n }, () => entrances);
  const elements = list.map((e, i) => el(`e${i}`, { entrance: e, layout: { x: 0.1, y: 0.1 + i * 0.2, w: 0.3, h: 0.1 } }));
  return spec({ elements, beats: [beat("b0", 0, 60, elements.map((e) => e.id)), beat("b1", 60, 90, ["e0"], "final-emphasis")] });
}

describe("specChecks", () => {
  it("разные входы, без перекрытий, в safe area, с акцентом — без замечаний", () => {
    expect(specChecks(specAll(["rise", "fade", "scale", "mask"]), s)).toEqual([]);
  });

  it("uniform_entrance: у ≥ 3 элементов один вход — blocking; один вид у > 60 % — warning", () => {
    expect(codes(specAll("fade", 4))).toContainEqual(["uniform_entrance", "blocking"]);
    expect(codes(specAll(["fade", "fade", "fade", "rise"]))).toContainEqual(["uniform_entrance", "warning"]);
    expect(codes(specAll(["fade", "fade", "rise"]))).toContainEqual(["uniform_entrance", "warning"]);
    expect(codes(specAll("fade", 2)).map(([c]) => c)).not.toContain("uniform_entrance");
    // none не считается входом
    expect(codes(specAll(["none", "none", "none", "rise", "fade"])).map(([c]) => c)).not.toContain("uniform_entrance");
  });

  it("overlap: пересечение layout элементов одного уровня > 1 % кадра — blocking", () => {
    const specOverlapping = spec({
      elements: [el("a", { layout: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 } }), el("b", { entrance: "fade", layout: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 } })],
      beats: [beat("b0", 0, 60, ["a", "b"], "final-emphasis")],
    });
    expect(specChecks(specOverlapping, s).map((i) => i.code)).toContain("overlap");
    expect(specChecks(specOverlapping, s).find((i) => i.code === "overlap")).toMatchObject({ severity: "blocking", area: "a, b" });
  });

  it("overlap: вложенность, фон на весь кадр, разные слои глубины и касание ≤ 1 % — не перекрытие", () => {
    const sp = spec({
      elements: [
        el("bg", { kind: "shape", entrance: "fade", layout: { x: 0, y: 0, w: 1, h: 1 } }),
        el("card", { kind: "card", entrance: "scale", layout: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 } }),
        el("label", { entrance: "rise", layout: { x: 0.15, y: 0.15, w: 0.2, h: 0.1 } }),
        el("glow", { kind: "shape", entrance: "blur", depth_layer: 0, layout: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 } }),
        el("side", { kind: "card", entrance: "slide", layout: { x: 0.49, y: 0.1, w: 0.3, h: 0.4 } }), // заход 0.01×0.4 = 0.4 %
      ],
      beats: [beat("b0", 0, 60, ["bg", "card", "label", "glow", "side"], "final-emphasis")],
    });
    expect(specChecks(sp, s).map((i) => i.code)).not.toContain("overlap");
  });

  it("outside_safe_area: layout за безопасной зоной — warning; фон на весь кадр — нет", () => {
    const sp = spec({
      elements: [el("bg", { kind: "shape", entrance: "fade", layout: { x: 0, y: 0, w: 1, h: 1 } }), el("t", { layout: { x: 0.02, y: 0.1, w: 0.3, h: 0.1 } })],
      beats: [beat("b0", 0, 60, ["bg", "t"], "final-emphasis")],
    });
    const r = specChecks(sp, s).filter((i) => i.code === "outside_safe_area");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severity: "warning", area: "t" });
  });

  it("no_emphasis: нет элемента role = emphasis и бита с emphasis/accent — warning", () => {
    const sp = spec({ beats: [beat("b0", 0, 60, ["a"], "title-in")] });
    expect(codes(sp)).toContainEqual(["no_emphasis", "warning"]);
    const byRole = spec({ elements: [el("a", { role: "emphasis" })], beats: [beat("b0", 0, 60, ["a"], "title-in")] });
    expect(codes(byRole).map(([c]) => c)).not.toContain("no_emphasis");
    const byAction = spec({ beats: [beat("b0", 0, 60, ["a"], "accent-pulse")] });
    expect(codes(byAction).map(([c]) => c)).not.toContain("no_emphasis");
  });
});
