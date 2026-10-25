// Шаг загрузки `reconcile_exports` (Task 19 F6): сверка каталогов `exports/` с таблицей
// `exports`. Публикация экспорта переносит draft в `exports/<id>/` внутри транзакции; крах
// между rename и COMMIT оставляет каталог без строки — через API он не виден, но занимает SSD.
// Такой каталог уходит в карантин `workspace/drafts/orphan-export-<id>/` (решение — за
// человеком, файлы не удаляются). Каталоги со строкой, чей корень остался записываемым
// (сбой `sealVersion` после COMMIT), закрываются от записи.
import { existsSync } from "node:fs";
import { chmod, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { safeMkdir } from "@ms/core";
import * as exportsRepo from "../db/repos/exports.js";
import type { Db } from "../db/open.js";
import { lifecycleOf } from "../projects/lifecycle.js";
import { lockChildren, quarantineDir, sealVersion, writablePath } from "./store.js";

export interface ExportsReconcile {
  /** Каталоги экспорта, закрытые от записи при старте. */
  relocked: string[];
  /** Каталоги без строки в БД, перенесённые в карантин. */
  quarantined: { dir: string; to: string }[];
  /** id строк, чьего каталога нет (кроме проектов в корзине). */
  missing: string[];
  /** Каталоги, которые разобрать не удалось (не тронуты). */
  errors: { dir: string; error: string }[];
}

const subdirs = async (d: string) => (existsSync(d) ? (await readdir(d, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name) : []);

export async function reconcileExports(db: Db, root: string): Promise<ExportsReconcile> {
  const out: ExportsReconcile = { relocked: [], quarantined: [], missing: [], errors: [] };
  const rows = new Map(exportsRepo.listAll(db).map((r) => [r.id, r]));
  const seen = new Set<string>();
  for (const project of await subdirs(join(root, "workspace/projects"))) {
    const base = join(root, "workspace/projects", project, "exports");
    for (const id of await subdirs(base)) {
      const dir = join(base, id);
      try {
        const row = rows.get(id);
        if (row && row.path.startsWith(`workspace/projects/${project}/exports/${id}/`)) {
          seen.add(id);
          if ((await writablePath(dir)) === undefined) continue;
          await lockChildren(dir);
          await sealVersion(dir);
          out.relocked.push(dir);
          continue;
        }
        // строки нет: в карантин, а не удаление
        const drafts = await safeMkdir(root, "workspace/drafts");
        const to = join(drafts, `orphan-export-${id}`);
        if (existsSync(to)) throw new Error(`карантин занят: ${to}`);
        await chmod(dir, 0o755); // rename каталога и маркер требуют записи в его корень
        await rename(dir, to);
        await quarantineDir(to, `orphan_export: каталог exports/${id} без строки в БД (сбой между rename и COMMIT)`);
        out.quarantined.push({ dir, to });
      } catch (e) {
        out.errors.push({ dir, error: (e as Error).message });
      }
    }
  }
  // экспорты проекта в корзине лежат в `workspace/trash/…` — не пропали (Task 47)
  const inTrash = (path: string) => {
    const m = /^workspace\/projects\/([^/]+)\//.exec(path);
    return m !== null && Boolean(lifecycleOf(db, m[1]!)?.deleted_at);
  };
  for (const [id, row] of rows) if (!seen.has(id) && !inTrash(row.path)) out.missing.push(id);
  return out;
}
