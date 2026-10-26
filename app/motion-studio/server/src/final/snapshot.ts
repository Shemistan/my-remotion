// `project-snapshot.json` финала (Task 43): ревизии и хеши всех входов, решения и версии сцен на
// момент экспорта — чтобы открыть экспорт заново и понять, из чего он собран, даже когда проект ушёл
// вперёд. Только чтение БД и документа ревизии таймлайна.
import type { Db } from "../db/open.js";
import * as approvals from "../db/repos/approvals.js";
import * as edls from "../db/repos/edls.js";
import * as media from "../db/repos/media.js";
import * as projects from "../db/repos/projects.js";
import { videoTimelines } from "../db/repos/video.js";
import * as versions from "../db/repos/versions.js";
import { timelinePlan } from "../timeline/build.js";
import { readTimelineDoc } from "../timeline/ops.js";
import type { FinalRef } from "./gate.js";

export interface ProjectSnapshot {
  schema_version: 1;
  project: { id: string; kind: string };
  timeline: { id: string; revision: number; rel_path: string; sha256: string; hash: string };
  inputs: ReturnType<typeof readTimelineDoc>["inputs"] & { transcript: { id: string; revision: number } };
  media: { id: string; sha256: string; rel_path: string; duration_us: number; width: number; height: number };
  scenes: {
    clip_id: string; scene_id: string; item_id: string; version_id: string; version_number: number; include: "approved" | "override";
    override_reason?: string; manifest_sha256: string; rel_path: string; start_frame: number; duration_frames: number;
  }[];
  excluded: { item_id: string; reason: string }[];
  /** Не отозванные решения проекта (A, B, C, final). */
  approvals: { id: string; kind: string; subject_ref: string; subject_hash: string; status: string; decided_at: string }[];
  created_at: string;
}

export function projectSnapshot(db: Db, root: string, projectId: string, ref: FinalRef): ProjectSnapshot {
  const project = projects.get(db, projectId);
  if (!project) throw new Error(`проекта ${projectId} нет`);
  const rev = videoTimelines.revision(db, ref.timelineId, ref.revision);
  if (!rev) throw new Error(`ревизии таймлайна ${ref.timelineId} r${ref.revision} нет`);
  const doc = readTimelineDoc(db, root, ref.timelineId, ref.revision);
  const plan = timelinePlan(db, root, doc.inputs);
  const edl = edls.get(db, doc.inputs.edl.id);
  const asset = edl ? media.get(db, edl.media_id) : undefined;
  if (!asset) throw new Error(`нет исходника EDL ${doc.inputs.edl.id}`);
  return {
    schema_version: 1,
    project: { id: project.id, kind: project.kind },
    timeline: { id: ref.timelineId, revision: ref.revision, rel_path: rev.rel_path, sha256: rev.sha256, hash: rev.hash },
    inputs: { ...doc.inputs, transcript: { id: plan.inputs.transcript.id, revision: plan.inputs.transcript.revision } },
    media: { id: asset.id, sha256: asset.sha256, rel_path: asset.rel_path, duration_us: asset.probe.duration_us, width: asset.probe.video.display_width, height: asset.probe.video.display_height },
    scenes: doc.scenes.map((c) => {
      const v = versions.get(db, c.version_id);
      if (!v) throw new Error(`версии ${c.version_id} сцены ${c.item_id} нет`);
      return {
        clip_id: c.clip_id, scene_id: c.scene_id, item_id: c.item_id, version_id: c.version_id, version_number: c.version_number, include: c.include,
        ...(c.override_reason !== undefined ? { override_reason: c.override_reason } : {}), manifest_sha256: v.manifest_sha256, rel_path: v.path,
        start_frame: c.start_frame, duration_frames: c.duration_frames,
      };
    }),
    excluded: doc.excluded.map((x) => ({ item_id: x.item_id, reason: x.reason })),
    approvals: approvals.list(db, projectId).filter((a) => a.status !== "revoked").map((a) => ({
      id: a.id, kind: a.kind, subject_ref: a.subject_ref, subject_hash: a.subject_hash, status: a.status, decided_at: a.decided_at,
    })),
    created_at: new Date().toISOString(),
  };
}
