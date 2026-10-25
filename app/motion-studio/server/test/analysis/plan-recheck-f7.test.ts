// Task 42, Phase 3 F7: `plan.recheck` пишет `remapped` только сценам, чьё время изменилось.
// Сцена до вырезки (сдвиг 0) в `changed` не попадает — баннер не говорит «пересчитаны» о ней.
import { describe, expect, it } from "vitest";
import { buildPlanItems } from "../../src/analysis/plan-build.js";
import { recheckPlan } from "../../src/analysis/plan-recheck.js";
import { FACE, P, ctx, ev, footage, opp, out, planDoc, tlCutting, words } from "./plan-helpers.js";

const edl2 = { id: "edl_1", revision: 2, hash: "c".repeat(64) };
const f = footage(FACE);
// sp_001 — слова 5–9, sp_002 — слова 12–14; вырезка слова 11 — между ними
const items = buildPlanItems(out([opp(), opp({ id: "o2", s: 12, e: 14, key_terms: [], evidence: [ev(12, 14)] })]), ctx()).items.map((x) => ({ ...x, status: "accepted" as const }));

describe("recheckPlan F7", () => {
  it("вырезка между сценами: сцена до вырезки не в changed, сцена после — remapped со сдвигом", () => {
    const re = recheckPlan(planDoc(items), tlCutting(11), words, f, P, { edl: edl2 });
    expect(re.changed).toEqual([{ item_id: "sp_002", change: "remapped" }]);
    expect(re.doc.items[0]).toMatchObject({ status: "accepted", edited: items[0]!.edited, frames: items[0]!.frames });
    expect(re.doc.items[1]!.edited.start_us).toBeLessThan(items[1]!.edited.start_us);
  });

  it("монтаж не задел ни одну сцену — changed пуст, новой отметки unchanged нет", () => {
    const re = recheckPlan(planDoc(items), tlCutting(20), words, f, P, { edl: edl2 });
    expect(re.changed).toEqual([]);
    expect(re.doc.items.map((x) => x.status)).toEqual(["accepted", "accepted"]);
  });

  it("устаревшая сцена прошла проверку без сдвига — остаётся в changed (статус сменился на proposed)", () => {
    const stale = [{ ...items[0]!, status: "stale" as const, stale_reason: "anchor_cut" as const }, items[1]!];
    const re = recheckPlan(planDoc(stale), tlCutting(20), words, f, P, { edl: edl2 });
    expect(re.changed).toEqual([{ item_id: "sp_001", change: "remapped" }]);
    expect(re.doc.items[0]!.status).toBe("proposed");
  });

  it("восстановление вырезки (как в video-phase3): сцена после неё — remapped со сдвигом назад, сцена до — не в changed", () => {
    const cut = recheckPlan(planDoc(items), tlCutting(11), words, f, P, { edl: edl2 }).doc;
    const re = recheckPlan(cut, tlCutting(20), words, f, P, { edl: { ...edl2, revision: 3 } });
    expect(re.changed).toEqual([{ item_id: "sp_002", change: "remapped" }]);
    expect(re.doc.items[1]!.edited.start_us).toBeGreaterThan(cut.items[1]!.edited.start_us);
    expect(re.doc.items[0]!.edited).toEqual(cut.items[0]!.edited);
  });
});
