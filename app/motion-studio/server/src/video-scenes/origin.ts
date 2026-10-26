// Происхождение версии видеосцены (ревью Task 38-39, I1/I3): задача генерации, от которой
// версия идёт — `created_by_job_id`; у правки (`playground.edit`) — по цепочке
// `parent_version_id` до версии генерации. Из её входа — отпечаток сцены плана
// (`video_fingerprint`) и контекст `video` (размещение, план, ревизия), по которым версия сделана.
// Последняя задача генерации сцены тут не годится: план мог смениться, перегенерация — стоять в очереди.
import { type Job, type ScenePlanItem, type VideoSceneContext, VideoSceneContextSchema } from "@ms/contracts";
import { currentPlan } from "../analysis/plan-ops.js";
import { currentProjectStyle } from "../analysis/project-style.js";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import * as plans from "../db/repos/plans.js";
import { videoScenes } from "../db/repos/video.js";
import * as versions from "../db/repos/versions.js";
import { videoItemFingerprint } from "./fingerprint.js";

/** Отпечаток видеосцены плана из входа задачи (`video_fingerprint`). */
export function inputVideoFingerprint(input: unknown): string | undefined {
  const fp = (input as { video_fingerprint?: unknown } | null)?.video_fingerprint;
  return typeof fp === "string" ? fp : undefined;
}

const videoOf = (input: unknown): VideoSceneContext | undefined => {
  const p = VideoSceneContextSchema.safeParse((input as { video?: unknown } | null)?.video);
  return p.success ? p.data : undefined;
};

/** Задача генерации видеосцены, создавшая версию (правка — её предок-генерация); нет — undefined. */
export function generationJobOf(db: Db, versionId: string): Job | undefined {
  const seen = new Set<string>();
  let v = versions.get(db, versionId);
  while (v && !seen.has(v.id)) {
    seen.add(v.id);
    const j = v.created_by_job_id ? jobs.get(db, v.created_by_job_id) : undefined;
    if (j?.type === "playground.generate" && videoOf(j.input)) return j;
    v = v.parent_version_id ? versions.get(db, v.parent_version_id) : undefined;
  }
  return undefined;
}

/** Отпечаток сцены плана, по которому сделана версия; не видеосцена или старый вход — undefined. */
export const versionVideoFingerprint = (db: Db, versionId: string): string | undefined => {
  const j = generationJobOf(db, versionId);
  return j ? inputVideoFingerprint(j.input) : undefined;
};

/** Контекст `video` генерации, от которой идёт версия (размещение, план и ревизия генерации). */
export const versionVideoContext = (db: Db, versionId: string): VideoSceneContext | undefined => {
  const j = generationJobOf(db, versionId);
  return j ? videoOf(j.input) : undefined;
};

/**
 * Текущий отпечаток видеосцены `sceneId` по текущей ревизии плана и стилю проекта: сцена в
 * текущей ревизии не принята — `null`; не видеосцена, плана или стиля нет (сравнивать не с чем) —
 * `undefined`.
 */
export function currentVideoFingerprint(db: Db, root: string, sceneId: string): { fingerprint: string; item: ScenePlanItem } | null | undefined {
  const row = videoScenes.bySceneId(db, sceneId);
  if (!row) return undefined;
  const plan = plans.get(db, row.plan_id);
  if (!plan || plan.current_revision === null) return undefined;
  const style = currentProjectStyle(db, root, row.project_id);
  if (!style) return undefined;
  let item: ScenePlanItem | undefined;
  try {
    item = currentPlan(db, root, plan.id, plan.current_revision).items.find((x) => x.id === row.item_id && x.status === "accepted");
  } catch {
    return undefined;
  }
  if (!item) return null;
  return { fingerprint: videoItemFingerprint(item, { id: style.style_id, revision: style.revision }), item };
}
