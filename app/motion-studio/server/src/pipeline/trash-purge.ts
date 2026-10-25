// Задача `trash.purge` (Task 47): очистка корзины после второго подтверждения. Вход
// `{ trashIds, token }`: токен сверен API при постановке (`verifyPurgeToken`), здесь каждая
// строка проверяется заново: не очищена, проект всё ещё удалён (не восстановлен), каталог —
// внутри `workspace/trash`. Только такие каталоги стираются целиком (права записи — каталогам),
// затем `purged_at`. Остальное — `skipped`, без ошибки: повтор задачи безопасен.
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import * as trashRepo from "../db/repos/trash.js";
import { nowIso } from "../db/repos/util.js";
import type { JobHandler } from "../jobs/types.js";
import { isTrashRel } from "../projects/trash.js";
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
    const row = trashRepo.get(ctx.db, id);
    const deleted = row && (ctx.db.prepare("SELECT deleted_at FROM projects WHERE id = ?").pluck().get(row.project_id) as string | null);
    if (!row || row.purged_at || !deleted || !isTrashRel(row.rel_path)) {
      skipped.push(id);
      continue;
    }
    const dir = join(root, row.rel_path);
    if (existsSync(dir)) {
      await unlockDirs(dir);
      await rm(dir, { recursive: true, force: true });
    }
    trashRepo.markPurged(ctx.db, id, nowIso());
    ctx.emit("trash_purged", `из корзины удалён ${row.rel_path}`, { trash_id: id, project_id: row.project_id, bytes: row.bytes });
    purged.push(id);
    ctx.progress((i + 1) / ids.length, "purge");
  }
  return { status: "completed", outputRefs: { purged, skipped } };
};
