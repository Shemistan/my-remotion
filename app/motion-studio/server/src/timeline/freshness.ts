// Свежесть ревизии таймлайна (Task 42): лениво, при чтении — `inputs` текущей ревизии против
// текущих EDL, плана и стиля проекта и состав по Approval C против текущих решений. Хуков в
// `edl-ops.ts`/`plan-ops.ts` нет: правка монтажа или плана таймлайн не трогает, устаревание видно
// здесь (UI предлагает пересобрать, финал отказывает `timeline_stale`). Только чтение.
import type { Db } from "../db/open.js";
import { videoTimelines } from "../db/repos/video.js";
import { currentTimelineInputs, sceneStates, timelinePlan } from "./build.js";
import { readTimelineDoc } from "./ops.js";

export const FRESHNESS_REASONS = ["edl_changed", "plan_changed", "style_changed", "version_changed", "approval_stale"] as const;
export type FreshnessReason = (typeof FRESHNESS_REASONS)[number];

export interface TimelineFreshness {
  fresh: boolean;
  reasons: FreshnessReason[];
}

const same = (a: { id: string; revision: number; hash: string }, b: { id: string; revision: number; hash: string }) => a.id === b.id && a.revision === b.revision && a.hash === b.hash;

/**
 * Причины (в порядке `FRESHNESS_REASONS`): сменилась ревизия EDL, плана, стиля; по текущим
 * состояниям сцен плана ревизии (`sceneStates` — правила `sceneApprovalState` 38-39) у клипа
 * утверждена другая версия или у `override` появилась C, либо утверждённая версия есть у сцены,
 * которой нет на таймлайне (кроме исключённой пользователем), — `version_changed`; у клипа
 * `approved` C больше не валидна — `approval_stale`. Таймлайна нет — `{ fresh: false, reasons: [] }`.
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
  const plan = timelinePlan(db, root, doc.inputs);
  const states = sceneStates(db, root, plan);
  // утверждённая версия, которую взяла бы пересборка (устаревшая сцена плана или видеосцены — нет)
  const approved = (itemId: string) => {
    const s = states[itemId];
    const item = plan.items.find((x) => x.id === itemId);
    return s && !s.stale && item?.status !== "stale" ? s.approved : undefined;
  };
  for (const c of doc.scenes) {
    const v = approved(c.item_id);
    if (c.include === "approved" && !v) found.add("approval_stale");
    else if (v && (v.version_id !== c.version_id || c.include === "override")) found.add("version_changed");
  }
  for (const x of doc.excluded) {
    if (x.reason !== "user" && approved(x.item_id)) found.add("version_changed");
  }
  const reasons = FRESHNESS_REASONS.filter((r) => found.has(r));
  return { fresh: reasons.length === 0, reasons };
}
