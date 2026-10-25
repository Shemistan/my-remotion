// Таблицы Phase 4–6 (006_video_production, Р-V3): пакеты генерации видеосцен, сцены плана
// видеопроекта, папки клипов, таймлайн и его ревизии, экспорты финала. По образцу `script.ts`:
// документы — в хранилище, здесь индекс.
import { type FinalExportRequest, FinalExportRequestSchema } from "@ms/contracts";
import type { Db } from "../open.js";
import { advanceCurrent, nowIso } from "./util.js";

export interface VideoBatchRow {
  id: string;
  project_id: string;
  plan_id: string;
  plan_revision: number;
  approval_id: string | null;
  created_at: string;
}
export interface VideoSceneRow {
  project_id: string;
  plan_id: string;
  item_id: string;
  scene_id: string;
  batch_id: string | null;
  job_id: string | null;
  /** Отпечаток сцены плана при генерации (Task 37′); другой у текущего плана — сцена устарела. */
  item_fingerprint: string;
  created_at: string;
}
export interface VideoPackageRow {
  id: string;
  project_id: string;
  job_id: string | null;
  rel_path: string;
  manifest_sha256: string;
  created_at: string;
}
export interface VideoTimelineRow {
  id: string;
  project_id: string;
  current_revision: number | null;
  created_at: string;
}
export interface VideoTimelineRevisionRow {
  timeline_id: string;
  revision: number;
  parent_revision: number | null;
  rel_path: string;
  sha256: string;
  /** canonicalHash(документ ревизии) — хеш ревизии таймлайна. */
  hash: string;
  created_at: string;
}
export interface FinalExportRow {
  id: string;
  project_id: string;
  timeline_id: string;
  timeline_revision: number;
  approval_id: string | null;
  request: FinalExportRequest;
  inputs_hash: string;
  rel_path: string;
  sha256: string;
  status: "ready" | "failed_verification";
  job_id: string | null;
  created_at: string;
}

type New<T> = Omit<T, "created_at"> & { created_at?: string };

/** Числовая часть id (`sp_012` → 12); без цифр — в конец. */
const idNum = (id: string): number => {
  const m = /(\d+)$/.exec(id);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};

export const videoBatches = {
  insert(db: Db, b: New<VideoBatchRow>): VideoBatchRow {
    db.prepare("INSERT INTO video_batches (id, project_id, plan_id, plan_revision, approval_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(b.id, b.project_id, b.plan_id, b.plan_revision, b.approval_id, b.created_at ?? nowIso());
    return videoBatches.get(db, b.id)!;
  },
  get(db: Db, id: string): VideoBatchRow | undefined {
    return db.prepare("SELECT * FROM video_batches WHERE id = ?").get(id) as VideoBatchRow | undefined;
  },
  /** По времени создания. */
  listByProject(db: Db, projectId: string): VideoBatchRow[] {
    return db.prepare("SELECT * FROM video_batches WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as VideoBatchRow[];
  },
};

export const videoScenes = {
  insert(db: Db, s: New<VideoSceneRow>): VideoSceneRow {
    db.prepare(`INSERT INTO video_scenes (project_id, plan_id, item_id, scene_id, batch_id, job_id, item_fingerprint, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(s.project_id, s.plan_id, s.item_id, s.scene_id, s.batch_id, s.job_id, s.item_fingerprint, s.created_at ?? nowIso());
    return videoScenes.get(db, s.plan_id, s.item_id)!;
  },
  get(db: Db, planId: string, itemId: string): VideoSceneRow | undefined {
    return db.prepare("SELECT * FROM video_scenes WHERE plan_id = ? AND item_id = ?").get(planId, itemId) as VideoSceneRow | undefined;
  },
  bySceneId(db: Db, sceneId: string): VideoSceneRow | undefined {
    return db.prepare("SELECT * FROM video_scenes WHERE scene_id = ?").get(sceneId) as VideoSceneRow | undefined;
  },
  /** Сцены плана по числовой части id сцены плана (`sp_NNN`). */
  listByPlan(db: Db, planId: string): VideoSceneRow[] {
    const rows = db.prepare("SELECT * FROM video_scenes WHERE plan_id = ?").all(planId) as VideoSceneRow[];
    return rows.sort((a, b) => idNum(a.item_id) - idNum(b.item_id) || a.item_id.localeCompare(b.item_id));
  },
  /** Последняя задача генерации сцены (и отпечаток, по которому она поставлена); нет строки — ошибка. */
  setJob(db: Db, sceneId: string, jobId: string, itemFingerprint?: string): void {
    const r = itemFingerprint === undefined
      ? db.prepare("UPDATE video_scenes SET job_id = ? WHERE scene_id = ?").run(jobId, sceneId)
      : db.prepare("UPDATE video_scenes SET job_id = ?, item_fingerprint = ? WHERE scene_id = ?").run(jobId, itemFingerprint, sceneId);
    if (r.changes !== 1) throw new Error(`db: видеосцены ${sceneId} нет`);
  },
  /** Отпечаток сцены плана, по которому опубликована текущая версия; строки нет — 0. */
  setFingerprint(db: Db, sceneId: string, itemFingerprint: string): number {
    return db.prepare("UPDATE video_scenes SET item_fingerprint = ? WHERE scene_id = ?").run(itemFingerprint, sceneId).changes;
  },
};

export const videoPackages = {
  insert(db: Db, p: New<VideoPackageRow>): VideoPackageRow {
    db.prepare("INSERT INTO video_packages (id, project_id, job_id, rel_path, manifest_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(p.id, p.project_id, p.job_id, p.rel_path, p.manifest_sha256, p.created_at ?? nowIso());
    return videoPackages.get(db, p.id)!;
  },
  get(db: Db, id: string): VideoPackageRow | undefined {
    return db.prepare("SELECT * FROM video_packages WHERE id = ?").get(id) as VideoPackageRow | undefined;
  },
  listByProject(db: Db, projectId: string): VideoPackageRow[] {
    return db.prepare("SELECT * FROM video_packages WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as VideoPackageRow[];
  },
};

export const videoTimelines = {
  create(db: Db, t: { id: string; project_id: string }): VideoTimelineRow {
    db.prepare("INSERT INTO video_timelines (id, project_id, current_revision, created_at) VALUES (?, ?, NULL, ?)").run(t.id, t.project_id, nowIso());
    return db.prepare("SELECT * FROM video_timelines WHERE id = ?").get(t.id) as VideoTimelineRow;
  },
  byProject(db: Db, projectId: string): VideoTimelineRow | undefined {
    return db.prepare("SELECT * FROM video_timelines WHERE project_id = ?").get(projectId) as VideoTimelineRow | undefined;
  },
  /** Индекс опубликованной ревизии; `current_revision` только вперёд. */
  insertRevision(db: Db, r: New<VideoTimelineRevisionRow>): VideoTimelineRevisionRow {
    db.prepare("INSERT INTO video_timeline_revisions (timeline_id, revision, parent_revision, rel_path, sha256, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(r.timeline_id, r.revision, r.parent_revision, r.rel_path, r.sha256, r.hash, r.created_at ?? nowIso());
    advanceCurrent(db, "video_timelines", r.timeline_id, r.revision, "таймлайна");
    return videoTimelines.revision(db, r.timeline_id, r.revision)!;
  },
  revision(db: Db, timelineId: string, revision: number): VideoTimelineRevisionRow | undefined {
    return db.prepare("SELECT * FROM video_timeline_revisions WHERE timeline_id = ? AND revision = ?").get(timelineId, revision) as VideoTimelineRevisionRow | undefined;
  },
};

type FinalRaw = Omit<FinalExportRow, "request"> & { request_json: string };
const finalRow = ({ request_json, ...r }: FinalRaw): FinalExportRow => ({ ...r, request: FinalExportRequestSchema.parse(JSON.parse(request_json)) });

export const finalExports = {
  insert(db: Db, f: New<FinalExportRow>): FinalExportRow {
    const request = FinalExportRequestSchema.parse(f.request);
    db.prepare(`INSERT INTO final_exports (id, project_id, timeline_id, timeline_revision, approval_id, request_json, inputs_hash, rel_path, sha256, status, job_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(f.id, f.project_id, f.timeline_id, f.timeline_revision, f.approval_id, JSON.stringify(request), f.inputs_hash, f.rel_path, f.sha256, f.status, f.job_id, f.created_at ?? nowIso());
    return finalExports.get(db, f.id)!;
  },
  get(db: Db, id: string): FinalExportRow | undefined {
    const r = db.prepare("SELECT * FROM final_exports WHERE id = ?").get(id) as FinalRaw | undefined;
    return r && finalRow(r);
  },
  /** По времени создания. */
  listByProject(db: Db, projectId: string): FinalExportRow[] {
    return (db.prepare("SELECT * FROM final_exports WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as FinalRaw[]).map(finalRow);
  },
};
