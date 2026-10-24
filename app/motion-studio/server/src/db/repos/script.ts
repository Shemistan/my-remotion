// Таблицы сценарного проекта (005_script, спека §5.4): текст и его ревизии, пакеты генерации,
// сцены плана по форматам, пакеты экспорта. Документы — в хранилище, здесь индекс.
import { type Aspect, type ScriptPlanRevisionDoc, ScriptPlanRevisionDocSchema } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import type { Db } from "../open.js";
import * as plans from "./plans.js";
import { advanceCurrent, nowIso } from "./util.js";

export interface ScriptRow {
  id: string;
  project_id: string;
  current_revision: number | null;
  created_at: string;
}
export interface ScriptRevisionRow {
  script_id: string;
  revision: number;
  rel_path: string;
  sha256: string;
  /** canonicalHash(документ ревизии) — вход плана (`inputs.script.hash`). */
  hash: string;
  created_at: string;
}
export interface ScriptBatchRow {
  id: string;
  project_id: string;
  plan_id: string;
  plan_revision: number;
  aspect: Aspect;
  approval_id: string | null;
  created_at: string;
}
export interface ScriptSceneRow {
  project_id: string;
  plan_id: string;
  item_id: string;
  aspect: Aspect;
  scene_id: string;
  batch_id: string | null;
  job_id: string | null;
  /** Отпечаток сцены плана при генерации (`itemFingerprint`); другой у текущего плана — сцена устарела. */
  item_fingerprint: string;
  created_at: string;
}
export interface ScriptPackageRow {
  id: string;
  project_id: string;
  job_id: string | null;
  aspect: Aspect;
  rel_path: string;
  manifest_sha256: string;
  created_at: string;
}

type New<T> = Omit<T, "created_at"> & { created_at?: string };

export const scripts = {
  create(db: Db, s: { id: string; project_id: string }): ScriptRow {
    db.prepare("INSERT INTO scripts (id, project_id, current_revision, created_at) VALUES (?, ?, NULL, ?)").run(s.id, s.project_id, nowIso());
    return db.prepare("SELECT * FROM scripts WHERE id = ?").get(s.id) as ScriptRow;
  },
  byProject(db: Db, projectId: string): ScriptRow | undefined {
    return db.prepare("SELECT * FROM scripts WHERE project_id = ?").get(projectId) as ScriptRow | undefined;
  },
  /** `current_revision` только вперёд; нет строки — ошибка. */
  setCurrent(db: Db, id: string, revision: number): void {
    advanceCurrent(db, "scripts", id, revision, "текста сценария");
  },
};

export const scriptRevisions = {
  insert(db: Db, r: New<ScriptRevisionRow>): ScriptRevisionRow {
    db.prepare("INSERT INTO script_revisions (script_id, revision, rel_path, sha256, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(r.script_id, r.revision, r.rel_path, r.sha256, r.hash, r.created_at ?? nowIso());
    return scriptRevisions.get(db, r.script_id, r.revision)!;
  },
  get(db: Db, scriptId: string, revision: number): ScriptRevisionRow | undefined {
    return db.prepare("SELECT * FROM script_revisions WHERE script_id = ? AND revision = ?").get(scriptId, revision) as ScriptRevisionRow | undefined;
  },
};

/**
 * План сценария в таблицах visual_plans / visual_plan_revisions (без scene_plans и
 * visual_opportunities — их столбцы для видео): `plans.insertRevision` сценарный документ не примет.
 */
/** Числовая часть id (`ss_012` → 12); без цифр — бесконечность (в конец). */
const idNum = (id: string): number => {
  const m = /(\d+)$/.exec(id);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};

export const scriptPlans = {
  create(db: Db, p: { id: string; project_id: string }): plans.PlanRow {
    return plans.create(db, p);
  },
  /** Индекс опубликованной ревизии: `hash = canonicalHash(doc)` (субъект Approval B), `current_revision` вперёд. */
  insertRevision(db: Db, r: { doc: ScriptPlanRevisionDoc; rel_path: string; sha256: string }): plans.PlanRevisionRow {
    if (!r.rel_path.endsWith("/script-plan.json")) throw new Error(`db: ревизия плана сценария — только файл script-plan.json, не ${r.rel_path}`);
    const doc = ScriptPlanRevisionDocSchema.parse(r.doc);
    db.prepare("INSERT INTO visual_plan_revisions (plan_id, revision, parent_revision, rel_path, sha256, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(doc.plan_id, doc.revision, doc.parent_revision ?? null, r.rel_path, r.sha256, canonicalHash(doc), nowIso());
    advanceCurrent(db, "visual_plans", doc.plan_id, doc.revision, "плана сценария");
    return plans.revision(db, doc.plan_id, doc.revision)!;
  },
};

export const scriptBatches = {
  insert(db: Db, b: New<ScriptBatchRow>): ScriptBatchRow {
    db.prepare("INSERT INTO script_batches (id, project_id, plan_id, plan_revision, aspect, approval_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(b.id, b.project_id, b.plan_id, b.plan_revision, b.aspect, b.approval_id, b.created_at ?? nowIso());
    return scriptBatches.get(db, b.id)!;
  },
  get(db: Db, id: string): ScriptBatchRow | undefined {
    return db.prepare("SELECT * FROM script_batches WHERE id = ?").get(id) as ScriptBatchRow | undefined;
  },
  /** По времени создания. */
  listByProject(db: Db, projectId: string): ScriptBatchRow[] {
    return db.prepare("SELECT * FROM script_batches WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as ScriptBatchRow[];
  },
};

export const scriptScenes = {
  insert(db: Db, s: New<ScriptSceneRow>): ScriptSceneRow {
    db.prepare(`INSERT INTO script_scenes (project_id, plan_id, item_id, aspect, scene_id, batch_id, job_id, item_fingerprint, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(s.project_id, s.plan_id, s.item_id, s.aspect, s.scene_id, s.batch_id, s.job_id, s.item_fingerprint, s.created_at ?? nowIso());
    return scriptScenes.get(db, s.plan_id, s.item_id, s.aspect)!;
  },
  get(db: Db, planId: string, itemId: string, aspect: Aspect): ScriptSceneRow | undefined {
    return db.prepare("SELECT * FROM script_scenes WHERE plan_id = ? AND item_id = ? AND aspect = ?").get(planId, itemId, aspect) as ScriptSceneRow | undefined;
  },
  /** Сцены плана одного формата по числовой части id сцены плана (`ss_NNN` — порядок создания, не текста). */
  listByPlan(db: Db, planId: string, aspect: Aspect): ScriptSceneRow[] {
    const rows = db.prepare("SELECT * FROM script_scenes WHERE plan_id = ? AND aspect = ?").all(planId, aspect) as ScriptSceneRow[];
    return rows.sort((a, b) => idNum(a.item_id) - idNum(b.item_id) || a.item_id.localeCompare(b.item_id));
  },
  /** Последняя задача генерации сцены (и отпечаток сцены плана, по которому она поставлена); нет строки — ошибка. */
  setJob(db: Db, sceneId: string, jobId: string, itemFingerprint?: string): void {
    const r = itemFingerprint === undefined
      ? db.prepare("UPDATE script_scenes SET job_id = ? WHERE scene_id = ?").run(jobId, sceneId)
      : db.prepare("UPDATE script_scenes SET job_id = ?, item_fingerprint = ? WHERE scene_id = ?").run(jobId, itemFingerprint, sceneId);
    if (r.changes !== 1) throw new Error(`db: сцены сценария ${sceneId} нет`);
  },
};

export const scriptPackages = {
  insert(db: Db, p: New<ScriptPackageRow>): ScriptPackageRow {
    db.prepare("INSERT INTO script_packages (id, project_id, job_id, aspect, rel_path, manifest_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(p.id, p.project_id, p.job_id, p.aspect, p.rel_path, p.manifest_sha256, p.created_at ?? nowIso());
    return scriptPackages.get(db, p.id)!;
  },
  get(db: Db, id: string): ScriptPackageRow | undefined {
    return db.prepare("SELECT * FROM script_packages WHERE id = ?").get(id) as ScriptPackageRow | undefined;
  },
  /** По времени создания. */
  listByProject(db: Db, projectId: string): ScriptPackageRow[] {
    return db.prepare("SELECT * FROM script_packages WHERE project_id = ? ORDER BY created_at, rowid").all(projectId) as ScriptPackageRow[];
  },
};
