// Approvals (`05` §7): A — ревизия EDL, B — ревизия плана. Approval валиден, пока субъект
// (ref и canonicalHash документа ревизии) совпадает с текущим. Устаревание пишется в БД и
// назад не откатывается: «переутверждения» нет — только новое решение человека.
import { type Approval, type ApprovalKind, type ApprovalStaleReason, subjectKey } from "@ms/contracts";
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

/** Виды, решения которых действуют на свою область (`subject_key`), а не на весь проект (Р-V4). */
const SCOPED: ReadonlySet<ApprovalKind> = new Set(["C", "final"]);

/** Область C/final: явный ключ или ключ текущего субъекта; A/B — весь проект (`undefined`). */
function scopeOf(kind: ApprovalKind, explicit: string | undefined, ref: string | undefined): string | undefined {
  if (!SCOPED.has(kind)) return undefined;
  return explicit ?? (ref === undefined ? undefined : subjectKey(ref));
}

/**
 * Новое решение `valid`. A и B: все прежние не отозванные (valid и stale) того же вида проекта →
 * `revoked`. C и final: только решения той же области (`scene:<id>`, `timeline:<id>`) — C другой
 * сцены и final другого таймлайна остаются (Р-V4).
 */
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
    approvals.revokeActive(db, input.projectId, input.kind, scopeOf(input.kind, undefined, input.subjectRef));
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
 * C и final — в области `key` (`<type>:<id>`, по умолчанию — область текущего субъекта).
 */
export function approvalState(db: Db, projectId: string, kind: ApprovalKind, current: { ref: string; hash: string } | undefined, key?: string): ApprovalState {
  if (current === undefined) return { state: "missing" };
  return tx(db, () => {
    const a = approvals.latestActive(db, projectId, kind, scopeOf(kind, key, current.ref));
    if (!a) return { state: "missing" };
    if (a.status === "stale") return { state: "stale", approval: a, reason: a.stale_reason };
    if (a.subject_ref === current.ref && a.subject_hash === current.hash) return { state: "valid", approval: a };
    approvals.markStale(db, { id: a.id }, "subject_changed");
    const stale = approvals.get(db, a.id)!;
    return { state: "stale", approval: stale, reason: stale.stale_reason };
  });
}

/**
 * То же, что `approvalState`, только чтение (GET API, Task 29): разошедшийся субъект показывается
 * как `stale(subject_changed)`, но в БД не пишется — запишет следующая мутация или гейт задачи.
 */
export function peekApprovalState(db: Db, projectId: string, kind: ApprovalKind, current: { ref: string; hash: string } | undefined, key?: string): ApprovalState {
  if (current === undefined) return { state: "missing" };
  const a = approvals.latestActive(db, projectId, kind, scopeOf(kind, key, current.ref));
  if (!a) return { state: "missing" };
  if (a.status === "stale") return { state: "stale", approval: a, reason: a.stale_reason };
  if (a.subject_ref === current.ref && a.subject_hash === current.hash) return { state: "valid", approval: a };
  return { state: "stale", approval: { ...a, status: "stale", stale_reason: "subject_changed" }, reason: "subject_changed" };
}

/**
 * Каскад устаревания: смена A (EDL) → валидный B `stale(upstream_A)`; смена StyleBible →
 * B `stale(style_changed)`. Число устаревших.
 */
export function cascadeStale(db: Db, projectId: string, from: "A" | "style"): number {
  return tx(db, () => approvals.markStale(db, { projectId, kind: "B" }, from === "A" ? "upstream_A" : "style_changed"));
}
