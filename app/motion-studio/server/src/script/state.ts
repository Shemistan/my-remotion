// Состояние сценарного проекта для `GET /projects/:id/script` (`ScriptStateDto`): текст, план,
// стиль, Approval B, сцены по форматам; пакеты генерации, пакеты экспорта и предупреждения
// разнообразия дают поставщики в файлах треков (`batchesForState`, `packagesForState`,
// `warningsForState`) — треки меняют их тела, не этот файл.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Aspect, type Job, type QAIssue, QAReportSchema, type ScriptApproval, type ScriptItemStatus, type ScriptSceneDto, type ScriptStateDto } from "@ms/contracts";
import { publicJob } from "../api/job-dto.js";
import { ApiError, notFound } from "../api/errors.js";
import { currentProjectStyle } from "../analysis/project-style.js";
import { peekApprovalState } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import * as projects from "../db/repos/projects.js";
import * as scenes from "../db/repos/scenes.js";
import * as versions from "../db/repos/versions.js";
import { scriptScenes } from "../db/repos/script.js";
import { packagesForState } from "../pipeline/script-package.js";
import { batchesForState, twinOutdated } from "./batch.js";
import { warningsForState } from "./diversity.js";
import { itemFingerprint } from "./fingerprint.js";
import { currentScript, currentScriptPlan } from "./read.js";

const ASPECTS: Aspect[] = ["16:9", "9:16"];

/** Статус сцены плана по последней задаче генерации и наличию версии; задачи не было — `none`. */
export function sceneStatus(job: Job | null, versionId: string | null): ScriptItemStatus {
  if (!job) return versionId ? "ready" : "none";
  switch (job.status) {
    case "pending":
    case "awaiting_approval":
      return "pending";
    case "running":
    case "awaiting_input":
      return "running";
    case "completed":
      return versionId ? "ready" : "failed";
    default:
      return job.status;
  }
}

/**
 * Замечания QA уровня warning версии (`qa.json`): в том числе неисправленные
 * `overlay_opaque`/`overlay_root_fill` (I2) — по ним S7 кладёт альфу сцены в `missing`.
 * Нет версии или отчёта, отчёт не читается — пусто.
 */
export function versionQaWarnings(db: Db, root: string, versionId: string | null): QAIssue[] {
  const v = versionId ? versions.get(db, versionId) : undefined;
  if (!v || v.broken_reason) return [];
  try {
    const qa = QAReportSchema.safeParse(JSON.parse(readFileSync(join(root, v.path, "qa.json"), "utf8")));
    return qa.success ? qa.data.issues.filter((x) => x.severity === "warning") : [];
  } catch {
    return [];
  }
}

export function scriptState(db: Db, root: string, projectId: string): ScriptStateDto {
  const project = projects.get(db, projectId);
  if (!project) throw notFound(`проект ${projectId}`);
  if (project.kind !== "script") throw new ApiError(409, "not_script_project", "проект не сценарный");
  const script = currentScript(db, root, projectId) ?? null;
  const cur = currentScriptPlan(db, root, projectId);
  const doc = cur?.doc ?? null;
  const style = currentProjectStyle(db, root, projectId) ?? null;
  const peek = peekApprovalState(db, projectId, "B", cur ? currentSubject(db, projectId, "B") : undefined);
  const warnings = warningsForState(db, root, projectId, doc);
  const items = new Map((doc?.items ?? []).map((i) => [i.id, i]));
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
        qa_warnings: versionQaWarnings(db, root, versionId),
        warnings: warnings[row.scene_id] ?? [],
        // двойник 9:16 ещё и по эталону: сделан не по текущей 16:9-версии — устарел (S10 fix I3)
        stale: !item || itemFingerprint(item, styleRef) !== row.item_fingerprint || (aspect === "9:16" && twinOutdated(db, cur.planId, row.item_id, versionId)),
      };
    }))
    : [];

  const approval: ScriptApproval = {
    state: peek.state,
    ...(peek.approval ? { ref: peek.approval.subject_ref } : {}),
    ...(peek.reason ? { reason: peek.reason } : {}),
  };
  return {
    project,
    script,
    plan: cur && doc ? { plan_id: cur.planId, doc, approval } : null,
    plan_outdated: !!(script && doc && doc.inputs.script.revision !== script.revision),
    style,
    approval,
    scenes: sceneDtos,
    batches: batchesForState(db, root, projectId),
    packages: packagesForState(db, root, projectId),
  };
}
