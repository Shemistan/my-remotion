import { ApprovalSchema, type Approval, type ApprovalKind, type ApprovalStaleReason, type ApprovalStatus, subjectKey } from "@ms/contracts";
import type { Db } from "../open.js";

interface Raw {
  id: string; project_id: string; kind: ApprovalKind; subject_ref: string; subject_hash: string;
  status: ApprovalStatus; stale_reason: ApprovalStaleReason | null; decided_at: string;
  /** 006: область решения `<type>:<id>` (выводится из `subject_ref`, в контракт не входит). */
  subject_key?: string;
}

const row = (r: Raw): Approval => ApprovalSchema.parse({
  id: r.id, project_id: r.project_id, kind: r.kind, subject_ref: r.subject_ref, subject_hash: r.subject_hash, status: r.status,
  ...(r.stale_reason === null ? {} : { stale_reason: r.stale_reason }), decided_at: r.decided_at,
});

export function insert(db: Db, a: Approval): void {
  const v = ApprovalSchema.parse(a);
  db.prepare("INSERT INTO approvals (id, project_id, kind, subject_ref, subject_key, subject_hash, status, stale_reason, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(v.id, v.project_id, v.kind, v.subject_ref, subjectKey(v.subject_ref), v.subject_hash, v.status, v.stale_reason ?? null, v.decided_at);
}

export function get(db: Db, id: string): Approval | undefined {
  const r = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as Raw | undefined;
  return r && row(r);
}

/** Approvals проекта по времени решения (фильтр по виду — опционально). */
export function list(db: Db, projectId: string, kind?: ApprovalKind): Approval[] {
  const rows = kind === undefined
    ? db.prepare("SELECT * FROM approvals WHERE project_id = ? ORDER BY decided_at, rowid").all(projectId)
    : db.prepare("SELECT * FROM approvals WHERE project_id = ? AND kind = ? ORDER BY decided_at, rowid").all(projectId, kind);
  return (rows as Raw[]).map(row);
}

/**
 * Последнее не отозванное решение вида `kind` (valid или stale) — по порядку вставки
 * (rowid), а не по `decided_at`: часы машины могут идти назад. `subjectKey` (C, final, Р-V4) —
 * только решения этой области (`scene:<id>`, `timeline:<id>`).
 */
export function latestActive(db: Db, projectId: string, kind: ApprovalKind, subjectKey?: string): Approval | undefined {
  const r = (subjectKey === undefined
    ? db.prepare("SELECT * FROM approvals WHERE project_id = ? AND kind = ? AND status != 'revoked' ORDER BY rowid DESC LIMIT 1").get(projectId, kind)
    : db.prepare("SELECT * FROM approvals WHERE project_id = ? AND kind = ? AND subject_key = ? AND status != 'revoked' ORDER BY rowid DESC LIMIT 1")
      .get(projectId, kind, subjectKey)) as Raw | undefined;
  return r && row(r);
}

/** Все не отозванные (valid и stale) вида `kind` проекта (или только области `subjectKey`) → revoked; число отозванных. */
export function revokeActive(db: Db, projectId: string, kind: ApprovalKind, subjectKey?: string): number {
  return subjectKey === undefined
    ? db.prepare("UPDATE approvals SET status = 'revoked', stale_reason = NULL WHERE project_id = ? AND kind = ? AND status != 'revoked'")
      .run(projectId, kind).changes
    : db.prepare("UPDATE approvals SET status = 'revoked', stale_reason = NULL WHERE project_id = ? AND kind = ? AND subject_key = ? AND status != 'revoked'")
      .run(projectId, kind, subjectKey).changes;
}

/** valid → stale(reason): по id или для всех valid вида `kind` проекта; число изменённых. */
export function markStale(db: Db, where: { id: string } | { projectId: string; kind: ApprovalKind }, reason: ApprovalStaleReason): number {
  if ("id" in where) {
    return db.prepare("UPDATE approvals SET status = 'stale', stale_reason = ? WHERE id = ? AND status = 'valid'").run(reason, where.id).changes;
  }
  return db.prepare("UPDATE approvals SET status = 'stale', stale_reason = ? WHERE project_id = ? AND kind = ? AND status = 'valid'")
    .run(reason, where.projectId, where.kind).changes;
}

/** Отзыв решения человеком (`POST /approvals/:id/revoke`): valid/stale → revoked; число изменённых. */
export function revoke(db: Db, id: string): number {
  return db.prepare("UPDATE approvals SET status = 'revoked', stale_reason = NULL WHERE id = ? AND status != 'revoked'").run(id).changes;
}
