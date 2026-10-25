// Превью видеосцены в контексте исходника (ревью Task 38-39, I2/I3): какая сцена плана и ревизия
// задают окно, и что уже опубликовано. Ключ кэша — `context/<scene>/<version>@r<N>-p<pad>`:
// версия, ревизия плана (позиция сцены и EDL под ней иммутабельны внутри ревизии), поля.
// Превью другой ревизии, чем та, по которой нарисовали бы сейчас, — устарело (`outdated`).
import type { ScenePlanItem, VideoSceneContext, VisualPlanRevisionDoc } from "@ms/contracts";
import { currentPlan } from "../analysis/plan-ops.js";
import { artifactPaths } from "../artifacts/paths.js";
import type { Db } from "../db/open.js";
import * as plans from "../db/repos/plans.js";
import * as scenes from "../db/repos/scenes.js";
import { versionVideoContext } from "./origin.js";

export const CONTEXT_PREVIEW_FILE = "preview.mp4";
export const CONTEXT_PREVIEW_META = "preview.json";

/**
 * Сцена плана для окна превью: по текущей ревизии плана, если сцена там принята (`current`);
 * иначе — по ревизии генерации версии. Ни там, ни там — undefined.
 */
export function previewPlanItem(db: Db, root: string, c: VideoSceneContext): { doc: VisualPlanRevisionDoc; item: ScenePlanItem; current: boolean } | undefined {
  const cur = plans.get(db, c.plan_id)?.current_revision ?? undefined;
  for (const rev of [cur, c.plan_revision]) {
    if (rev === undefined) continue;
    try {
      const doc = currentPlan(db, root, c.plan_id, rev);
      const item = doc.items.find((x) => x.id === c.item_id && (x.status === "accepted" || rev === c.plan_revision));
      if (item) return { doc, item, current: rev === cur };
    } catch {
      // ревизия не читается — следующая
    }
  }
  return undefined;
}

export interface ContextPreviewState {
  version_id: string;
  rel_path: string;
  plan_revision: number;
  pad_frames: number;
  /** Опубликовано по другой ревизии плана (сцена сдвинута, EDL другой) или сцены нет в текущем плане — перерисовать. */
  outdated: boolean;
}

const NAME_RE = /@r([1-9][0-9]*)-p(0|[1-9][0-9]*)$/;

/** Последнее опубликованное превью версии в контексте и устарело ли оно; нет — null. */
export function contextPreviewState(db: Db, root: string, sceneId: string, versionId: string): ContextPreviewState | null {
  const scene = scenes.get(db, sceneId);
  if (!scene) return null;
  const vctx = versionVideoContext(db, versionId);
  if (!vctx) return null;
  const prefix = `${artifactPaths(root, scene.project_id).contextPreview(sceneId, versionId, 1).replace(/@r1$/, "")}@r`;
  const rows = db.prepare("SELECT dest_rel FROM artifact_publications WHERE substr(dest_rel, 1, ?) = ? ORDER BY published_at DESC, rowid DESC")
    .pluck().all(prefix.length, prefix) as string[];
  for (const rel of rows) {
    const m = NAME_RE.exec(rel);
    if (!m) continue;
    const target = previewPlanItem(db, root, vctx);
    const planRevision = Number(m[1]);
    return {
      version_id: versionId, rel_path: `${rel}/${CONTEXT_PREVIEW_FILE}`, plan_revision: planRevision, pad_frames: Number(m[2]),
      outdated: !target || !target.current || target.doc.revision !== planRevision,
    };
  }
  return null;
}
