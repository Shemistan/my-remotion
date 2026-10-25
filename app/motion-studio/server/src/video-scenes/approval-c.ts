// Approval C видеосцены (Task 38-39, Р-V4): человек утверждает версию сцены. Субъект —
// `scene:<id>@r<номер версии>` + `manifest_sha256` версии; область — `scene:<id>`: C одной сцены
// не отзывает C другой. Решение и `scenes.approved_version_id` — одной транзакцией.
import { type Approval, type ApprovalStaleReason, subjectKey, subjectRef } from "@ms/contracts";
import { ApiError, notFound } from "../api/errors.js";
import { approve } from "../approvals/engine.js";
import { sceneSubject } from "../approvals/subjects.js";
import type { Db } from "../db/open.js";
import * as approvals from "../db/repos/approvals.js";
import * as scenes from "../db/repos/scenes.js";
import * as versions from "../db/repos/versions.js";
import { tx } from "../db/tx.js";

/** Область C сцены (`scene:<id>`). */
const sceneKey = (sceneId: string): string => subjectKey(subjectRef("scene", sceneId, 1));

/**
 * Утвердить версию `versionId` сцены `sceneId`. Версии нет — 404; чужая сцена — 422
 * `version_not_in_scene`; `failed` или сломанная (`broken_reason`) — 409 `version_failed`.
 */
export function approveScene(db: Db, i: { sceneId: string; versionId: string }): Approval {
  return tx(db, () => {
    const scene = scenes.get(db, i.sceneId);
    if (!scene) throw notFound(`сцена ${i.sceneId}`);
    const v = versions.get(db, i.versionId);
    if (!v) throw notFound(`версия ${i.versionId}`);
    if (v.scene_id !== i.sceneId) throw new ApiError(422, "version_not_in_scene", `версия ${i.versionId} — не сцены ${i.sceneId}`);
    const subject = sceneSubject(db, i.versionId);
    if (!subject) throw new ApiError(409, "version_failed", `версия v${v.number} ${v.broken_reason ? `сломана: ${v.broken_reason}` : "не готова"} — утверждать нечего`);
    const a = approve(db, { projectId: scene.project_id, kind: "C", subjectRef: subject.ref, subjectHash: subject.hash });
    scenes.setApproved(db, i.sceneId, i.versionId);
    return a;
  });
}

/** Снять утверждение сцены: решения области `scene:<id>` → revoked, `approved_version_id` — null. */
export function unapproveScene(db: Db, sceneId: string): void {
  tx(db, () => {
    const scene = scenes.get(db, sceneId);
    if (!scene) throw notFound(`сцена ${sceneId}`);
    approvals.revokeActive(db, scene.project_id, "C", sceneKey(sceneId));
    scenes.setApproved(db, sceneId, null);
  });
}

export interface SceneApprovalState {
  state: "missing" | "valid" | "stale";
  versionId?: string;
  versionNumber?: number;
  approval?: Approval;
  reason?: ApprovalStaleReason;
}

/**
 * Состояние C сцены (только чтение): решения нет — `missing`; утверждённая версия цела и её
 * манифест тот же — `valid`; версия сломана, пропала или манифест другой — `stale(version_changed)`;
 * решение уже устарело в БД — `stale` с его причиной.
 */
export function sceneApprovalState(db: Db, sceneId: string): SceneApprovalState {
  const scene = scenes.get(db, sceneId);
  if (!scene) return { state: "missing" };
  const a = approvals.latestActive(db, scene.project_id, "C", sceneKey(sceneId));
  if (!a) return { state: "missing" };
  const versionId = scene.approved_version_id ?? undefined;
  const v = versionId ? versions.get(db, versionId) : undefined;
  const ref = v ? { versionId: v.id, versionNumber: v.number } : {};
  if (a.status === "stale") return { state: "stale", ...ref, approval: a, ...(a.stale_reason ? { reason: a.stale_reason } : {}) };
  const now = versionId ? sceneSubject(db, versionId) : undefined;
  if (now && now.ref === a.subject_ref && now.hash === a.subject_hash) return { state: "valid", ...ref, approval: a };
  return { state: "stale", ...ref, approval: { ...a, status: "stale", stale_reason: "version_changed" }, reason: "version_changed" };
}
