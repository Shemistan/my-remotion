// Task 27: Approval A — утверждение ревизии EDL (`05` §7).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acceptedCuts, buildTimeline, type EdlOp } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import { approvalState } from "../../src/approvals/engine.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as approvals from "../../src/db/repos/approvals.js";
import * as projects from "../../src/db/repos/projects.js";
import { approveRoughCut, roughCutApprovalValid } from "../../src/edit/approval-a.js";
import { currentEdl, saveEdlRevision } from "../../src/edit/edl-ops.js";
import { timelineFor } from "../../src/edit/timeline-store.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { F30, dec, seedVideo, w } from "./helpers.js";

let s: TestStore;
let db: Db;
let store: ArtifactStore;
const deps = () => ({ db, store, root: s.root });
const caught = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("ожидалась ошибка");
};
const dur = 10_000_000;
const words = [w("w_000001", "привет", 0, 400_000), w("w_000002", "мир", 500_000, 900_000)];
const acceptAll: EdlOp[] = [{ op: "set_status", decision_id: "d1", status: "accepted" }, { op: "set_status", decision_id: "d2", status: "rejected" }];

beforeEach(async () => {
  s = await makeStore("ms-edit-apr-");
  db = openDb(s.root);
  await migrate(db);
  store = new ArtifactStore({ root: s.root, db, guard: s.guard });
  await seedVideo(db, store, s.root, {
    words,
    decisions: [dec("d1", { source_start_us: 2_000_000, source_end_us: 3_500_000 }), dec("d2", { source_start_us: 5_000_000, source_end_us: 5_500_000 })],
  });
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

describe("approveRoughCut / roughCutApprovalValid", () => {
  it("сценарий плана: proposed_left → утверждение r2 → правка EDL снимает валидность", async () => {
    expect(() => approveRoughCut(db, "p1")).toThrow(/proposed_left/);
    expect(caught(() => approveRoughCut(db, "p1"))).toMatchObject({ code: "proposed_left", count: 2 });
    expect(roughCutApprovalValid(db, "p1")).toBe(false);
    await saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: acceptAll });
    const a = approveRoughCut(db, "p1");
    expect(a.subject_ref).toBe("edl:edl_1@r2");
    expect(a.subject_hash).toBe(canonicalHash(currentEdl(db, s.root, "edl_1")));
    expect(roughCutApprovalValid(db, "p1")).toBe(true);
    await saveEdlRevision(deps(), "edl_1", { base_revision: 2, ops: [{ op: "set_status", decision_id: "d1", status: "rejected" }] });
    expect(roughCutApprovalValid(db, "p1")).toBe(false);
    const currentDoc = currentEdl(db, s.root, "edl_1");
    expect(timelineFor(db, "edl_1")).toEqual(buildTimeline(dur, acceptedCuts(currentDoc), F30));
  });

  it("одна оставшаяся proposed — count 1; добавленная пользователем вырезка сразу accepted", async () => {
    await saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: [{ op: "set_status", decision_id: "d1", status: "accepted" }, { op: "add_cut_range", source_start_us: 7_000_000, source_end_us: 7_500_000 }] });
    expect(caught(() => approveRoughCut(db, "p1"))).toMatchObject({ code: "proposed_left", count: 1 });
  });

  it("переутверждение новой ревизии: прежнее A отозвано, B остаётся stale (автопереноса нет)", async () => {
    await saveEdlRevision(deps(), "edl_1", { base_revision: 1, ops: acceptAll });
    const a1 = approveRoughCut(db, "p1");
    approvals.insert(db, { id: "apr_b", project_id: "p1", kind: "B", subject_ref: "plan:pln_1@r1", subject_hash: a1.subject_hash, status: "valid", decided_at: new Date().toISOString() });
    await saveEdlRevision(deps(), "edl_1", { base_revision: 2, ops: [{ op: "add_cut_range", source_start_us: 7_000_000, source_end_us: 7_500_000 }] });
    const a2 = approveRoughCut(db, "p1");
    expect(a2.subject_ref).toBe("edl:edl_1@r3");
    expect(approvals.get(db, a1.id)!.status).toBe("revoked");
    expect(roughCutApprovalValid(db, "p1")).toBe(true);
    expect(approvalState(db, "p1", "B", { ref: "plan:pln_1@r1", hash: a1.subject_hash })).toMatchObject({ state: "stale", reason: "upstream_A" });
  });

  it("проект без EDL — no_edl", () => {
    projects.create(db, { id: "p2", kind: "video", title: "Пусто" });
    expect(() => approveRoughCut(db, "p2")).toThrow(/no_edl/);
    expect(roughCutApprovalValid(db, "p2")).toBe(false);
  });
});
