// Task 32: сцены плана из ответа Visual Planner — время, кадры, прямоугольник и лицо считает код;
// цитаты и диапазоны — правило «цитата = то, что слышит зритель» (`checkHeardRange`).
import { describe, expect, it } from "vitest";
import { ScenePlanItemSchema } from "@ms/contracts";
import { buildPlanItems } from "../../src/analysis/plan-build.js";
import { ZONE_RECTS } from "../../src/analysis/zones.js";
import { FACE, P, ctx, ev, footage, id, opp, out, quote59, skipOpp, textOf, tl, tlCutting } from "./plan-helpers.js";

describe("buildPlanItems", () => {
  it("время, кадры, прямоугольник зоны и доля лица считает код", () => {
    const r = buildPlanItems(out([opp({ zone: "right_third", composition_mode: "overlay", evidence: [ev(5, 9, quote59)] })]), ctx(tl, FACE));
    expect(r.rejected).toEqual([]);
    const it0 = r.items[0]!;
    expect(ScenePlanItemSchema.safeParse(it0).success).toBe(true);
    expect(it0).toMatchObject({
      id: "sp_001", status: "proposed", origin: "agent", anchor_ids: ["a1"], edited: { start_us: 2_300_000, end_us: 4_800_000 },
      source: { start_us: 3_800_000, end_us: 6_300_000 }, frames: { start: 69, end: 144 }, rect: ZONE_RECTS.right_third, style_id: "sty_1",
    });
    expect(it0.face_overlap.ratio).toBeCloseTo(0.56, 2);
    expect(it0.face_overlap.override_reason).toBeUndefined();
    // ключевое слово — момент начала слова в edited; цитата — edited-диапазон слов без полей
    expect(it0.key_terms).toEqual([{ text: "40%", word_id: id(8), edited_at_us: 3_700_000 }]);
    expect(it0.evidence[0]!.edited).toEqual({ start_us: 2_500_000, end_us: 4_500_000 });
  });

  it("причина агента для лица переносится в override_reason; левая треть лица не задевает", () => {
    const r = buildPlanItems(out([opp({ zone: "right_third", face_override_reason: "показываем предмет в руке" }), opp({ id: "o2", s: 12, e: 15, zone: "left_third", key_terms: [] })]), ctx());
    expect(r.items[0]!.face_overlap.override_reason).toBe("показываем предмет в руке");
    expect(r.items[1]!.face_overlap.ratio).toBe(0);
  });

  it("выдуманная цитата → quote_mismatch; граничное слово вырезано → anchor_in_cut; неизвестное слово, обратный порядок", () => {
    expect(buildPlanItems(out([opp({ evidence: [ev(5, 6, "выдуманная цитата")] })]), ctx()).rejected[0]).toMatchObject({ opp_id: "o1", code: "quote_mismatch" });
    expect(buildPlanItems(out([opp({ s: 3, e: 4, key_terms: [], evidence: [ev(4, 4)] })]), ctx()).rejected[0]!.code).toBe("anchor_in_cut");
    expect(buildPlanItems(out([opp({ evidence: [ev(2, 4)] })]), ctx()).rejected[0]!.code).toBe("anchor_in_cut");
    expect(buildPlanItems(out([{ ...opp(), end_word_id: "w_000099" }]), ctx()).rejected[0]!.code).toBe("unknown_word");
    expect(buildPlanItems(out([opp({ s: 9, e: 5, evidence: [ev(5, 9)] })]), ctx()).rejected[0]!.code).toBe("order");
  });

  it("вырезанное слово внутри диапазона, которого нет в цитате, сцену не портит (I1)", () => {
    const t = tlCutting(7); // «на» вырезано
    const r = buildPlanItems(out([opp({ evidence: [ev(5, 9, "выручка выросла 40% за")] })]), ctx(t));
    expect(r.rejected).toEqual([]);
    expect(buildPlanItems(out([opp({ evidence: [ev(5, 9, quote59)] })]), ctx(t)).rejected[0]!.code).toBe("anchor_in_cut");
  });

  it("число на экране сверяется с цифрами речи (numberMatchesQuote): 45% при «40%» → value_mismatch", () => {
    const bad = buildPlanItems(out([opp({ key_terms: [{ text: "45%", word_id: id(8) }] })]), ctx());
    expect(bad.rejected[0]).toMatchObject({ code: "value_mismatch" });
    expect(buildPlanItems(out([opp({ key_terms: [{ text: "+40 %", word_id: id(8) }] })]), ctx()).rejected).toEqual([]);
  });

  it("ключевое слово вырезано или его нет → отклонено; слово вне диапазона остаётся (blocking в planChecks)", () => {
    expect(buildPlanItems(out([opp({ key_terms: [{ text: "эээ", word_id: id(3) }] })]), ctx()).rejected[0]!.code).toBe("anchor_in_cut");
    expect(buildPlanItems(out([opp({ key_terms: [{ text: "x", word_id: "w_000077" }] })]), ctx()).rejected[0]!.code).toBe("unknown_word");
    expect(buildPlanItems(out([opp({ key_terms: [{ text: "итог", word_id: id(13) }] })]), ctx()).items).toHaveLength(1);
  });

  it("сцена на границе вырезки: поле перед первым словом уходит за склейку — source — образ edited", () => {
    const r = buildPlanItems(out([opp({ s: 4, e: 6, key_terms: [], evidence: [ev(4, 6)] })]), ctx());
    expect(r.rejected).toEqual([]);
    // w4 (3,6–4,0) задет вырезкой 2,2–3,7: слышно 3,7–4,0 → edited 2,2; поле 0,2 с → 2,0 = source 2,0 (до вырезки)
    expect(r.items[0]).toMatchObject({ edited: { start_us: 2_000_000, end_us: 3_600_000 }, source: { start_us: 2_000_000, end_us: 5_100_000 } });
  });

  it("пропуски — с причиной; id сцен по порядку времени; отклонённые не в items", () => {
    const r = buildPlanItems(out([
      opp({ id: "late", s: 12, e: 15, key_terms: [] }), skipOpp("o_skip"), opp({ id: "early" }), opp({ id: "bad", evidence: [ev(5, 6, "нет такого")] }),
    ]), ctx());
    expect(r.items.map((x) => [x.id, x.start_word_id])).toEqual([["sp_001", id(5)], ["sp_002", id(12)]]);
    expect(r.skipped).toEqual([{ anchor_ids: ["a1"], reason: "мысль понятна без графики" }]);
    expect(r.rejected.map((x) => x.opp_id)).toEqual(["bad"]);
    expect(r.opportunities.map((x) => [x.opp_id, x.decision])).toEqual([["late", "plan"], ["o_skip", "skip"], ["early", "plan"], ["bad", "plan"]]);
  });

  it("вертикальный кадр: лицо по центру сверху — top_band поверх лица, нижняя треть свободна", () => {
    const face = { x: 0.25, y: 0.12, w: 0.5, h: 0.28 };
    const r = buildPlanItems(out([opp({ zone: "top_band" }), opp({ id: "o2", s: 12, e: 15, zone: "lower_third", key_terms: [] })]), { ...ctx(), footage: footage(face) });
    expect(r.items[0]!.face_overlap.ratio).toBeGreaterThan(0.2);
    expect(r.items[1]!.face_overlap.ratio).toBe(0);
  });

  it("без лица в кадре доля 0; pad из конфигурации", () => {
    const r = buildPlanItems(out([opp({ zone: "full", composition_mode: "fullscreen" })]), { ...ctx(tl, undefined), cfg: { ...P, padPreUs: 0, padPostUs: 0 } });
    expect(r.items[0]).toMatchObject({ edited: { start_us: 2_500_000, end_us: 4_500_000 }, face_overlap: { ratio: 0 } });
    expect(textOf(5, 9)).toBe(quote59);
  });
});
