// Task 32: Approval B — только при валидном A и входах плана, равных текущим ревизиям; нельзя при
// proposed/stale сценах и blocking-проблемах; смена EDL → B stale(upstream_A), смена стиля → stale(style_changed).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approvalState } from "../../src/approvals/engine.js";
import { currentSubject } from "../../src/approvals/subjects.js";
import { approveVisualPlan } from "../../src/analysis/approval-b.js";
import { buildPlanItems } from "../../src/analysis/plan-build.js";
import { currentPlan, savePlanRevision } from "../../src/analysis/plan-ops.js";
import { recheckPlan } from "../../src/analysis/plan-recheck.js";
import { saveProjectStyle } from "../../src/analysis/project-style.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as edls from "../../src/db/repos/edls.js";
import * as jobsRepo from "../../src/db/repos/jobs.js";
import { approveRoughCut } from "../../src/edit/approval-a.js";
import { saveEdlRevision } from "../../src/edit/edl-ops.js";
import { timelineFor } from "../../src/edit/timeline-store.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { STYLE_BASE, publishPlan, seedPlanProject } from "./plan-db-helpers.js";
import { CUT, FACE, P, SOURCE_US, ctx, footage, opp, out, words } from "./plan-helpers.js";
import { dec, seedVideo } from "../edit/helpers.js";
import { canonicalHash } from "@ms/contracts/canonical";

let s: TestStore;
let db: Db;
let store: ArtifactStore;
beforeAll(async () => {
  s = await makeStore("ms-approval-b-");
  db = openDb(s.root);
  await migrate(db);
  store = new ArtifactStore({ root: s.root, db, guard: s.guard });
});
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

const deps = () => ({ db, store, root: s.root, planning: P });

describe("approveVisualPlan", () => {
  it("цикл: A → proposed (items_unresolved) → принять все → B; EDL изменён → B stale, план устарел; recheck → B; стиль → stale(style_changed)", async () => {
    const items = buildPlanItems(out([opp(), opp({ id: "o2", s: 12, e: 13, key_terms: [] })]), ctx()).items; // покрытие 3,8 из 10,5 с
    await seedPlanProject(db, store, s.root, items);
    expect(() => approveVisualPlan(db, "p1", s.root)).toThrow(/approval_required/);
    approveRoughCut(db, "p1");
    expect(() => approveVisualPlan(db, "p1", s.root)).toThrow(/items_unresolved/);

    await savePlanRevision(deps(), "pln_1", { base_revision: 1, ops: items.map((x) => ({ op: "set_status" as const, item_id: x.id, status: "accepted" as const })) });
    const b = approveVisualPlan(db, "p1", s.root);
    expect(b).toMatchObject({ kind: "B", status: "valid", subject_ref: "plan:pln_1@r2" });

    // EDL изменён после B: A и B устарели; новая ревизия EDL ставит в очередь plan.recheck
    await saveEdlRevision({ db, store, root: s.root }, "edl_1", { base_revision: 1, ops: [{ op: "set_status", decision_id: "d1", status: "rejected" }] });
    expect(approvalState(db, "p1", "B", currentSubject(db, "p1", "B")).state).toBe("stale");
    expect(jobsRepo.list(db, { projectId: "p1" }).filter((j) => j.type === "plan.recheck")).toHaveLength(1);
    approveRoughCut(db, "p1");
    expect(() => approveVisualPlan(db, "p1", s.root)).toThrow(/plan_outdated/); // план построен по EDL r1, A — по r2

    // перепроверка (как plan.recheck) — новая ревизия на EDL r2; переутверждение B
    const cur = currentPlan(db, s.root, "pln_1");
    const re = recheckPlan(cur, timelineFor(db, "edl_1", 2), words, footage(FACE), P, { edl: { id: "edl_1", revision: 2, hash: edls.revision(db, "edl_1", 2)!.hash } });
    await publishPlan(db, store, s.root, re.doc);
    const b2 = approveVisualPlan(db, "p1", s.root);
    expect(b2.subject_ref).toBe("plan:pln_1@r3");

    await saveProjectStyle({ db, store, root: s.root }, "p1", { ...STYLE_BASE, intensity: "calm" }, "user");
    expect(approvalState(db, "p1", "B", currentSubject(db, "p1", "B"))).toMatchObject({ state: "stale", reason: "style_changed" });
    expect(() => approveVisualPlan(db, "p1", s.root)).toThrow(/plan_outdated/); // стиль плана не текущий
  });

  it("overlay на лице без причины и контраст стиля — blocking_issues; правка плана после B делает его stale", async () => {
    const t = await makeStore("ms-approval-b3-");
    const d3 = openDb(t.root);
    try {
      await migrate(d3);
      const st = new ArtifactStore({ root: t.root, db: d3, guard: t.guard });
      const dps = { db: d3, store: st, root: t.root, planning: P };
      const onFace = buildPlanItems(out([opp({ zone: "right_third" })]), ctx()).items; // лицо справа, причины нет
      await seedPlanProject(d3, st, t.root, onFace);
      approveRoughCut(d3, "p1");
      await savePlanRevision(dps, "pln_1", { base_revision: 1, ops: [{ op: "set_status", item_id: "sp_001", status: "accepted" }] });
      expect(() => approveVisualPlan(d3, "p1", t.root)).toThrow(/blocking_issues.*sp_001 face_overlap/);
      // причина лица → warning, B утверждается
      await savePlanRevision(dps, "pln_1", { base_revision: 2, ops: [{ op: "modify", item_id: "sp_001", patch: { override_reason: "автор показывает на график" } }] });
      expect(approveVisualPlan(d3, "p1", t.root).subject_ref).toBe("plan:pln_1@r3");
      // правка плана после B: субъект сменился — B stale(subject_changed)
      await savePlanRevision(dps, "pln_1", { base_revision: 3, ops: [{ op: "modify", item_id: "sp_001", patch: { purpose: "рост выручки" } }] });
      expect(approvalState(d3, "p1", "B", currentSubject(d3, "p1", "B"))).toMatchObject({ state: "stale", reason: "subject_changed" });
      // стиль с нечитаемым текстом — blocking стиля, даже если план чистый и на текущем стиле
      const bad = await saveProjectStyle({ db: d3, store: st, root: t.root }, "p1", { ...STYLE_BASE, palette_overrides: { text: "#333333" } }, "user");
      const cur = currentPlan(d3, t.root, "pln_1");
      await publishPlan(d3, st, t.root, { ...cur, revision: 5, parent_revision: 4, inputs: { ...cur.inputs, style: { id: bad.style_id, revision: bad.revision, hash: canonicalHash(bad) } } });
      expect(() => approveVisualPlan(d3, "p1", t.root)).toThrow(/blocking_issues.*style_contrast/);
    } finally {
      d3.close();
      await removeStore(t);
    }
  });

  it("нет плана — no_plan; повторная ревизия EDL не ставит plan.recheck дважды", async () => {
    const t = await makeStore("ms-approval-b4-");
    const d4 = openDb(t.root);
    try {
      await migrate(d4);
      const st = new ArtifactStore({ root: t.root, db: d4, guard: t.guard });
      await seedVideo(d4, st, t.root, { words, decisions: [dec("d1", { status: "accepted", source_start_us: CUT.start_us, source_end_us: CUT.end_us })], durationUs: SOURCE_US });
      approveRoughCut(d4, "p1");
      expect(() => approveVisualPlan(d4, "p1", t.root)).toThrow(/no_plan/);
      // без плана правка EDL перепроверку не ставит
      await saveEdlRevision({ db: d4, store: st, root: t.root }, "edl_1", { base_revision: 1, ops: [{ op: "set_status", decision_id: "d1", status: "rejected" }] });
      expect(jobsRepo.list(d4, { projectId: "p1" }).filter((j) => j.type === "plan.recheck")).toHaveLength(0);
    } finally {
      d4.close();
      await removeStore(t);
    }
  });

  it("план без сцен (только пропуски с причинами) утверждается — «нет графики» тоже решение", async () => {
    const t = await makeStore("ms-approval-b2-");
    const d2 = openDb(t.root);
    try {
      await migrate(d2);
      const st = new ArtifactStore({ root: t.root, db: d2, guard: t.guard });
      await seedPlanProject(d2, st, t.root, []);
      approveRoughCut(d2, "p1");
      expect(approveVisualPlan(d2, "p1", t.root).subject_ref).toBe("plan:pln_1@r1");
    } finally {
      d2.close();
      await removeStore(t);
    }
  });
});
