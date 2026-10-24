import { describe, expect, it } from "vitest";
import { ApprovalKindSchema, ApprovalSchema, ProjectApprovalsDtoSchema, parseSubjectRef, subjectRef } from "../src/index.js";
import { SHA, TS } from "./video-fixtures.js";

function appr(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "apr_1", project_id: "prj_1", kind: "A", subject_ref: "edl:edl_1@r3", subject_hash: SHA, status: "valid", decided_at: TS, ...over };
}

describe("approvals", () => {
  it("виды", () => {
    expect(ApprovalKindSchema.options).toEqual(["A", "B", "C", "final"]);
  });

  it("Approval: субъект по виду", () => {
    expect(ApprovalSchema.safeParse(appr()).success).toBe(true);
    expect(ApprovalSchema.safeParse(appr({ kind: "B", subject_ref: "plan:pl_1@r1" })).success).toBe(true);
    expect(ApprovalSchema.safeParse(appr({ kind: "A", subject_ref: "plan:pl_1@r1" })).success).toBe(false);
    expect(ApprovalSchema.safeParse(appr({ kind: "B", subject_ref: "edl:edl_1@r1" })).success).toBe(false);
    expect(ApprovalSchema.safeParse(appr({ subject_ref: "edl:edl_1" })).success).toBe(false);
    expect(ApprovalSchema.safeParse(appr({ subject_ref: "edl:edl_1@r0" })).success).toBe(false);
    expect(ApprovalSchema.safeParse(appr({ subject_hash: "abc" })).success).toBe(false);
  });

  it("Approval: причина только у stale и обязательна для stale", () => {
    expect(ApprovalSchema.safeParse(appr({ status: "stale", stale_reason: "subject_changed" })).success).toBe(true);
    expect(ApprovalSchema.safeParse(appr({ status: "stale" })).success).toBe(false);
    expect(ApprovalSchema.safeParse(appr({ status: "valid", stale_reason: "edl_changed" })).success).toBe(false);
    expect(ApprovalSchema.safeParse(appr({ status: "revoked" })).success).toBe(true);
    expect(ApprovalSchema.safeParse(appr({ status: "stale", stale_reason: "whatever" })).success).toBe(false);
  });

  it("subjectRef / parseSubjectRef", () => {
    expect(subjectRef("edl", "edl_1", 3)).toBe("edl:edl_1@r3");
    expect(parseSubjectRef("plan:pl_1@r12")).toEqual({ type: "plan", id: "pl_1", revision: 12 });
    expect(parseSubjectRef("plan:pl_1")).toBeNull();
    expect(() => subjectRef("edl", "edl_1", 0)).toThrow(RangeError);
  });
});

describe("ProjectApprovalsDto", () => {
  it("состояния как у approvalState (Task 24): missing | valid | stale", () => {
    expect(ProjectApprovalsDtoSchema.safeParse({ A: { state: "missing" }, B: { state: "stale", reason: "upstream_A" } }).success).toBe(true);
    expect(ProjectApprovalsDtoSchema.safeParse({ A: { state: "none" }, B: { state: "missing" } }).success).toBe(false);
  });
});
