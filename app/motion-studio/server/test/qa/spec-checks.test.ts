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
    // плашка бьёт в кадр прихода (152), вспышка — на ней самой
    const sp = handoff(152, 152);
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

  it("реальные spec прогона 3 (Fix C, до проверки): test2 и gen-cache — конфликт, остальные — нет", () => {
    const dir = (f: string) => fileURLToPath(new URL(`../fixtures/specs-run3/${f}`, import.meta.url));
    const st = SettingsSchema.parse(JSON.parse(readFileSync(dir("settings.json"), "utf8")));
    const has = (n: string) => specChecks(MotionSpecSchema.parse(JSON.parse(readFileSync(dir(`${n}.spec.json`), "utf8"))), st).some((i) => i.code === "accent_conflict");
    expect(has("test2")).toBe(true);
    expect(has("gen-cache")).toBe(true);
    for (const n of ["test1", "gen-compare", "gen-timeline"]) expect(has(n), n).toBe(false);
  });
});

describe("accent_conflict: удар акцента посреди полёта импульса", () => {
  const mk = (pulse: [number, number], accentStart: number, action = "hit-return-pulse", to = "client") => {
    const sp = spec({
      beats: [
        beat("graph-in", 0, 40, ["graph", "client"]),
        beat("ret", pulse[0], pulse[1], ["graph", to], action),
        beat("hit", accentStart, 152, ["hit"], "hit-final-emphasis"),
        beat("hold", 152, 180, ["hit", "graph"], "hold"),
      ],
    });
    sp.elements = [
      el("graph", { kind: "graph", entrance: "draw", layout: { x: 0.3, y: 0.1, w: 0.6, h: 0.5 } }),
      el("client", { kind: "card", entrance: "slide", layout: { x: 0.02, y: 0.1, w: 0.2, h: 0.12 } }),
      el("hit", { kind: "card", role: "акцент: попадание", entrance: "pop", layout: { x: 0.02, y: 0.7, w: 0.2, h: 0.1 } }),
    ];
    return sp;
  };
  const conflicts = (sp: MotionSpec, st = s) => specChecks(sp, st).filter((i) => i.code === "accent_conflict");
  const blocking = (sp: MotionSpec, st = s) => conflicts(sp, st).filter((i) => i.severity === "blocking");

  it("импульс летит в сам объект акцента, акцент бьёт до прихода — blocking, подсказка — кадр прихода", () => {
    const [i, ...rest] = blocking(mk([126, 140], 128, "hit-return-pulse", "hit"));
    expect(rest).toEqual([]);
    expect(i?.area).toContain("hit");
    expect(i?.fix_hint).toContain("140");
  });

  it("узел прихода — по flows графа (обратный поток — к from); вложенная подпись узла — тот же объект", () => {
    const sp = mk([126, 140], 128);
    sp.elements[0] = { ...sp.elements[0]!, content: { edges: [{ id: "e1", from: "client", to: "server" }], flows: [{ edge: "e1", direction: "back", beat: "ret" }] } };
    // акцент — подпись внутри карточки client
    sp.elements[2] = { ...sp.elements[2]!, layout: { x: 0.04, y: 0.12, w: 0.1, h: 0.05 } };
    expect(blocking(sp)).toHaveLength(1);
    sp.elements[0] = { ...sp.elements[0]!, content: { edges: [{ id: "e1", from: "client", to: "server" }], flows: [{ edge: "e1", direction: "forward", beat: "ret" }] } };
    expect(blocking(sp)).toEqual([]);
  });

  it("импульс к другому объекту — warning, не blocking (ревью Fix D: ложный blocking валит сцену)", () => {
    const l = conflicts(mk([126, 140], 128));
    expect(l).toEqual([expect.objectContaining({ severity: "warning" })]);
  });

  it("акцент в кадр прихода и позже, импульсы удержания (hold/loop) и входа графа (in/draw) — не конфликт", () => {
    expect(conflicts(mk([126, 140], 140, "hit-return-pulse", "hit"))).toEqual([]);
    expect(conflicts(mk([126, 140], 138, "hit-return-pulse", "hit"))).toEqual([]);
    expect(conflicts(mk([100, 180], 128, "steady-flow-hold", "hit"))).toEqual([]);
    expect(conflicts(mk([100, 150], 128, "flowgraph-in", "hit"))).toEqual([]);
    expect(conflicts(mk([100, 150], 128, "flow-draw", "hit"))).toEqual([]);
  });

  describe("реальные spec", () => {
    const fx = (f: string) => fileURLToPath(new URL(`../fixtures/${f}`, import.meta.url));
    const st = SettingsSchema.parse(JSON.parse(readFileSync(fx("specs-run3/settings.json"), "utf8")));
    const load = (f: string) => MotionSpecSchema.parse(JSON.parse(readFileSync(fx(f), "utf8")));
    const setBeat = (sp: MotionSpec, id: string, over: Partial<MotionSpec["beats"][number]>) => {
      sp.beats = sp.beats.map((b) => (b.id === id ? { ...b, ...over } : b));
      return sp;
    };

    it("проба ревью (gen-compare прогона 3): поток b-micro-releases к «Прод» и удар по «Деплою» монолита — не blocking", () => {
      const sp = setBeat(load("specs-run3/gen-compare.spec.json"), "b-micro-releases", { action: "micro-releases-flow" });
      expect(blocking(sp, st)).toEqual([]);
      expect(conflicts(sp, st)).toEqual([expect.objectContaining({ severity: "warning", area: "b-micro-releases, mono-deploy" })]);
    });

    it("проба ревью (gen-compare прогона 3): title-accent во время входа графа micro-flowgraph-in — не конфликт", () => {
      const sp = setBeat(load("specs-run3/gen-compare.spec.json"), "b-micro-graph", { action: "micro-flowgraph-in" });
      sp.beats.push({ id: "title-accent", start_frame: 40, end_frame: 56, action: "title-accent", description: "проба", element_ids: ["title"] });
      expect(conflicts(sp, st)).toEqual([]);
    });

    it("gen-compare прогона 3: вспышка «Деплоя» сдвинута в полёт импульса к нему (100 < 110) — blocking", () => {
      const sp = setBeat(load("specs-run3/gen-compare.spec.json"), "b-mono-flash", { start_frame: 100 });
      expect(blocking(sp, st)).toEqual([expect.objectContaining({ area: "b-mono-release, mono-deploy" })]);
    });

    it("gen-cache прогона 2: «Попадание» бьёт, пока ответ летит к клиенту — warning, не blocking", () => {
      const sp = load("specs-run2/gen-cache.spec.json");
      expect(blocking(sp, st).filter((i) => i.area?.startsWith("b-hit-return"))).toEqual([]);
      expect(conflicts(sp, st)).toContainEqual(expect.objectContaining({ severity: "warning", area: "b-hit-return, status-hit" }));
    });
  });
});
