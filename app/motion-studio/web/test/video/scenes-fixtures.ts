// Task 40: состояние сцен видеопроекта для юнит-тестов вкладки «Сцены» и Approval C.
import type { SceneApprovalDto, VideoBatchDto, VideoProjectDto, VideoSceneDto, VideoScenesStateDto } from "@ms/contracts";
import { TS, job } from "../helpers.js";

export const projectDto = (plan = true): VideoProjectDto => ({
  project: { id: "p1", kind: "video", title: "Ролик", settings: null, created_at: TS, updated_at: TS },
  media: null, transcript: null, edl: null, approvals: { A: { state: "missing" }, B: { state: "missing" } },
  footage: null, semantic: null, plan: plan ? { id: "pln_1" } : null, style: null, jobs: [],
}) as unknown as VideoProjectDto;

const placement = { mode: "overlay", zone: "left_third", rect: { x: 0.05, y: 0.1, w: 0.3, h: 0.8 }, transparent: true } as const;

export function vscene(item: string, status: VideoSceneDto["status"], over: Partial<VideoSceneDto> = {}): VideoSceneDto {
  const n = Number(item.slice(-1));
  const ready = status === "ready";
  const jobStatus = { none: null, pending: "pending", running: "running", ready: "completed", failed: "failed", cancelled: "cancelled", blocked: "blocked" }[status];
  return {
    item_id: item,
    scene_id: status === "none" ? null : `scn_${n}`,
    status,
    job: jobStatus ? job({ id: `job_${n}`, status: jobStatus, scene_id: `scn_${n}`, ...(status === "failed" ? { error: { code: "pipeline", stage: "engineer", message: "x" }, stage: "engineer" } : {}) }) as VideoSceneDto["job"] : null,
    version_id: ready ? `ver_${n}` : null,
    version_number: ready ? 1 : null,
    approval: { state: "missing" },
    stale: false,
    placement,
    frames: { start: n * 100, end: n * 100 + 90 },
    quote: `цитата ${n}`,
    approved_version_id: null,
    approved_version_number: null,
    queue: null,
    qa_warnings: [],
    qa_overall: null,
    context_preview: null,
    ...over,
  };
}

export function vbatch(scenes: VideoSceneDto[], id = "vb_1"): VideoBatchDto {
  const items = scenes.filter((x) => x.scene_id).map((x) => ({ item_id: x.item_id, scene_id: x.scene_id!, job: x.job, version_id: x.version_id, status: x.status }));
  const count = (s: string) => items.filter((x) => x.status === s).length;
  return {
    id, plan_revision: 2, items,
    counts: { total: items.length, pending: count("pending"), running: count("running"), ready: count("ready"), failed: count("failed"), cancelled: count("cancelled"), blocked: count("blocked") },
  };
}

export function scenesState(over: Partial<VideoScenesStateDto> = {}): VideoScenesStateDto {
  const scenes = over.scenes ?? [vscene("sp_001", "ready"), vscene("sp_002", "running"), vscene("sp_003", "failed"), vscene("sp_004", "none")];
  return {
    project_id: "p1",
    plan: { id: "pln_1", revision: 2 },
    approval_b: { state: "valid", ref: "plan:pln_1@r2" },
    scenes,
    batches: [vbatch(scenes)],
    packages: [],
    ...over,
  };
}

export const approvalC = (state: SceneApprovalDto["state"], over: Partial<SceneApprovalDto> = {}): SceneApprovalDto => ({ state, ...over });
