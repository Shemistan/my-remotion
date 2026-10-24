// Task 32: проверки плана — лицо, пересечения, плотность, fullscreen, промежутки, длительность,
// ключевые слова вне сцены, занятые руками зоны, план без сцен.
import { describe, expect, it } from "vitest";
import { buildPlanItems } from "../../src/analysis/plan-build.js";
import { planChecks } from "../../src/analysis/plan-checks.js";
import { ZONE_RECTS } from "../../src/analysis/zones.js";
import { FACE, P, ctx, footage, id, opp, out, sc, tl, win } from "./plan-helpers.js";

const c60 = { editedDurationUs: 60_000_000, cfg: P };
const blocking = (xs: ReturnType<typeof planChecks>) => xs.filter((i) => i.severity === "blocking");

describe("planChecks", () => {
  const items = buildPlanItems(out([opp({ zone: "right_third", composition_mode: "overlay" })]), ctx(tl, FACE)).items;

  it("overlay поверх лица без причины — blocking face_overlap; с причиной — warning; левая треть — чисто", () => {
    expect(planChecks(items, c60)).toContainEqual(expect.objectContaining({ code: "face_overlap", severity: "blocking", item_id: "sp_001" }));
    expect(planChecks([{ ...items[0]!, face_overlap: { ratio: 0.56, override_reason: "показываем предмет в руке автора" } }], c60).find((i) => i.code === "face_overlap")!.severity).toBe("warning");
    expect(blocking(planChecks([{ ...items[0]!, zone: "left_third", rect: ZONE_RECTS.left_third, face_overlap: { ratio: 0 } }], c60))).toEqual([]);
  });

  it("callout и pip — тоже; fullscreen и split лицо не проверяют (автор не центр по решению)", () => {
    for (const m of ["callout", "pip"] as const) expect(blocking(planChecks([{ ...items[0]!, composition_mode: m }], c60)).map((i) => i.code)).toEqual(["face_overlap"]);
    for (const m of ["fullscreen", "split_screen"] as const) expect(blocking(planChecks([{ ...items[0]!, composition_mode: m }], c60))).toEqual([]);
  });

  it("покрытие > maxCoverage — blocking density; fullscreen+split > maxFullscreenCoverage — warning", () => {
    expect(planChecks([sc(0, 10e6), sc(12e6, 20e6), sc(30e6, 39e6)], c60)).toContainEqual(expect.objectContaining({ code: "density", severity: "blocking" })); // 27/60 = 0.45 > 0.4
    expect(planChecks([sc(0, 10e6), sc(12e6, 20e6)], c60).find((i) => i.code === "density")).toBeUndefined();
    const fs = planChecks([sc(0, 10e6, { composition_mode: "fullscreen", zone: "full" }), sc(20e6, 26e6, { composition_mode: "split_screen", zone: "split_left" })], c60);
    expect(fs).toContainEqual(expect.objectContaining({ code: "fullscreen_heavy", severity: "warning" }));
  });

  it("отклонённые сцены в покрытие и пересечения не входят", () => {
    expect(blocking(planChecks([sc(0, 10e6), sc(12e6, 20e6), sc(30e6, 39e6, { status: "rejected" })], c60))).toEqual([]);
    expect(blocking(planChecks([sc(10e6, 20e6), sc(19e6, 25e6, { status: "rejected" })], c60))).toEqual([]);
  });

  it("промежуток < minGapUs — tight_gap; пересечение — blocking scene_overlap; коротко/длинно — warning", () => {
    expect(planChecks([sc(10e6, 20e6), sc(21e6, 25e6)], c60)).toContainEqual(expect.objectContaining({ code: "tight_gap" }));
    expect(planChecks([sc(10e6, 20e6), sc(19e6, 25e6)], c60)).toContainEqual(expect.objectContaining({ code: "scene_overlap", severity: "blocking" }));
    expect(planChecks([sc(10e6, 11e6)], c60)).toContainEqual(expect.objectContaining({ code: "too_short", severity: "warning" }));
    expect(planChecks([sc(10e6, 23e6)], c60)).toContainEqual(expect.objectContaining({ code: "too_long", severity: "warning" }));
  });

  it("ключевое слово вне сцены — blocking key_term_outside", () => {
    const x = sc(2e6, 4e6, { key_terms: [{ text: "итог", word_id: id(13), edited_at_us: 5_700_000 }] });
    expect(planChecks([x], c60)).toContainEqual(expect.objectContaining({ code: "key_term_outside", severity: "blocking" }));
  });

  it("лицо по центру и жесты: зона, занятая руками в окне сцены, — warning zone_occupied; в окне без жестов — чисто", () => {
    const face = { x: 0.4, y: 0.1, w: 0.2, h: 0.35 };
    const hands = { x: 0.05, y: 0.55, w: 0.9, h: 0.45 };
    const f = footage(face, { windows: [win(0, 6_000_000, [face, hands]), win(6_000_000, 12_000_000, [face])] });
    const r = buildPlanItems(out([opp({ zone: "lower_third" }), opp({ id: "o2", s: 12, e: 15, zone: "lower_third", key_terms: [] })]), { ...ctx(), footage: f });
    const issues = planChecks(r.items, { ...c60, footage: f });
    expect(issues.filter((i) => i.code === "zone_occupied").map((i) => [i.item_id, i.severity])).toEqual([["sp_001", "warning"]]);
    expect(blocking(issues)).toEqual([]);
  });

  it("план без сцен — warning no_scenes, не blocking", () => {
    expect(planChecks([], c60)).toEqual([expect.objectContaining({ code: "no_scenes", severity: "warning" })]);
  });
});
