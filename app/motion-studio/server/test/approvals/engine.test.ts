// Task 24: approvals (`05` §7) — A по ревизии EDL, B по ревизии плана; устаревание и каскад.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonicalHash } from "@ms/contracts/canonical";
import { approvalState, approve, cascadeStale } from "../../src/approvals/engine.js";
import { currentSubject } from "../../src/approvals/subjects.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as approvals from "../../src/db/repos/approvals.js";
import * as edls from "../../src/db/repos/edls.js";
import * as media from "../../src/db/repos/media.js";
import * as plans from "../../src/db/repos/plans.js";
import * as projects from "../../src/db/repos/projects.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { SHA, asset } from "../db/video-fixtures.js";

const h = (v: unknown) => canonicalHash(v);
let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-approvals-");
  db = openDb(s.root);
  migrate(db);
  projects.create(db, { id: "p1", kind: "video", title: "Видео" });
  projects.create(db, { id: "p2", kind: "video", title: "Другое" });
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

describe("approve / approvalState / cascadeStale", () => {
  it("сценарий плана: A валиден, смена субъекта → stale(subject_changed), каскад на B", () => {
    approve(db, { projectId: "p1", kind: "A", subjectRef: "edl:edl_1@r2", subjectHash: h("h2") });
    expect(approvalState(db, "p1", "A", { ref: "edl:edl_1@r2", hash: h("h2") }).state).toBe("valid");
    approve(db, { projectId: "p1", kind: "B", subjectRef: "plan:pln_1@r1", subjectHash: h("p1h") });
    expect(approvalState(db, "p1", "A", { ref: "edl:edl_1@r3", hash: h("h3") })).toMatchObject({ state: "stale", reason: "subject_changed" });
    expect(cascadeStale(db, "p1", "A")).toBe(1);
    expect(approvalState(db, "p1", "B", { ref: "plan:pln_1@r1", hash: h("p1h") })).toMatchObject({ state: "stale", reason: "upstream_A" });
    expect(approvalState(db, "p1", "A", undefined).state).toBe("missing");
    // устаревание записано в БД, а не только вычислено
    expect(approvals.list(db, "p1").map((a) => [a.kind, a.status, a.stale_reason])).toEqual([["A", "stale", "subject_changed"], ["B", "stale", "upstream_A"]]);
  });

  it("нет approval — missing; тот же ref с другим хешем — stale", () => {
    expect(approvalState(db, "p1", "A", { ref: "edl:edl_1@r1", hash: h(1) })).toEqual({ state: "missing" });
    approve(db, { projectId: "p1", kind: "A", subjectRef: "edl:edl_1@r1", subjectHash: h(1) });
    expect(approvalState(db, "p1", "A", { ref: "edl:edl_1@r1", hash: h(2) })).toMatchObject({ state: "stale", reason: "subject_changed" });
    // stale не возвращается в valid сам: «переутверждения» нет
    expect(approvalState(db, "p1", "A", { ref: "edl:edl_1@r1", hash: h(1) })).toMatchObject({ state: "stale" });
  });

  it("повторное утверждение того же kind отзывает прежнее valid; stale остаётся stale", () => {
    const a1 = approve(db, { projectId: "p1", kind: "A", subjectRef: "edl:edl_1@r1", subjectHash: h(1) });
    const a2 = approve(db, { projectId: "p1", kind: "A", subjectRef: "edl:edl_1@r2", subjectHash: h(2) });
    expect(approvals.get(db, a1.id)!.status).toBe("revoked");
    expect(approvalState(db, "p1", "A", { ref: "edl:edl_1@r2", hash: h(2) })).toMatchObject({ state: "valid", approval: a2 });
    approvalState(db, "p1", "A", { ref: "edl:edl_1@r3", hash: h(3) }); // → stale
    const a3 = approve(db, { projectId: "p1", kind: "A", subjectRef: "edl:edl_1@r3", subjectHash: h(3) });
    expect(approvals.get(db, a2.id)).toMatchObject({ status: "stale", stale_reason: "subject_changed" });
    expect(approvalState(db, "p1", "A", { ref: "edl:edl_1@r3", hash: h(3) })).toMatchObject({ state: "valid", approval: a3 });
  });

  it("каскад style → B stale(style_changed); только свой проект; без валидного B — 0", () => {
    approve(db, { projectId: "p1", kind: "B", subjectRef: "plan:pln_1@r1", subjectHash: h(1) });
    approve(db, { projectId: "p2", kind: "B", subjectRef: "plan:pln_2@r1", subjectHash: h(1) });
    expect(cascadeStale(db, "p1", "style")).toBe(1);
    expect(cascadeStale(db, "p1", "style")).toBe(0);
    expect(approvalState(db, "p1", "B", { ref: "plan:pln_1@r1", hash: h(1) })).toMatchObject({ state: "stale", reason: "style_changed" });
    expect(approvalState(db, "p2", "B", { ref: "plan:pln_2@r1", hash: h(1) }).state).toBe("valid");
  });

  it("субъект не того типа — отказ схемы (A — только edl:…)", () => {
    expect(() => approve(db, { projectId: "p1", kind: "A", subjectRef: "plan:pln_1@r1", subjectHash: h(1) })).toThrow();
    expect(approvals.list(db, "p1")).toEqual([]);
  });
});

describe("currentSubject", () => {
  it("A — текущая ревизия EDL, B — текущая ревизия плана; нет — undefined", () => {
    expect(currentSubject(db, "p1", "A")).toBeUndefined();
    expect(currentSubject(db, "p1", "B")).toBeUndefined();
    media.insert(db, asset());
    transcripts.create(db, { id: "trn_1", project_id: "p1", media_id: "med_1", language: "ru" });
    edls.create(db, { id: "edl_1", project_id: "p1", media_id: "med_1", transcript_id: "trn_1" });
    const doc = (revision: number) => ({
      schema_version: 1 as const, edl_id: "edl_1", revision, media_id: "med_1", media_sha256: SHA, transcript_id: "trn_1",
      timeline_fps: { num: 30, den: 1 }, decisions: [],
    });
    const tl = { fps: { num: 30, den: 1 }, source_duration_us: 1, duration_us: 1, clips: [] };
    edls.insertRevision(db, { doc: doc(1), rel_path: "r1", sha256: SHA, hash: h(doc(1)), timeline: tl });
    edls.insertRevision(db, { doc: { ...doc(2), parent_revision: 1 }, rel_path: "r2", sha256: SHA, hash: h(doc(2)), timeline: tl });
    expect(currentSubject(db, "p1", "A")).toEqual({ ref: "edl:edl_1@r2", hash: h(doc(2)) });
    plans.create(db, { id: "pln_1", project_id: "p1" });
    plans.insertRevision(db, { plan_id: "pln_1", revision: 1, rel_path: "p", sha256: SHA, hash: h("plan"), items: [], opportunities: [] });
    expect(currentSubject(db, "p1", "B")).toEqual({ ref: "plan:pln_1@r1", hash: h("plan") });
    expect(currentSubject(db, "p2", "A")).toBeUndefined();
  });
});
