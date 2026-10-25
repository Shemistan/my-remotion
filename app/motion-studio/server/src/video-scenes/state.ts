// Состояние сцен видеопроекта для `GET /projects/:id/video-scenes` (Task 38-39, `VideoScenesStateDto`):
// по принятой сцене текущей ревизии плана — сцена Playground, последняя задача генерации, текущая
// и утверждённая версии с номерами, Approval C, `stale` (отпечаток версии ≠ текущему), очередь
// последней пишущей задачи сцены, замечания QA; Approval B ревизии; пакеты. Только чтение.
import { type Job, type SceneApprovalDto, type VideoSceneDto, type VideoScenesStateDto, placementFor } from "@ms/contracts";
import { currentPlan } from "../analysis/plan-ops.js";
import { currentProjectStyle } from "../analysis/project-style.js";
import { ApiError, notFound } from "../api/errors.js";
import { publicJob } from "../api/job-dto.js";
import { peekApprovalState } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import * as plans from "../db/repos/plans.js";
import * as projects from "../db/repos/projects.js";
import * as scenes from "../db/repos/scenes.js";
import { videoScenes } from "../db/repos/video.js";
import * as versions from "../db/repos/versions.js";
import { SCENE_WRITING_TYPES } from "../jobs/locks.js";
import { sceneStatus, versionQaWarnings } from "../script/state.js";
import { sceneApprovalState } from "./approval-c.js";
import { acceptedItems, videoBatchesForState } from "./batch.js";
import { videoItemFingerprint } from "./fingerprint.js";
import { queuePosition } from "./queue.js";

/** Последняя ждущая пишущая задача сцены (генерация, правка, восстановление); нет — undefined. */
function waitingJob(db: Db, sceneId: string): Job | undefined {
  return jobs.list(db, { sceneId }).filter((j) => SCENE_WRITING_TYPES.includes(j.type) && j.status === "pending").at(-1);
}

export function videoScenesState(db: Db, root: string, projectId: string): VideoScenesStateDto {
  const project = projects.get(db, projectId);
  if (!project) throw notFound(`проект ${projectId}`);
  if (project.kind !== "video") throw new ApiError(409, "not_video_project", "проект не видеопроект");
  const plan = plans.byProject(db, projectId);
  const doc = plan && plan.current_revision !== null ? currentPlan(db, root, plan.id, plan.current_revision) : undefined;
  const style = currentProjectStyle(db, root, projectId);
  const styleRef = style ? { id: style.style_id, revision: style.revision } : null;
  const peek = peekApprovalState(db, projectId, "B", doc ? currentSubject(db, projectId, "B") : undefined);

  const sceneDtos: VideoSceneDto[] = doc ? acceptedItems(doc).map((item) => {
    const row = videoScenes.get(db, doc.plan_id, item.id);
    const scene = row ? scenes.get(db, row.scene_id) : undefined;
    const raw = row?.job_id ? jobs.get(db, row.job_id) ?? null : null;
    const versionId = scene?.current_version_id ?? null;
    const current = versionId ? versions.get(db, versionId) : undefined;
    const approved = scene?.approved_version_id ? versions.get(db, scene.approved_version_id) : undefined;
    const c = row ? sceneApprovalState(db, row.scene_id) : { state: "missing" as const };
    const approval: SceneApprovalDto = {
      state: c.state,
      ...(c.approval ? { approval_id: c.approval.id } : {}),
      ...(c.versionId ? { version_id: c.versionId } : {}),
      ...(c.versionNumber ? { version_number: c.versionNumber } : {}),
      ...(c.reason ? { reason: c.reason } : {}),
    };
    const waiting = row ? waitingJob(db, row.scene_id) : undefined;
    const q = waiting ? queuePosition(db, waiting.id) : undefined;
    return {
      item_id: item.id,
      scene_id: row?.scene_id ?? null,
      status: sceneStatus(raw, versionId),
      job: raw ? publicJob(raw, root) : null,
      version_id: versionId,
      version_number: current?.number ?? null,
      approval,
      // версия есть, но сделана не по текущей сцене плана (режим, зона, слова, длительность, стиль)
      stale: row !== undefined && versionId !== null && row.item_fingerprint !== videoItemFingerprint(item, styleRef),
      placement: placementFor(item.composition_mode, item.zone, item.rect),
      frames: { start: item.frames.start, end: item.frames.end },
      quote: item.evidence.map((e) => e.quote).join(" … "),
      approved_version_id: approved?.id ?? null,
      approved_version_number: approved?.number ?? null,
      queue: q && q.ahead > 0 ? { ahead: q.ahead, ...(q.blockingJobId ? { blocking_job_id: q.blockingJobId } : {}) } : null,
      qa_warnings: versionQaWarnings(db, root, versionId),
    };
  }) : [];

  return {
    project_id: projectId,
    plan: doc ? { id: doc.plan_id, revision: doc.revision } : null,
    approval_b: { state: peek.state, ...(peek.approval ? { ref: peek.approval.subject_ref } : {}), ...(peek.reason ? { reason: peek.reason } : {}) },
    scenes: sceneDtos,
    batches: videoBatchesForState(db, root, projectId),
    // папки клипов видеопроекта — Task 5L (`video.package`)
    packages: [],
  };
}
