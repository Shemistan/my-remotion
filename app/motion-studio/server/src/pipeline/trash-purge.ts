// Задача `trash.purge` (Task 47): очистка корзины после второго подтверждения. Вход
// `{ trashIds, token }`: токен сверен API при постановке (`verifyPurgeToken`), ручной повтор
// разрешён только после сбоя (`retryJob`). Каждая строка проверяется заново в транзакции: не
// очищена, проект всё ещё удалён (не восстановлен), каталог — внутри `workspace/trash`; там же
// каталог переименовывается в `<rel_path>.purging` — с этого момента восстановление строки —
// 409 `trash_purging`. Затем каталог стирается целиком (права записи — каталогам), и только
// после фактической очистки — `purged_at` и событие `trash_purged`. Строка без каталога —
// `skipped`, без ошибки: повтор задачи безопасен и дочищает прерванную очистку.
import { existsSync, renameSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import * as trashRepo from "../db/repos/trash.js";
import { nowIso } from "../db/repos/util.js";
import type { JobHandler } from "../jobs/types.js";
import { tx } from "../db/tx.js";
import { isTrashRel, purgingRel } from "../projects/trash.js";
import { unlockDirs } from "../scenes/store.js";
import type { Phase46Deps } from "./phase46-deps.js";

export type TrashPurgeDeps = Phase46Deps;

const InputSchema = z.object({ trashIds: z.array(z.string().min(1)).min(1), token: z.string().min(1) }).passthrough();

export const trashPurge: (depsOf: () => TrashPurgeDeps) => JobHandler = (depsOf) => async (ctx) => {
  const parsed = InputSchema.safeParse(ctx.job.input);
  if (!parsed.success) return { status: "failed", error: { code: "pipeline", stage: "prepare", message: `trash.purge: неверный вход: ${parsed.error.message}` } };
  const root = depsOf().svc.root;
  const ids = [...new Set(parsed.data.trashIds)];
  const purged: string[] = [];
  const skipped: string[] = [];
  for (const [i, id] of ids.entries()) {
    if (ctx.signal.aborted) return { status: "cancelled", error: { code: "cancelled", stage: "cancelled", message: "задача отменена" } };
    // синхронно, до первого await: проверка и пометка «идёт очистка» не разделены восстановлением
    const row = tx(ctx.db, () => {
      const r = trashRepo.get(ctx.db, id);
      const deleted = r && (ctx.db.prepare("SELECT deleted_at FROM projects WHERE id = ?").pluck().get(r.project_id) as string | null);
      if (!r || r.purged_at || !deleted || !isTrashRel(r.rel_path)) return undefined;
      const dir = join(root, r.rel_path);
      const purging = join(root, purgingRel(r.rel_path));
      if (existsSync(dir)) {
        if (existsSync(purging)) throw new Error(`trash.purge: ${purgingRel(r.rel_path)} уже есть рядом с ${r.rel_path}`);
        renameSync(dir, purging);
      } else if (!existsSync(purging)) return undefined;
      return r;
    });
    if (!row) {
      skipped.push(id);
      continue;
    }
    const dir = join(root, purgingRel(row.rel_path));
    await unlockDirs(dir);
    await rm(dir, { recursive: true, force: true });
    trashRepo.markPurged(ctx.db, id, nowIso());
    ctx.emit("trash_purged", `из корзины удалён ${row.rel_path}`, { trash_id: id, project_id: row.project_id, bytes: row.bytes });
    purged.push(id);
    ctx.progress((i + 1) / ids.length, "purge");
  }
  return { status: "completed", outputRefs: { purged, skipped } };
};
