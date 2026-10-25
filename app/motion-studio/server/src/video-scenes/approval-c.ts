// Approval C видеосцены (Task 38-39, Р-V4): человек утверждает версию сцены. Субъект —
// `scene:<id>@r<номер версии>` + `manifest_sha256` версии; область — `scene:<id>`: C одной сцены
// не отзывает C другой. Решение и `scenes.approved_version_id` — одной транзакцией.
// Смена сцены в плане (ревью I1): отпечаток сцены плана, по которому сделана утверждённая версия
// (вход её генерации, у правки — предка-генерации), ≠ текущему — C `stale(plan_changed)`.
import { type Approval, type ApprovalStaleReason, subjectKey, subjectRef } from "@ms/contracts";
import { ApiError, notFound } from "../api/errors.js";
import { approve } from "../approvals/engine.js";
import { sceneSubject } from "../approvals/subjects.js";
import type { Db } from "../db/open.js";
import * as approvals from "../db/repos/approvals.js";
import * as scenes from "../db/repos/scenes.js";
import * as versions from "../db/repos/versions.js";
import { tx } from "../db/tx.js";
import { deletedRefusal } from "../projects/lifecycle.js";
import { currentVideoFingerprint, versionVideoFingerprint } from "./origin.js";

/** Область C сцены (`scene:<id>`). */
export const sceneKey = (sceneId: string): string => subjectKey(subjectRef("scene", sceneId, 1));

/**
 * Утвердить версию `versionId` сцены `sceneId`. Версии нет — 404; чужая сцена — 422
 * `version_not_in_scene`; `failed` или сломанная (`broken_reason`) — 409 `version_failed`; проект в
 * корзине — `project_deleted`; с `root` — версия сделана не по текущей сцене плана (отпечаток) —
 * 409 `plan_changed` (перегенерируйте сцену).
 */
export function approveScene(db: Db, i: { sceneId: string; versionId: string; root?: string }): Approval {
  return tx(db, () => {
    const scene = scenes.get(db, i.sceneId);
    if (!scene) throw notFound(`сцена ${i.sceneId}`);
    const deleted = deletedRefusal(db, scene.project_id);
    if (deleted) throw deleted;
    const v = versions.get(db, i.versionId);
    if (!v) throw notFound(`версия ${i.versionId}`);
    if (v.scene_id !== i.sceneId) throw new ApiError(422, "version_not_in_scene", `версия ${i.versionId} — не сцены ${i.sceneId}`);
    const subject = sceneSubject(db, i.versionId);
    if (!subject) throw new ApiError(409, "version_failed", `версия v${v.number} ${v.broken_reason ? `сломана: ${v.broken_reason}` : "не готова"} — утверждать нечего`);
    if (i.root !== undefined && planChanged(db, i.root, i.sceneId, v.id)) {
      throw new ApiError(409, "plan_changed", `версия v${v.number} сделана не по текущей сцене плана — перегенерируйте сцену`);
    }
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
 * Версия видеосцены сделана не по текущей сцене плана: её отпечаток (генерации) известен и ≠
 * текущему, или сцены нет среди принятых. Сравнивать не с чем (не видеосцена, нет плана или
 * стиля, старый вход без отпечатка) — false. `current` — уже посчитанный текущий отпечаток.
 */
export function planChanged(db: Db, root: string, sceneId: string, versionId: string, current?: string | null): boolean {
  const made = versionVideoFingerprint(db, versionId);
  if (made === undefined) return false;
  const now = current !== undefined ? current : (() => {
    const c = currentVideoFingerprint(db, root, sceneId);
    return c === undefined ? undefined : c === null ? null : c.fingerprint;
  })();
  if (now === undefined) return false;
  return now === null || now !== made;
}

/**
 * Состояние C сцены (только чтение): решения нет — `missing`; утверждённая версия цела и её
 * манифест тот же — `valid`; версия сломана, пропала или манифест другой — `stale(version_changed)`;
 * с `root` — версия сделана не по текущей сцене плана — `stale(plan_changed)` (`fingerprint` —
 * текущий отпечаток, если уже посчитан; `null` — сцены нет среди принятых); решение уже устарело
 * в БД — `stale` с его причиной.
 */
export function sceneApprovalState(db: Db, sceneId: string, o: { root?: string; fingerprint?: string | null } = {}): SceneApprovalState {
  const scene = scenes.get(db, sceneId);
  if (!scene) return { state: "missing" };
  const a = approvals.latestActive(db, scene.project_id, "C", sceneKey(sceneId));
  if (!a) return { state: "missing" };
  const versionId = scene.approved_version_id ?? undefined;
  const v = versionId ? versions.get(db, versionId) : undefined;
  const ref = v ? { versionId: v.id, versionNumber: v.number } : {};
  if (a.status === "stale") return { state: "stale", ...ref, approval: a, ...(a.stale_reason ? { reason: a.stale_reason } : {}) };
  const now = versionId ? sceneSubject(db, versionId) : undefined;
  if (now && now.ref === a.subject_ref && now.hash === a.subject_hash) {
    if (o.root !== undefined && planChanged(db, o.root, sceneId, versionId!, o.fingerprint)) {
      return { state: "stale", ...ref, approval: { ...a, status: "stale", stale_reason: "plan_changed" }, reason: "plan_changed" };
    }
    return { state: "valid", ...ref, approval: a };
  }
  return { state: "stale", ...ref, approval: { ...a, status: "stale", stale_reason: "version_changed" }, reason: "version_changed" };
}
