import { z } from "zod";

export const ApprovalKindSchema = z.enum(["A", "B", "C", "final"]);
export type ApprovalKind = z.infer<typeof ApprovalKindSchema>;

export const ApprovalStatusSchema = z.enum(["valid", "stale", "revoked"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/** Phase 4–6 (Task 35′): + `plan_changed`, `version_changed`, `timeline_changed` (C и final). */
export const ApprovalStaleReasonSchema = z.enum(["subject_changed", "edl_changed", "style_changed", "upstream_A", "plan_changed", "version_changed", "timeline_changed"]);
export type ApprovalStaleReason = z.infer<typeof ApprovalStaleReasonSchema>;

const SUBJECT_REF = /^([a-z_]+):([^@\s]+)@r([1-9]\d*)$/;
/**
 * Тип субъекта по виду approval: A — ревизия EDL, B — ревизия плана (`05` §7); C — версия сцены
 * (`scene:<sceneId>@r<номер версии>`), final — ревизия таймлайна (`timeline:<id>@r<N>`), Р-V4.
 */
const SUBJECT_TYPE: Record<ApprovalKind, string> = { A: "edl", B: "plan", C: "scene", final: "timeline" };

/**
 * Область решения — субъект без ревизии: `"<type>:<id>"` (`scene:scn_1@r2` → `scene:scn_1`).
 * C и final отзываются и ищутся по ней (Р-V4), A и B — по виду в проекте.
 */
export function subjectKey(ref: string): string {
  const p = parseSubjectRef(ref);
  if (!p) throw new RangeError(`не субъект approval: ${ref}`);
  return `${p.type}:${p.id}`;
}

/** `"edl:<id>@r<N>"`. */
export function subjectRef(type: string, id: string, revision: number): string {
  if (!Number.isInteger(revision) || revision < 1) throw new RangeError(`ревизия должна быть >= 1: ${revision}`);
  return `${type}:${id}@r${revision}`;
}

export function parseSubjectRef(ref: string): { type: string; id: string; revision: number } | null {
  const m = SUBJECT_REF.exec(ref);
  return m ? { type: m[1]!, id: m[2]!, revision: Number(m[3]) } : null;
}

/** Approval: валиден, пока `subject_hash = canonicalHash(документ ревизии)` совпадает с текущим. */
export const ApprovalSchema = z.object({
  id: z.string().min(1),
  project_id: z.string().min(1),
  kind: ApprovalKindSchema,
  subject_ref: z.string().regex(SUBJECT_REF),
  subject_hash: z.string().regex(/^[0-9a-f]{64}$/),
  status: ApprovalStatusSchema,
  stale_reason: ApprovalStaleReasonSchema.optional(),
  decided_at: z.string().datetime(),
}).strict().superRefine((a, ctx) => {
  const want = SUBJECT_TYPE[a.kind];
  const got = parseSubjectRef(a.subject_ref);
  if (want && got && got.type !== want) ctx.addIssue({ code: "custom", path: ["subject_ref"], message: `субъект approval ${a.kind} — ${want}:<id>@r<N>` });
  if ((a.status === "stale") !== (a.stale_reason !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["stale_reason"], message: "stale_reason обязателен у stale и запрещён у остальных" });
  }
});
export type Approval = z.infer<typeof ApprovalSchema>;
