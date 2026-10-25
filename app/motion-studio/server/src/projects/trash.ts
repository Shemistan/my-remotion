// Корзина проектов (Task 47, F14): удаление — перенос каталога проекта `workspace/projects/<id>`
// в `workspace/trash/<id>-<ts>/` (rename на том же томе, данные не стираются) и
// `projects.deleted_at`; восстановление — обратный rename. Запись БД и rename — в одной
// транзакции: rename падает — откат БД. Сбой процесса между rename и COMMIT разбирает
// `reconcileTrash` при старте — всегда в сторону «не удалён» (данные человека снова видны).
// Стирает каталоги только задача `trash.purge` после второго подтверждения.
import { existsSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { safeMkdirSync } from "@ms/core";
import { PROJECTS_REL } from "../artifacts/paths.js";
import type { Db } from "../db/open.js";
import * as projects from "../db/repos/projects.js";
import * as trashRepo from "../db/repos/trash.js";
import { nowIso } from "../db/repos/util.js";
import { tx } from "../db/tx.js";
import { newId } from "../scenes/ids.js";
import { dirStats, verifyDeleteToken } from "./delete-intent.js";
import { LifecycleError, requireIdle, requireLive, requireNotProtected } from "./lifecycle.js";

export const TRASH_REL = "workspace/trash";

/** Имя каталога корзины: `<project>-<YYYYMMDD>T<HHMMSSmmm>Z` (проект — до последнего `-`). */
const TRASH_NAME = /^(.+)-(\d{8}T\d{9}Z)$/;

export interface LifecycleCore {
  root: string;
  db: Db;
}

const stamp = (iso: string) => iso.replace(/[-:.]/g, "");

/** Каталог корзины формы `workspace/trash/<имя>` (без выхода наружу). */
export function isTrashRel(rel: string): boolean {
  const name = rel.startsWith(`${TRASH_REL}/`) ? rel.slice(TRASH_REL.length + 1) : "";
  return TRASH_NAME.test(name) && !name.includes("/") && name !== "." && name !== "..";
}

/**
 * Удаление в корзину: занятый проект — `project_busy` (с id задач), токен устарел или состояние
 * изменилось — `intent_expired`, название не совпало (после trim) — `confirm_mismatch`.
 */
export function deleteProject(core: LifecycleCore, id: string, body: { token: string; confirm_title: string }): { trashId: string; relPath: string } {
  const { db, root } = core;
  requireNotProtected(id);
  const p = requireLive(db, id);
  requireIdle(db, id);
  verifyDeleteToken(db, root, id, body.token);
  if (body.confirm_title.trim() !== p.title) throw new LifecycleError("confirm_mismatch", "введённое название не совпадает с названием проекта");

  const at = nowIso();
  const projectRel = `${PROJECTS_REL}/${id}`;
  const relPath = `${TRASH_REL}/${id}-${stamp(at)}`;
  const src = existsSync(join(root, projectRel)) ? join(root, projectRel) : safeMkdirSync(root, projectRel);
  const dst = join(safeMkdirSync(root, TRASH_REL), relPath.slice(TRASH_REL.length + 1));
  if (existsSync(dst)) throw new LifecycleError("restore_conflict", `каталог корзины уже есть: ${relPath}`);
  const bytes = dirStats(src).bytes;
  const trashId = newId("trs");
  try {
    tx(db, () => {
      requireIdle(db, id); // задача могла встать, пока считался размер
      db.prepare("UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?").run(at, at, id);
      trashRepo.insert(db, { id: trashId, project_id: id, rel_path: relPath, bytes, created_at: at });
      renameSync(src, dst);
    });
  } catch (e) {
    // COMMIT не прошёл после rename — вернуть каталог (БД откатилась)
    if (existsSync(dst) && !existsSync(src) && !trashRepo.get(db, trashId)) renameSync(dst, src);
    throw e;
  }
  return { trashId, relPath };
}

/** Восстановление из корзины: каталог возвращается, `deleted_at` снимается, строка корзины удаляется. */
export function restoreFromTrash(core: LifecycleCore, trashId: string): projects.ProjectRow {
  const { db, root } = core;
  const row = trashRepo.get(db, trashId);
  if (!row || row.purged_at) throw new LifecycleError("trash_not_found", `в корзине нет ${trashId}`);
  const src = join(root, row.rel_path);
  const projectRel = `${PROJECTS_REL}/${row.project_id}`;
  const dst = join(root, projectRel);
  if (!isTrashRel(row.rel_path) || !existsSync(src)) throw new LifecycleError("trash_not_found", `каталога ${row.rel_path} в корзине нет`);
  if (existsSync(dst)) throw new LifecycleError("restore_conflict", `каталог проекта ${row.project_id} уже существует — восстановление перезаписало бы его`);
  safeMkdirSync(root, PROJECTS_REL);
  try {
    tx(db, () => {
      db.prepare("UPDATE projects SET deleted_at = NULL, updated_at = ? WHERE id = ?").run(nowIso(), row.project_id);
      trashRepo.remove(db, trashId);
      renameSync(src, dst);
    });
  } catch (e) {
    if (existsSync(dst) && !existsSync(src) && trashRepo.get(db, trashId)) renameSync(dst, src);
    throw e;
  }
  return projects.get(db, row.project_id)!;
}

export interface TrashEntry {
  id: string;
  project_id: string;
  title: string;
  kind: projects.ProjectRow["kind"];
  bytes: number;
  created_at: string;
}

/** Корзина для UI: не очищенные строки с названием проекта, новые первыми. */
export function listTrash(db: Db): TrashEntry[] {
  return trashRepo.listActive(db).map((r) => {
    const p = db.prepare("SELECT title, kind FROM projects WHERE id = ?").get(r.project_id) as { title: string; kind: TrashEntry["kind"] };
    return { id: r.id, project_id: r.project_id, title: p.title, kind: p.kind, bytes: r.bytes, created_at: r.created_at };
  });
}

export interface TrashReconcile {
  /** Проекты, возвращённые из «полуудалённого» состояния. */
  restored: string[];
  /** Строки корзины без каталога и без каталога проекта / каталоги без проекта — не тронуты. */
  orphans: string[];
}

/**
 * Шаг загрузки `reconcile_trash` (до сверки версий: иначе версии проекта, чей каталог «пропал»
 * между rename и COMMIT, были бы помечены сломанными):
 * (а) строка корзины, проект удалён, каталога в корзине нет, каталог проекта на месте — rename
 *     восстановления дошёл, COMMIT нет → снять `deleted_at`, удалить строку;
 * (б) каталог в корзине без строки, проект есть, не удалён, его каталога нет — rename удаления
 *     дошёл, COMMIT нет → вернуть каталог.
 */
export function reconcileTrash(db: Db, root: string): TrashReconcile {
  const out: TrashReconcile = { restored: [], orphans: [] };
  for (const row of trashRepo.listActive(db)) {
    const inTrash = existsSync(join(root, row.rel_path));
    const inProjects = existsSync(join(root, PROJECTS_REL, row.project_id));
    if (inTrash) continue;
    if (!inProjects) {
      out.orphans.push(row.rel_path);
      continue;
    }
    tx(db, () => {
      db.prepare("UPDATE projects SET deleted_at = NULL WHERE id = ?").run(row.project_id);
      trashRepo.remove(db, row.id);
    });
    out.restored.push(row.project_id);
  }
  const base = join(root, TRASH_REL);
  if (!existsSync(base)) return out;
  for (const e of readdirSync(base, { withFileTypes: true })) {
    const rel = `${TRASH_REL}/${e.name}`;
    const m = TRASH_NAME.exec(e.name);
    if (!e.isDirectory() || !m || trashRepo.hasRelPath(db, rel)) continue;
    const projectId = m[1]!;
    const deleted = db.prepare("SELECT deleted_at FROM projects WHERE id = ?").get(projectId) as { deleted_at: string | null } | undefined;
    const dst = join(root, PROJECTS_REL, projectId);
    if (!deleted || deleted.deleted_at || existsSync(dst)) {
      out.orphans.push(rel);
      continue;
    }
    safeMkdirSync(root, PROJECTS_REL);
    renameSync(join(base, e.name), dst);
    out.restored.push(projectId);
  }
  return out;
}
