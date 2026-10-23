import { ApprovalSchema, type Approval, type ApprovalKind, type ApprovalStaleReason, type ApprovalStatus } from "@ms/contracts";
import type { Db } from "../open.js";

interface Raw {
  id: string; project_id: string; kind: ApprovalKind; subject_ref: string; subject_hash: string;
  status: ApprovalStatus; stale_reason: ApprovalStaleReason | null; decided_at: string;
}

const row = ({ stale_reason, ...r }: Raw): Approval => ApprovalSchema.parse(stale_reason === null ? r : { ...r, stale_reason });

export function insert(db: Db, a: Approval): void {
  const v = ApprovalSchema.parse(a);
  db.prepare("INSERT INTO approvals (id, project_id, kind, subject_ref, subject_hash, status, stale_reason, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(v.id, v.project_id, v.kind, v.subject_ref, v.subject_hash, v.status, v.stale_reason ?? null, v.decided_at);
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

/** Последнее не отозванное решение вида `kind` (valid или stale). */
export function latestActive(db: Db, projectId: string, kind: ApprovalKind): Approval | undefined {
  const r = db.prepare("SELECT * FROM approvals WHERE project_id = ? AND kind = ? AND status != 'revoked' ORDER BY decided_at DESC, rowid DESC LIMIT 1")
    .get(projectId, kind) as Raw | undefined;
  return r && row(r);
}

/** valid → revoked для вида `kind` проекта; число отозванных. */
export function revokeValid(db: Db, projectId: string, kind: ApprovalKind): number {
  return db.prepare("UPDATE approvals SET status = 'revoked' WHERE project_id = ? AND kind = ? AND status = 'valid'").run(projectId, kind).changes;
}

/** valid → stale(reason): по id или для всех valid вида `kind` проекта; число изменённых. */
export function markStale(db: Db, where: { id: string } | { projectId: string; kind: ApprovalKind }, reason: ApprovalStaleReason): number {
  if ("id" in where) {
    return db.prepare("UPDATE approvals SET status = 'stale', stale_reason = ? WHERE id = ? AND status = 'valid'").run(reason, where.id).changes;
  }
  return db.prepare("UPDATE approvals SET status = 'stale', stale_reason = ? WHERE project_id = ? AND kind = ? AND status = 'valid'")
    .run(reason, where.projectId, where.kind).changes;
}
