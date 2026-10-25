// Жизненный цикл проекта (Task 47): переименование, архив, признаки архива и удаления для всех
// видов проектов (`playground`, `video`, `script`). Архивный и удалённый проект задач не
// принимает (`enqueue`, повтор); архив и удаление занятого проекта — `project_busy`.
import type { JobStatus, ProjectDto, ProjectLifecycleDto } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as projects from "../db/repos/projects.js";
import { nowIso } from "../db/repos/util.js";
import { tx } from "../db/tx.js";
import { DEFAULT_PROJECT } from "../scenes/store.js";

export type LifecycleCode =
  | "invalid_title" | "project_not_found" | "project_protected" | "project_busy" | "project_archived" | "project_deleted"
  | "confirm_mismatch" | "intent_expired" | "trash_not_found" | "restore_conflict" | "quarantine_not_found" | "process_alive"
  | "boot_report_not_found";

const STATUS: Record<LifecycleCode, number> = {
  invalid_title: 400,
  confirm_mismatch: 400,
  project_not_found: 404,
  trash_not_found: 404,
  quarantine_not_found: 404,
  boot_report_not_found: 404,
  project_protected: 409,
  project_busy: 409,
  project_archived: 409,
  project_deleted: 409,
  intent_expired: 409,
  restore_conflict: 409,
  process_alive: 409,
};

/** Отказ операции над проектом, корзиной или карантином: API отдаёт `code` и статус. */
export class LifecycleError extends Error {
  readonly status: number;
  constructor(
    readonly code: LifecycleCode,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(`${code}: ${message}`);
    this.name = "LifecycleError";
    this.status = STATUS[code];
  }
}

export const TITLE_MAX = 120;

/** Незавершённые задачи: удаление и архив ждут их завершения или отмены. */
export const ACTIVE_STATUSES: readonly JobStatus[] = ["pending", "running", "awaiting_input", "awaiting_approval", "blocked"];

export interface Lifecycle {
  archived_at: string | null;
  deleted_at: string | null;
}

export type ProjectWithLifecycle = ProjectDto & Lifecycle;

/** Колонки 006 уже есть (тесты старых миграций ставят задачи на базе v4–v5): кэш только «да». */
const migrated = new WeakSet<Db>();
function hasLifecycleColumns(db: Db): boolean {
  if (migrated.has(db)) return true;
  const ok = (db.prepare("SELECT name FROM pragma_table_info('projects')").pluck().all() as string[]).includes("deleted_at");
  if (ok) migrated.add(db);
  return ok;
}

export function lifecycleOf(db: Db, id: string): Lifecycle | undefined {
  if (!hasLifecycleColumns(db)) return projects.get(db, id) ? { archived_at: null, deleted_at: null } : undefined;
  return db.prepare("SELECT archived_at, deleted_at FROM projects WHERE id = ?").get(id) as Lifecycle | undefined;
}

/** id незавершённых задач проекта (в т. ч. задач сценарного пакета — они на проекте сценария). */
export function activeJobIds(db: Db, projectId: string): string[] {
  const marks = ACTIVE_STATUSES.map(() => "?").join(", ");
  return db.prepare(`SELECT id FROM jobs WHERE project_id = ? AND status IN (${marks}) ORDER BY created_at, rowid`).pluck().all(projectId, ...ACTIVE_STATUSES) as string[];
}

/** Проект с признаками; нет — `project_not_found`. */
export function requireProject(db: Db, id: string): ProjectWithLifecycle {
  const p = projects.get(db, id);
  const l = lifecycleOf(db, id);
  if (!p || !l) throw new LifecycleError("project_not_found", `проекта ${id} нет`);
  return { ...p, ...l };
}

/** Проект не удалён (удалённый лежит в корзине — изменять нечего). */
export function requireLive(db: Db, id: string): ProjectWithLifecycle {
  const p = requireProject(db, id);
  if (p.deleted_at) throw new LifecycleError("project_deleted", `проект ${id} в корзине — сначала восстановите его`);
  return p;
}

/** Проект по умолчанию (Playground из миграции 001) не архивируется и не удаляется. */
export function requireNotProtected(id: string): void {
  if (id === DEFAULT_PROJECT) throw new LifecycleError("project_protected", "проект Playground по умолчанию нельзя архивировать или удалить");
}

export function requireIdle(db: Db, id: string): void {
  const ids = activeJobIds(db, id);
  if (ids.length > 0) {
    throw new LifecycleError("project_busy", `у проекта ${id} есть незавершённые задачи (${ids.join(", ")}) — дождитесь их или отмените`, { job_ids: ids });
  }
}

/**
 * Перед постановкой новой задачи (`enqueue`) и повтором: архивный — `project_archived`, удалённый —
 * `project_deleted`. Строки проекта нет — пусть отвечает внешний ключ.
 */
export function assertProjectOpen(db: Db, projectId: string): void {
  const l = lifecycleOf(db, projectId);
  if (!l) return;
  if (l.deleted_at) throw new LifecycleError("project_deleted", `проект ${projectId} в корзине — задачи по нему не ставятся`);
  if (l.archived_at) throw new LifecycleError("project_archived", `проект ${projectId} в архиве — верните его из архива, чтобы продолжить`);
}

/** Название после `trim`: 1–120 символов, иначе `invalid_title`. */
export function normalizeTitle(title: string): string {
  const t = title.trim();
  if (t.length < 1 || t.length > TITLE_MAX) throw new LifecycleError("invalid_title", `название — от 1 до ${TITLE_MAX} символов`);
  return t;
}

export function renameProject(db: Db, id: string, title: string): ProjectDto {
  const t = normalizeTitle(title);
  return tx(db, () => {
    requireLive(db, id);
    db.prepare("UPDATE projects SET title = ?, updated_at = ? WHERE id = ?").run(t, nowIso(), id);
    return projects.get(db, id)!;
  });
}

function lifecycleDto(db: Db, id: string): ProjectLifecycleDto {
  const l = lifecycleOf(db, id)!;
  return { project_id: id, archived_at: l.archived_at, deleted_at: l.deleted_at, active_jobs: activeJobIds(db, id).length };
}

/** В архив: скрыт из списка по умолчанию, задачи не ставятся. Повтор — без изменений. */
export function archiveProject(db: Db, id: string): ProjectLifecycleDto {
  return tx(db, () => {
    requireNotProtected(id);
    const p = requireLive(db, id);
    if (!p.archived_at) {
      requireIdle(db, id);
      db.prepare("UPDATE projects SET archived_at = ? WHERE id = ?").run(nowIso(), id);
    }
    return lifecycleDto(db, id);
  });
}

export function unarchiveProject(db: Db, id: string): ProjectLifecycleDto {
  return tx(db, () => {
    requireLive(db, id);
    db.prepare("UPDATE projects SET archived_at = NULL WHERE id = ?").run(id);
    return lifecycleDto(db, id);
  });
}

export type ProjectView = "active" | "archived";

/** Список для UI: активные (не в архиве) или архив; удалённые — только в корзине. */
export function listProjects(db: Db, view: ProjectView = "active"): ProjectWithLifecycle[] {
  return projects.list(db)
    .map((p) => ({ ...p, ...lifecycleOf(db, p.id)! }))
    .filter((p) => view === "archived" ? p.archived_at !== null : p.archived_at === null);
}
