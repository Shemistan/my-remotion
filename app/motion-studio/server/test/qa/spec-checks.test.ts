// Проверки спецификации до рендера: одинаковые входы, перекрытия, safe area, акцент.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Element, type MotionSpec, MotionSpecSchema, SettingsSchema } from "@ms/contracts";
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

  it("layout — доли safe area: элемент у края safe area (x = 0, w = 1) — не выход", () => {
    const sp = spec({
      elements: [el("bg", { kind: "shape", entrance: "fade", layout: { x: 0, y: 0, w: 1, h: 1 } }), el("t", { layout: { x: 0, y: 0, w: 0.4, h: 0.05 } }), el("c", { kind: "chart", entrance: "draw", layout: { x: 0, y: 0.36, w: 1, h: 0.62 } })],
      beats: [beat("b0", 0, 60, ["bg", "t", "c"], "final-emphasis")],
    });
    expect(specChecks(sp, s).map((i) => i.code)).not.toContain("outside_safe_area");
  });

  it("outside_safe_area: x + w > 1 в долях safe area (spec в обход схемы) — warning", () => {
    const sp = spec({ elements: [el("t", { layout: { x: 0.8, y: 0.1, w: 0.3, h: 0.1 } })], beats: [beat("b0", 0, 60, ["t"], "final-emphasis")] });
    const r = specChecks(sp, s).filter((i) => i.code === "outside_safe_area");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severity: "warning", area: "t" });
    expect(r[0]!.fix_hint).toContain("доли safe area");
  });

  it("реальные spec среза (docs/evidence/phase-1/slice) — без outside_safe_area и overlap", () => {
    for (const t of ["test1", "test2"]) {
      const dir = fileURLToPath(new URL(`../../../../../docs/evidence/phase-1/slice/${t}/`, import.meta.url));
      const sp = MotionSpecSchema.parse(JSON.parse(readFileSync(`${dir}spec.json`, "utf8")));
      const st = SettingsSchema.parse(JSON.parse(readFileSync(`${dir}manifest.json`, "utf8")).settings);
      const codes = specChecks(sp, st).map((i) => i.code);
      expect(codes, t).not.toContain("outside_safe_area");
      expect(codes, t).not.toContain("overlap");
    }
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

describe("accent_conflict: два акцента в один момент", () => {
  /** Узел user вспыхивает по приходу импульса бита pulse (кончается в `arrive`), плашка — акцент своего бита. */
  function handoff(arrive: number, emphStart: number, flashOn: string | string[] = "e-req (back, pulse)"): MotionSpec {
    const beats = [
      beat("graph-in", 0, 40, ["graph", "user", "orc"]),
      beat("pulse", arrive - 18, arrive, ["graph", "user", "orc"], "pulse-answer-back"),
      beat("answer", emphStart, Math.min(180, emphStart + 10), ["answer"], "answer-in-emphasis"),
      beat("hold", Math.min(179, emphStart + 10), 180, ["answer", "graph"], "final-emphasis-hold"),
    ];
    const sp = spec({ beats });
    sp.duration_frames = 180;
    sp.elements = [
      el("graph", { kind: "graph", entrance: "draw", content: {}, layout: { x: 0.3, y: 0.1, w: 0.6, h: 0.5 } }),
      el("user", { kind: "card", entrance: "slide", content: { flash_on: flashOn }, layout: { x: 0.02, y: 0.1, w: 0.2, h: 0.12 } }),
      el("orc", { kind: "card", entrance: "pop", content: {}, layout: { x: 0.4, y: 0.2, w: 0.2, h: 0.12 } }),
      el("answer", { kind: "card", role: "акцент: итог", entrance: "scale", content: {}, layout: { x: 0.02, y: 0.7, w: 0.2, h: 0.1 } }),
    ];
    return sp;
  }
  const conflict = (sp: MotionSpec) => specChecks(sp, s).find((i) => i.code === "accent_conflict");

  it("вспышка узла по приходу импульса и Emphasis другого объекта перекрываются — blocking", () => {
    const i = conflict(handoff(152, 148));
    expect(i).toMatchObject({ severity: "blocking" });
    expect(i?.area).toContain("user");
    expect(i?.area).toContain("answer");
    expect(i?.fix_hint).toMatch(/flash_on/);
  });

  it("flash_on только с id ребра: бит импульса — бит с узлом и действием pulse", () => {
    expect(conflict(handoff(152, 148, "e-req"))).toBeDefined();
  });

  it("акцент стартует после того, как вспышка погасла — нет конфликта", () => {
    expect(conflict(handoff(120, 150))).toBeUndefined();
  });

  it("вспышка на самом объекте акцента и веер вспышек по узлам — не конфликт", () => {
    const sp = handoff(152, 148);
    sp.elements = sp.elements.map((e) => (e.id === "user" ? { ...e, content: {} } : e.id === "answer" ? { ...e, content: { flash_on: "e-req (back, pulse)" } } : e));
    expect(conflict(sp)).toBeUndefined();
    const fan = handoff(120, 160);
    fan.elements = fan.elements.map((e) => (e.id === "orc" ? { ...e, content: { flash_on: "e-req (back, pulse)" } } : e));
    expect(conflict(fan)).toBeUndefined();
  });

  it("два Emphasis на разных объектах с перекрытыми битами — blocking; передача без перекрытия — нет", () => {
    const two = (bStart: number) => {
      const sp = spec({ beats: [beat("a", 60, 100, ["x"], "x-emphasis"), beat("b", bStart, 140, ["y"], "y-accent")] });
      sp.elements = [el("x", { role: "акцент: первое", layout: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } }), el("y", { role: "акцент: второе", entrance: "fade", layout: { x: 0.5, y: 0.1, w: 0.2, h: 0.1 } })];
      return sp;
    };
    expect(conflict(two(90))).toMatchObject({ severity: "blocking" });
    expect(conflict(two(100))).toBeUndefined();
  });

  it("реальные spec прогона 3: test2 и gen-cache — конфликт, остальные — нет", () => {
    const at = (n: string) => MotionSpecSchema.parse(JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../../docs/evidence/phase-1/pipeline/${n}/spec.json`, import.meta.url)), "utf8")));
    const st = (n: string) => SettingsSchema.parse(JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../../docs/evidence/phase-1/pipeline/${n}/manifest.json`, import.meta.url)), "utf8")).settings);
    const has = (n: string) => specChecks(at(n), st(n)).some((i) => i.code === "accent_conflict");
    expect(has("test2")).toBe(true);
    expect(has("gen-cache")).toBe(true);
    for (const n of ["test1", "gen-compare", "gen-timeline"]) expect(has(n), n).toBe(false);
  });
});
