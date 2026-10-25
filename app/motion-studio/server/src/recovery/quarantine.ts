// Черновики в карантине (Task 47): каталоги с маркером `.quarantined` в `workspace/drafts`
// (попытки, экспорт, сироты экспортов) и `workspace/quarantine/artifacts` (сироты публикации).
// Автоматически удаляются только одноразовые (`cancelled`/`abandoned`/`interrupted`, H6);
// остальные ждут человека: удаление — только явно, по токену подтверждения и без живых
// процессов попытки.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { ProcessRegistry } from "@ms/core";
import { ORPHANS_REL } from "../artifacts/store.js";
import type { Db } from "../db/open.js";
import { attemptAlive } from "../jobs/queue.js";
import { checkToken, dirStats, issueToken } from "../projects/delete-intent.js";
import { LifecycleError } from "../projects/lifecycle.js";
import { QUARANTINE, draftAttempt, unlockDirs } from "../scenes/store.js";

const DRAFTS_REL = "workspace/drafts";

export interface QuarantineEntry {
  /** Каталог относительно корня хранилища. */
  dir: string;
  job_id: string | null;
  attempt: number | null;
  reason: string;
  bytes: number;
  /** Время карантина из маркера. */
  at: string | null;
}

function readMarker(dir: string): { reason: string; at: string | null } | undefined {
  try {
    const m = JSON.parse(readFileSync(join(dir, QUARANTINE), "utf8")) as { reason?: unknown; at?: unknown };
    return { reason: typeof m.reason === "string" && m.reason ? m.reason : "без причины", at: typeof m.at === "string" ? m.at : null };
  } catch {
    return existsSync(join(dir, QUARANTINE)) ? { reason: "маркер карантина не читается", at: null } : undefined;
  }
}

/** Все каталоги в карантине, по пути; `job_id` — задача попытки, если она есть в базе. */
export function listQuarantined(root: string, db: Db): QuarantineEntry[] {
  const out: QuarantineEntry[] = [];
  for (const base of [DRAFTS_REL, ORPHANS_REL]) {
    const abs = join(root, base);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const dir = join(abs, e.name);
      const marker = readMarker(dir);
      if (!marker) continue;
      const a = base === DRAFTS_REL ? draftAttempt(e.name) : undefined;
      // журнал открывается по задаче: id — только если задача есть в базе
      const known = a !== undefined && db.prepare("SELECT 1 FROM jobs WHERE id = ?").get(a.runId) !== undefined;
      out.push({ dir: `${base}/${e.name}`, job_id: known ? a.runId : null, attempt: a ? a.attempt : null, ...marker, bytes: dirStats(dir).bytes });
    }
  }
  return out.sort((x, y) => (x.dir < y.dir ? -1 : x.dir > y.dir ? 1 : 0));
}

function findEntry(root: string, db: Db, dir: string): QuarantineEntry {
  const e = listQuarantined(root, db).find((q) => q.dir === dir);
  if (!e) throw new LifecycleError("quarantine_not_found", "такого черновика в карантине нет");
  return e;
}

const stateOf = (e: QuarantineEntry, root: string) => ({ reason: e.reason, at: e.at, ...dirStats(join(root, e.dir)) });

/** Подтверждение удаления черновика: размер и токен на 10 минут. */
export function discardIntent(root: string, db: Db, dir: string): { token: string; bytes: number; expiresAt: string } {
  const e = findEntry(root, db, dir);
  return { ...issueToken("discard", dir, stateOf(e, root)), bytes: e.bytes };
}

export interface DiscardCore {
  root: string;
  db: Db;
  processes: ProcessRegistry;
}

/**
 * Удаляет черновик из карантина — только каталог из списка, по токену, когда процессов его
 * попытки нет (`process_alive`). Права записи снимаются только с каталогов (в draft могут быть
 * жёсткие ссылки на опубликованные файлы).
 */
export async function discardQuarantined(
  core: DiscardCore,
  dir: string,
  token: string,
  opts: { alive?: (jobId: string, attempt: number) => Promise<boolean> } = {},
): Promise<{ removed: string }> {
  const e = findEntry(core.root, core.db, dir);
  checkToken("discard", dir, stateOf(e, core.root), token);
  const a = draftAttempt(e.dir.slice(e.dir.lastIndexOf("/") + 1));
  if (e.dir.startsWith(`${DRAFTS_REL}/`) && a) {
    const alive = await (opts.alive ?? ((j, n) => attemptAlive(core.processes, j, n)))(a.runId, a.attempt);
    if (alive) throw new LifecycleError("process_alive", `процессы попытки ${a.attempt} задачи ${a.runId} ещё живы — черновик удалять нельзя`, { job_id: a.runId });
  }
  const abs = join(core.root, e.dir);
  await unlockDirs(abs);
  await rm(abs, { recursive: true, force: true });
  return { removed: e.dir };
}
