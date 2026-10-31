// Моки вкладок «Сцены» и «Экспорт» (S9): сцены Playground по сценам плана, пакет генерации,
// пакет экспорта. Состояние проходит `ScriptStateDtoSchema` — UI видит то же, что отдал бы сервер.
import { type Aspect, type ScriptBatchDto, type ScriptItemStatus, type ScriptPackageDto, type ScriptSceneDto, type ScriptStateDto, ScriptStateDtoSchema } from "@ms/contracts";
import { TS, job } from "../helpers.js";
import { state as planState } from "./plan-fixtures.js";

const SHA = "b".repeat(64);
const JOB_STATUS: Record<ScriptItemStatus, string | null> = {
  none: null, pending: "pending", running: "running", ready: "completed", failed: "failed", cancelled: "cancelled", blocked: "blocked",
};

export function scene(itemId: string, status: ScriptItemStatus, over: Partial<ScriptSceneDto> = {}): ScriptSceneDto {
  const n = itemId.slice(-1);
  const js = JOB_STATUS[status];
  const failed = status === "failed" ? { error: { code: "pipeline", stage: "engineer", message: "engineer: сцена не собралась" } } : {};
  return {
    item_id: itemId, aspect: "16:9", scene_id: `sc_${n}`, version_id: status === "ready" ? `ver_${n}` : null,
    job: js ? (job({ id: `job_${n}`, scene_id: `sc_${n}`, status: js, progress: status === "ready" ? 1 : 0.4, stage: "render", ...failed }) as ScriptSceneDto["job"]) : null,
    status, qa_warnings: [], qa_overall: null, warnings: [], stale: false, ...over,
  };
}

export function batch(items: ScriptSceneDto[], over: Partial<ScriptBatchDto> = {}): ScriptBatchDto {
  const counts = { total: items.length, pending: 0, running: 0, ready: 0, failed: 0, cancelled: 0, blocked: 0 };
  for (const x of items) if (x.status !== "none") counts[x.status] += 1;
  return {
    id: "sb_1", aspect: "16:9", plan_revision: 3, counts,
    items: items.map((x) => ({ item_id: x.item_id, scene_id: x.scene_id, job: x.job, version_id: x.version_id, status: x.status })), ...over,
  };
}

export function pkg(over: Partial<ScriptPackageDto> = {}): ScriptPackageDto {
  return {
    id: "pkg_1", aspect: "16:9", rel_path: "workspace/projects/p1/packages/pkg_1", abs_path: "/Volumes/SSD/MotionStudio/workspace/projects/p1/packages/pkg_1",
    display_name: "Go map_16x9_2026-10-24",
    files: [
      { n: 1, item_id: "ss_001", mp4: "01_v-go-1-24.mp4", alpha: "01_v-go-1-24_alpha.mov", sha256: { mp4: SHA, alpha: SHA } },
      { n: 2, item_id: "ss_002", mp4: "02_tablica-delitsya.mp4", alpha: "02_tablica-delitsya_alpha.mov", sha256: { mp4: SHA, alpha: SHA } },
    ],
    missing: [{ item_id: "ss_003", reason: "нет готовой версии" }, { item_id: "ss_004", reason: "сцена устарела" }],
    created_at: TS, ...over,
  };
}

/** Три сцены: ready, running, failed (ss_004 не генерировалась). */
export function outState(over: Partial<ScriptStateDto> = {}, aspect: Aspect = "16:9"): ScriptStateDto {
  const scenes = [scene("ss_001", "ready"), scene("ss_002", "running"), scene("ss_003", "failed")].map((x) => ({ ...x, aspect }));
  return ScriptStateDtoSchema.parse(planState({ scenes, batches: [batch(scenes)], ...over }));
}
