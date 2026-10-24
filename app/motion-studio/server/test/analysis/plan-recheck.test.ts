// Task 32: перепроверка плана на новой ревизии EDL без LLM — вырезано слово цитаты → stale(anchor_cut),
// длительность изменилась > 20 % → stale(timing_changed), иначе новые времена и прежний статус.
import { describe, expect, it } from "vitest";
import { VisualPlanRevisionDocSchema, buildTimeline, mapWords } from "@ms/contracts";
import { F30 } from "../edit/helpers.js";
import { buildPlanItems } from "../../src/analysis/plan-build.js";
import { recheckPlan } from "../../src/analysis/plan-recheck.js";
import { FACE, P, ctx, ev, footage, id, opp, out, planDoc, tl, tlCutting, words } from "./plan-helpers.js";

const edl2 = { id: "edl_1", revision: 2, hash: "c".repeat(64) };
const f = footage(FACE);

describe("recheckPlan", () => {
  const items = buildPlanItems(out([opp(), opp({ id: "o2", s: 12, e: 14, key_terms: [], evidence: [ev(12, 14)] })]), ctx()).items;

  it("якорь вырезан после плана → stale(anchor_cut); остальные пересчитаны (remapped)", () => {
    const re = recheckPlan(planDoc(items), tlCutting(13), words, f, P, { edl: edl2 });
    expect(re.changed).toEqual([{ item_id: "sp_001", change: "remapped" }, { item_id: "sp_002", change: "anchor_cut" }]);
    expect(re.doc.items[1]).toMatchObject({ status: "stale", stale_reason: "anchor_cut" });
    expect(re.doc.items[0]).toMatchObject({ status: "proposed", edited: items[0]!.edited });
    expect(re.doc).toMatchObject({ revision: 2, parent_revision: 1, inputs: { edl: edl2 } });
    expect(re.doc.ops).toBeUndefined();
    expect(VisualPlanRevisionDocSchema.safeParse(re.doc).success).toBe(true);
  });

  it("вырезка раньше сцены сдвигает её время без устаревания; статус accepted сохраняется", () => {
    const acc = items.map((x) => ({ ...x, status: "accepted" as const }));
    const re = recheckPlan(planDoc(acc), tlCutting(4), words, f, P, { edl: edl2 }); // w4 вырезано целиком: слышимые 3,7–4,0 с ушли — всё после на 0,3 с раньше
    expect(re.changed.map((c) => c.change)).toEqual(["remapped", "remapped"]);
    expect(re.doc.items[0]!.status).toBe("accepted");
    expect(re.doc.items[0]!.edited.start_us).toBe(items[0]!.edited.start_us - 300_000);
    expect(re.doc.items[0]!.frames.start).toBe(Math.floor(((items[0]!.edited.start_us - 300_000) * 30) / 1e6));
    expect(re.doc.items[0]!.key_terms[0]!.edited_at_us).toBe(items[0]!.key_terms[0]!.edited_at_us - 300_000);
  });

  it("вырезанное слово внутри сцены, которого нет в цитатах, — не anchor_cut; длительность −24 % → stale(timing_changed)", () => {
    const long = buildPlanItems(out([opp({ s: 12, e: 18, key_terms: [], evidence: [ev(12, 13)] })]), ctx()).items;
    const re = recheckPlan(planDoc(long), tlCutting(15, 16), words, f, P, { edl: edl2 });
    expect(re.changed).toEqual([{ item_id: "sp_001", change: "timing_changed" }]);
    expect(re.doc.items[0]).toMatchObject({ status: "stale", stale_reason: "timing_changed" });
    const dur = (x: { edited: { start_us: number; end_us: number } }) => x.edited.end_us - x.edited.start_us;
    expect(dur(re.doc.items[0]!)).toBe(dur(long[0]!) - 800_000);
  });

  it("отклонённые сцены не перепроверяются и не попадают в changed; на том же EDL — всё remapped без изменений", () => {
    const rej = [{ ...items[0]!, status: "rejected" as const }, items[1]!];
    const re = recheckPlan(planDoc(rej), tl, words, f, P, { edl: edl2 });
    expect(re.changed).toEqual([{ item_id: "sp_002", change: "remapped" }]);
    expect(re.doc.items[1]!.edited).toEqual(items[1]!.edited);
  });

  it("граничное слово задето вырезкой частично (clipped) — не anchor_cut: сцена пересчитана", () => {
    const w12 = { start_us: 6_800_000, end_us: 7_200_000 };
    const t = buildTimeline(12_000_000, [{ start_us: 2_200_000, end_us: 3_700_000 }, { start_us: w12.start_us, end_us: w12.start_us + 100_000 }], F30);
    expect(mapWords(t, words)[id(12)]!.state).toBe("clipped");
    const re = recheckPlan(planDoc(items), t, words, f, P, { edl: edl2 });
    expect(re.changed).toEqual([{ item_id: "sp_001", change: "remapped" }, { item_id: "sp_002", change: "remapped" }]);
    expect(re.doc.items[1]!.status).toBe("proposed");
  });

  it("stale-сцена, прошедшая перепроверку, снова proposed (решение за человеком); цитата на вырезанном → anchor_cut", () => {
    const st = planDoc([{ ...items[0]!, status: "stale", stale_reason: "anchor_cut" }, items[1]!]);
    const re = recheckPlan(st, tl, words, f, P, { edl: edl2 });
    expect(re.doc.items[0]).toMatchObject({ status: "proposed" });
    expect(re.doc.items[0]!.stale_reason).toBeUndefined();
    // вырезано слово цитаты внутри сцены (не граничное) — опора на вырезанное
    expect(recheckPlan(planDoc(items), tlCutting(7), words, f, P, { edl: edl2 }).changed[0]).toEqual({ item_id: "sp_001", change: "anchor_cut" });
  });

  it("слово удалено правкой транскрипта → stale(anchor_cut)", () => {
    const re = recheckPlan(planDoc(items), tl, words.filter((w) => w.id !== id(14)), f, P, { edl: edl2 });
    expect(re.changed[1]).toEqual({ item_id: "sp_002", change: "anchor_cut" });
  });
});
