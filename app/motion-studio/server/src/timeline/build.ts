// Сборка ревизии таймлайна проекта (Task 42, Phase 5): из текущих EDL (A), плана (B), стиля и
// версий сцен с Approval C — `composeTimeline` (35′). Клип стоит на кадрах плана, длина — план
// (Р-V6); без валидной C — в `excluded`; сцена, чей отпечаток разошёлся с планом, — `stale`.
// Только чтение БД и хранилища: публикует ревизию задача `timeline.build` или правка пользователя.
import {
  type ComposeSceneState, type ScenePlanItem, type TimelineVersionRef, type VideoTimelineDoc, type VisualPlanRevisionDoc,
  composeTimeline,
} from "@ms/contracts";
import { approvalState } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import { currentPlan } from "../analysis/plan-ops.js";
import type { Db } from "../db/open.js";
import * as edls from "../db/repos/edls.js";
import * as jobsRepo from "../db/repos/jobs.js";
import * as media from "../db/repos/media.js";
import * as plans from "../db/repos/plans.js";
import * as scenes from "../db/repos/scenes.js";
import * as styles from "../db/repos/styles.js";
import { videoScenes, videoTimelines } from "../db/repos/video.js";
import * as versions from "../db/repos/versions.js";
import { roughCutApprovalValid } from "../edit/approval-a.js";
import { EditError } from "../edit/errors.js";
import { timelineFor } from "../edit/timeline-store.js";
import { sceneApprovalState } from "../video-scenes/approval-c.js";
import { videoItemFingerprint } from "../video-scenes/fingerprint.js";

/** Таймлайн один на проект (`video_timelines.project_id` UNIQUE): id выводится из проекта. */
export const timelineIdFor = (projectId: string): string => `tl_${projectId}`;

export type TimelineInputs = VideoTimelineDoc["inputs"];

/** Текущие входы таймлайна проекта: исходник, ревизии EDL, плана и стиля с хешами; чего-то нет — undefined. */
export function currentTimelineInputs(db: Db, projectId: string): TimelineInputs | undefined {
  const e = edls.byProject(db, projectId);
  const eRev = e?.current_revision == null ? undefined : edls.revision(db, e.id, e.current_revision);
  const p = plans.byProject(db, projectId);
  const pRev = p?.current_revision == null ? undefined : plans.revision(db, p.id, p.current_revision);
  const s = styles.byProject(db, projectId);
  const sRev = s?.current_revision == null ? undefined : styles.revision(db, s.id, s.current_revision);
  const asset = e ? media.get(db, e.media_id) : undefined;
  if (!e || !eRev || !p || !pRev || !s || !sRev || !asset) return undefined;
  return {
    media_sha256: asset.sha256,
    edl: { id: e.id, revision: eRev.revision, hash: eRev.hash },
    plan: { id: p.id, revision: pRev.revision, hash: pRev.hash },
    style: { id: s.id, revision: sRev.revision, hash: sRev.hash },
  };
}

/** Готовая и целая версия или undefined. */
const usable = (v: versions.VersionRow | undefined): versions.VersionRow | undefined => (v !== undefined && v.status === "ready" && v.broken_reason === null ? v : undefined);

/**
 * Версия сцены с валидным Approval C — по `sceneApprovalState` (38-39, одна точка решения с
 * `GET /video-scenes`): решение есть, версия цела, манифест тот же и (с `fingerprint`) сделана по
 * текущей сцене плана. Иначе — undefined. Только чтение.
 */
export function approvedVersion(db: Db, root: string, sceneId: string, fingerprint?: string | null): versions.VersionRow | undefined {
  const c = sceneApprovalState(db, sceneId, { root, ...(fingerprint !== undefined ? { fingerprint } : {}) });
  return c.state === "valid" && c.versionId ? usable(versions.get(db, c.versionId)) : undefined;
}

export const versionRef = (v: versions.VersionRow): TimelineVersionRef => ({ version_id: v.id, version_number: v.number, duration_frames: v.settings.duration_frames });

/**
 * Состояние видеосцен плана `doc` для `composeTimeline` — те же правила, что `videoScenesState`
 * (38-39): утверждённая версия — `sceneApprovalState` с текущим отпечатком сцены плана; текущая
 * готовая версия; итог последней генерации; `stale` — `videoItemFingerprint` ≠
 * `video_scenes.item_fingerprint`. Совпадение проверяет тест (build.test.ts).
 */
export function sceneStates(db: Db, root: string, doc: VisualPlanRevisionDoc): Record<string, ComposeSceneState> {
  const out: Record<string, ComposeSceneState> = {};
  const style = { id: doc.inputs.style.id, revision: doc.inputs.style.revision };
  for (const item of doc.items) {
    if (item.status === "rejected") continue;
    const row = videoScenes.get(db, doc.plan_id, item.id);
    if (!row) continue;
    const scene = scenes.get(db, row.scene_id);
    const cur = scene?.current_version_id ? versions.get(db, scene.current_version_id) : undefined;
    const fingerprint = videoItemFingerprint(item, style);
    const approved = approvedVersion(db, root, row.scene_id, fingerprint);
    const job = row.job_id ? jobsRepo.get(db, row.job_id) : undefined;
    const ready = usable(cur);
    const status = ready ? "ready" : job?.status === "failed" || cur?.status === "failed" ? "failed" : "none";
    out[item.id] = {
      scene_id: row.scene_id,
      status,
      ...(approved ? { approved: versionRef(approved) } : {}),
      ...(ready ? { current: versionRef(ready) } : {}),
      ...(row.item_fingerprint !== fingerprint ? { stale: true } : {}),
    };
  }
  return out;
}

export interface BuildTarget {
  timelineId?: string;
  revision?: number;
  parentRevision?: number;
  /** id сцены плана → причина: текущая неутверждённая версия входит как `override`. */
  overrides?: Record<string, string>;
}

/** План ревизии, по которой построен таймлайн (или текущей). */
export function timelinePlan(db: Db, root: string, inputs: Pick<TimelineInputs, "plan">): VisualPlanRevisionDoc {
  return currentPlan(db, root, inputs.plan.id, inputs.plan.revision);
}

/** Позиции сцен плана (`frames.start`) по id — для переноса сдвигов клипов без якорей. */
export function planStarts(items: readonly Pick<ScenePlanItem, "id" | "frames">[]): Record<string, number> {
  return Object.fromEntries(items.map((x) => [x.id, x.frames.start]));
}

/**
 * Документ ревизии таймлайна по текущим входам. A и B должны быть валидны (иначе
 * `approval_required`). id и номер ревизии — из `target` или из индекса: следующая за текущей.
 */
export function buildTimelineDoc(db: Db, root: string, projectId: string, target: BuildTarget = {}): VideoTimelineDoc {
  if (!roughCutApprovalValid(db, projectId)) throw new EditError("approval_required", "черновой монтаж не утверждён (Approval A нет или устарело)");
  if (approvalState(db, projectId, "B", currentSubject(db, projectId, "B")).state !== "valid") {
    throw new EditError("approval_required", "визуальный план не утверждён (Approval B нет или устарело)");
  }
  const inputs = currentTimelineInputs(db, projectId);
  if (!inputs) throw new EditError("no_plan", `у проекта ${projectId} нет монтажа, плана или стиля`);
  const doc = timelinePlan(db, root, inputs);
  const tl = timelineFor(db, inputs.edl.id, inputs.edl.revision);
  const row = videoTimelines.byProject(db, projectId);
  const cur = row?.current_revision ?? undefined;
  const parentRevision = target.parentRevision ?? cur;
  return composeTimeline({
    tl, items: doc.items, scenes: sceneStates(db, root, doc), inputs,
    timelineId: target.timelineId ?? row?.id ?? timelineIdFor(projectId),
    revision: target.revision ?? (cur ?? 0) + 1,
    ...(parentRevision !== undefined ? { parentRevision } : {}),
    ...(target.overrides ? { overrides: target.overrides } : {}),
  });
}
