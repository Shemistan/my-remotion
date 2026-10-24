// Состояние сценарного проекта для `GET /projects/:id/script` (`ScriptStateDto`): текст, план,
// стиль, Approval B, сцены по форматам; пакеты генерации, пакеты экспорта и предупреждения
// разнообразия дают поставщики в файлах треков (`batchesForState`, `packagesForState`,
// `warningsForState`) — треки меняют их тела, не этот файл.
import type { Aspect, Job, ScriptBatchItemStatus, ScriptSceneDto, ScriptStateDto } from "@ms/contracts";
import { publicJob } from "../api/job-dto.js";
import { ApiError, notFound } from "../api/errors.js";
import { currentProjectStyle } from "../analysis/project-style.js";
import { peekApprovalState } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import * as projects from "../db/repos/projects.js";
import * as scenes from "../db/repos/scenes.js";
import { scriptScenes } from "../db/repos/script.js";
import { packagesForState } from "../pipeline/script-package.js";
import { batchesForState } from "./batch.js";
import { warningsForState } from "./diversity.js";
import { itemFingerprint } from "./fingerprint.js";
import { currentScript, currentScriptPlan } from "./read.js";

const ASPECTS: Aspect[] = ["16:9", "9:16"];

/** Статус сцены плана по последней задаче генерации и наличию версии. */
export function sceneStatus(job: Job | null, versionId: string | null): ScriptBatchItemStatus {
  if (!job) return versionId ? "ready" : "pending";
  switch (job.status) {
    case "pending":
    case "awaiting_input":
    case "awaiting_approval":
      return "pending";
    case "running":
      return "running";
    case "completed":
      return versionId ? "ready" : "failed";
    default:
      return job.status;
  }
}

export function scriptState(db: Db, root: string, projectId: string): ScriptStateDto {
  const project = projects.get(db, projectId);
  if (!project) throw notFound(`проект ${projectId}`);
  if (project.kind !== "script") throw new ApiError(409, "not_script_project", "проект не сценарный");
  const script = currentScript(db, root, projectId) ?? null;
  const cur = currentScriptPlan(db, root, projectId);
  const plan = cur?.doc ?? null;
  const style = currentProjectStyle(db, root, projectId) ?? null;
  const peek = peekApprovalState(db, projectId, "B", cur ? currentSubject(db, projectId, "B") : undefined);
  const warnings = warningsForState(db, root, projectId, plan);
  const items = new Map((plan?.items ?? []).map((i) => [i.id, i]));
  const styleRef = style ? { id: style.style_id, revision: style.revision } : null;

  const sceneDtos: ScriptSceneDto[] = cur
    ? ASPECTS.flatMap((aspect) => scriptScenes.listByPlan(db, cur.planId, aspect).map((row) => {
      const raw = row.job_id ? jobs.get(db, row.job_id) ?? null : null;
      const versionId = scenes.get(db, row.scene_id)?.current_version_id ?? null;
      const item = items.get(row.item_id);
      return {
        item_id: row.item_id,
        aspect,
        scene_id: row.scene_id,
        version_id: versionId,
        job: raw ? publicJob(raw, root) : null,
        status: sceneStatus(raw, versionId),
        qa_warnings: [],
        warnings: warnings[row.scene_id] ?? [],
        stale: !item || itemFingerprint(item, styleRef) !== row.item_fingerprint,
      };
    }))
    : [];

  return {
    project,
    script,
    plan,
    plan_outdated: !!(script && plan && plan.inputs.script.revision !== script.revision),
    style,
    approval: {
      state: peek.state,
      ...(peek.approval ? { ref: peek.approval.subject_ref } : {}),
      ...(peek.reason ? { reason: peek.reason } : {}),
    },
    scenes: sceneDtos,
    batches: batchesForState(db, root, projectId),
    packages: packagesForState(db, root, projectId),
  };
}
