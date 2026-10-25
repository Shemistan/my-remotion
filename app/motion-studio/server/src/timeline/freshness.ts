// Свежесть ревизии таймлайна (Task 42): лениво, при чтении — `inputs` текущей ревизии против
// текущих EDL, плана и стиля проекта и состав по Approval C против текущих решений. Хуков в
// `edl-ops.ts`/`plan-ops.ts` нет: правка монтажа или плана таймлайн не трогает, устаревание видно
// здесь (UI предлагает пересобрать, финал отказывает `timeline_stale`). Только чтение.
import type { Db } from "../db/open.js";
import { videoScenes, videoTimelines } from "../db/repos/video.js";
import { approvedVersion, currentTimelineInputs } from "./build.js";
import { readTimelineDoc } from "./ops.js";

export const FRESHNESS_REASONS = ["edl_changed", "plan_changed", "style_changed", "version_changed", "approval_stale"] as const;
export type FreshnessReason = (typeof FRESHNESS_REASONS)[number];

export interface TimelineFreshness {
  fresh: boolean;
  reasons: FreshnessReason[];
}

const same = (a: { id: string; revision: number; hash: string }, b: { id: string; revision: number; hash: string }) => a.id === b.id && a.revision === b.revision && a.hash === b.hash;

/**
 * Причины (в порядке `FRESHNESS_REASONS`): сменилась ревизия EDL, плана, стиля; у сцены на таймлайне
 * утверждена другая версия или у исключённой без C (`not_approved`, `no_version`, `failed`) C
 * появилась (`version_changed`); у клипа `approved` C больше не валидна (`approval_stale`).
 * Таймлайна у проекта нет — `{ fresh: false, reasons: [] }`.
 */
export function timelineFreshness(db: Db, root: string, projectId: string): TimelineFreshness {
  const row = videoTimelines.byProject(db, projectId);
  if (!row || row.current_revision === null) return { fresh: false, reasons: [] };
  const doc = readTimelineDoc(db, root, row.id, row.current_revision);
  const found = new Set<FreshnessReason>();
  const now = currentTimelineInputs(db, projectId);
  if (!now || !same(now.edl, doc.inputs.edl) || now.media_sha256 !== doc.inputs.media_sha256) found.add("edl_changed");
  if (!now || !same(now.plan, doc.inputs.plan)) found.add("plan_changed");
  if (!now || !same(now.style, doc.inputs.style)) found.add("style_changed");
  for (const c of doc.scenes) {
    const v = approvedVersion(db, projectId, c.scene_id);
    if (c.include === "approved" && !v) found.add("approval_stale");
    else if (v && v.id !== c.version_id) found.add("version_changed");
    else if (v && c.include === "override") found.add("version_changed");
  }
  for (const x of doc.excluded) {
    if (x.reason !== "not_approved" && x.reason !== "no_version" && x.reason !== "failed") continue;
    const s = videoScenes.get(db, doc.inputs.plan.id, x.item_id);
    if (s && approvedVersion(db, projectId, s.scene_id)) found.add("version_changed");
  }
  const reasons = FRESHNESS_REASONS.filter((r) => found.has(r));
  return { fresh: reasons.length === 0, reasons };
}
