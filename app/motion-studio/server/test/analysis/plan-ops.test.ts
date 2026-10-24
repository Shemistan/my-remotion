// Task 32: правка плана пользователем — новая ревизия; `modify` слов пересчитывает времена, `add` —
// сцена пользователя `accepted`; проверки после операций; 409 revision_conflict / resource_busy,
// холостая правка — no_change.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { VisualPlanRevisionDocSchema } from "@ms/contracts";
import { buildPlanItems } from "../../src/analysis/plan-build.js";
import { applyPlanOps, currentPlan, savePlanRevision } from "../../src/analysis/plan-ops.js";
import { ZONE_RECTS } from "../../src/analysis/zones.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as plans from "../../src/db/repos/plans.js";
import { claimNext, enqueue } from "../../src/jobs/queue.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { seedPlanProject } from "./plan-db-helpers.js";
import { FACE, P, ctx, footage, id, opp, out, planDoc, textOf, tl, words } from "./plan-helpers.js";

const pctx = { words, tl, footage: footage(FACE), cfg: P };
const items = buildPlanItems(out([opp(), opp({ id: "o2", s: 12, e: 15, key_terms: [] })]), ctx()).items;
const doc = planDoc(items, { issues: [] });

describe("applyPlanOps", () => {
  it("set_status, modify зоны (прямоугольник и лицо пересчитаны) и причины лица; ревизия +1 с ops", () => {
    const d = applyPlanOps(doc, [
      { op: "set_status", item_id: "sp_001", status: "accepted" },
      { op: "modify", item_id: "sp_002", patch: { zone: "right_third", override_reason: "автор показывает на графику" } },
    ], pctx);
    expect(d).toMatchObject({ revision: 2, parent_revision: 1 });
    expect(d.ops).toHaveLength(2);
    expect(d.items[0]!.status).toBe("accepted");
    expect(d.items[1]).toMatchObject({ zone: "right_third", rect: ZONE_RECTS.right_third, face_overlap: { override_reason: "автор показывает на графику" } });
    expect(d.items[1]!.face_overlap.ratio).toBeCloseTo(0.56, 2);
    expect(d.issues).toContainEqual(expect.objectContaining({ code: "face_overlap", severity: "warning", item_id: "sp_002" }));
    expect(VisualPlanRevisionDocSchema.safeParse(d).success).toBe(true);
  });

  it("modify слов пересчитывает edited/source/кадры; ключевые слова — момент слова", () => {
    const d = applyPlanOps(doc, [{ op: "modify", item_id: "sp_002", patch: { start_word_id: id(11), end_word_id: id(13), key_terms: [{ text: "итог", word_id: id(13) }] } }], pctx);
    // w11 6,4 с → edited 4,9 − 0,2; w13 конец 7,6 → 6,1 + 0,3
    expect(d.items[1]).toMatchObject({ edited: { start_us: 4_700_000, end_us: 6_400_000 }, frames: { start: 141, end: 192 }, key_terms: [{ text: "итог", word_id: id(13), edited_at_us: 5_700_000 }] });
    // цитата прежняя (w12–w15) не покрыта словами сцены — остаётся (обоснование может лежать рядом)
    expect(d.items[1]!.evidence[0]!.quote).toBe(textOf(12, 15));
  });

  it("add — сцена пользователя accepted с цитатой из слов диапазона; id следующий", () => {
    const d = applyPlanOps(doc, [{ op: "add", start_word_id: id(17), end_word_id: id(20), visual_type: "key-point-emphasis", composition_mode: "callout", zone: "left_third", purpose: "подчеркнуть итог" }], pctx);
    expect(d.items[2]).toMatchObject({ id: "sp_003", origin: "user", status: "accepted", anchor_ids: [], evidence: [{ quote: textOf(17, 20), start_word_id: id(17), end_word_id: id(20) }] });
  });

  it("ошибки: неизвестная сцена, слово вырезано, холостая правка, пустой список", () => {
    expect(() => applyPlanOps(doc, [{ op: "set_status", item_id: "sp_404", status: "accepted" }], pctx)).toThrow(/unknown_item/);
    expect(() => applyPlanOps(doc, [{ op: "modify", item_id: "sp_001", patch: { start_word_id: id(3) } }], pctx)).toThrow(/anchor_in_cut/);
    expect(() => applyPlanOps(doc, [{ op: "modify", item_id: "sp_001", patch: { zone: "left_third" } }], pctx)).toThrow(/no_change/);
    expect(() => applyPlanOps(doc, [], pctx)).toThrow(/empty_ops/);
  });

  it("stale(anchor_cut) нельзя принять как есть; после правки слов — снова proposed", () => {
    const st = planDoc([{ ...items[0]!, status: "stale", stale_reason: "timing_changed" }, { ...items[1]!, status: "stale", stale_reason: "anchor_cut" }]);
    expect(applyPlanOps(st, [{ op: "set_status", item_id: "sp_001", status: "accepted" }], pctx).items[0]).toMatchObject({ status: "accepted" });
    expect(applyPlanOps(st, [{ op: "set_status", item_id: "sp_001", status: "accepted" }], pctx).items[0]!.stale_reason).toBeUndefined();
    expect(() => applyPlanOps(st, [{ op: "set_status", item_id: "sp_002", status: "accepted" }], pctx)).toThrow(/item_stale/);
    const fixed = applyPlanOps(st, [{ op: "modify", item_id: "sp_002", patch: { end_word_id: id(14) } }], pctx);
    expect(fixed.items[1]).toMatchObject({ status: "proposed" });
    expect(fixed.items[1]!.stale_reason).toBeUndefined();
    expect(applyPlanOps(st, [{ op: "set_status", item_id: "sp_002", status: "rejected" }], pctx).items[1]).toMatchObject({ status: "rejected" });
  });
});

let s: TestStore;
let db: Db;
let store: ArtifactStore;
beforeAll(async () => {
  s = await makeStore("ms-plan-ops-");
  db = openDb(s.root);
  await migrate(db);
  store = new ArtifactStore({ root: s.root, db, guard: s.guard });
  await seedPlanProject(db, store, s.root, items);
});
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

describe("savePlanRevision", () => {
  const deps = () => ({ db, store, root: s.root, planning: P });
  it("новая ревизия r2 в plan/<id>/r2; base_revision устарел — revision_conflict", async () => {
    const d = await savePlanRevision(deps(), "pln_1", { base_revision: 1, ops: [{ op: "set_status", item_id: "sp_001", status: "accepted" }] });
    expect(d.revision).toBe(2);
    expect(plans.get(db, "pln_1")!.current_revision).toBe(2);
    expect(currentPlan(db, s.root, "pln_1")).toEqual(d);
    expect(plans.scenePlans(db, "pln_1", 2).map((x) => x.status)).toEqual(["accepted", "proposed"]);
    await expect(savePlanRevision(deps(), "pln_1", { base_revision: 1, ops: [{ op: "set_status", item_id: "sp_002", status: "accepted" }] })).rejects.toThrow(/revision_conflict/);
  });

  it("задача держит замок плана — resource_busy, ревизии нет", async () => {
    enqueue(db, { type: "plan.recheck", projectId: "p1", input: { projectId: "p1" }, idempotencyKey: "pr-lock" });
    claimNext(db, "srv", 0, { running: 0, maxRunning: 2 });
    await expect(savePlanRevision(deps(), "pln_1", { base_revision: 2, ops: [{ op: "set_status", item_id: "sp_002", status: "accepted" }] })).rejects.toMatchObject({ code: "resource_busy" });
    expect(plans.get(db, "pln_1")!.current_revision).toBe(2);
  });
});
