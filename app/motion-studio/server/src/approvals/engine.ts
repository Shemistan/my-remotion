// Approvals (`05` §7): A — ревизия EDL, B — ревизия плана. Approval валиден, пока субъект
// (ref и canonicalHash документа ревизии) совпадает с текущим. Устаревание пишется в БД и
// назад не откатывается: «переутверждения» нет — только новое решение человека.
import type { Approval, ApprovalKind, ApprovalStaleReason } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as approvals from "../db/repos/approvals.js";
import { nowIso } from "../db/repos/util.js";
import { tx } from "../db/tx.js";
import { newId } from "../scenes/ids.js";

export interface ApprovalInput {
  projectId: string;
  kind: ApprovalKind;
  subjectRef: string;
  subjectHash: string;
}

/** Новое решение `valid`; прежние `valid` того же вида проекта → `revoked`. */
export function approve(db: Db, input: ApprovalInput): Approval {
  return tx(db, () => {
    const a: Approval = {
      id: newId("apr"),
      project_id: input.projectId,
      kind: input.kind,
      subject_ref: input.subjectRef,
      subject_hash: input.subjectHash,
      status: "valid",
      decided_at: nowIso(),
    };
    approvals.revokeValid(db, input.projectId, input.kind);
    approvals.insert(db, a); // схема проверяет тип субъекта и хеш; сбой откатывает и отзыв
    return approvals.get(db, a.id)!;
  });
}

export interface ApprovalState {
  state: "missing" | "valid" | "stale";
  approval?: Approval;
  reason?: ApprovalStaleReason;
}

/**
 * Состояние approval вида `kind` относительно текущего субъекта. Нет субъекта или решения —
 * `missing`. Валидное решение с другим `ref`/`hash` → `stale(subject_changed)`, записывается в БД.
 */
export function approvalState(db: Db, projectId: string, kind: ApprovalKind, current: { ref: string; hash: string } | undefined): ApprovalState {
  if (current === undefined) return { state: "missing" };
  return tx(db, () => {
    const a = approvals.latestActive(db, projectId, kind);
    if (!a) return { state: "missing" };
    if (a.status === "stale") return { state: "stale", approval: a, reason: a.stale_reason };
    if (a.subject_ref === current.ref && a.subject_hash === current.hash) return { state: "valid", approval: a };
    approvals.markStale(db, { id: a.id }, "subject_changed");
    const stale = approvals.get(db, a.id)!;
    return { state: "stale", approval: stale, reason: stale.stale_reason };
  });
}

/**
 * Каскад устаревания: смена A (EDL) → валидный B `stale(upstream_A)`; смена StyleBible →
 * B `stale(style_changed)`. Число устаревших.
 */
export function cascadeStale(db: Db, projectId: string, from: "A" | "style"): number {
  return tx(db, () => approvals.markStale(db, { projectId, kind: "B" }, from === "A" ? "upstream_A" : "style_changed"));
}
