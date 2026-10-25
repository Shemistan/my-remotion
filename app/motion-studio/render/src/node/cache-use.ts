// Отметка использования кэша (Task 49a): `<cacheDir>/used/<ключ>.json` — кто (id задачи) и когда
// последним брал бандл, кадры или master; mtime файла — время для LRU уборки (`cache.gc`).
// Отметка пишется ДО запуска worker: уборка не тронет бандл, пока задача-владелец активна.
// Сбой записи не роняет рендер — отметка только помогает уборке.
import { randomBytes } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdirOne } from "./entry.js";

export const CACHE_USED_DIR = "used";

/** Ключ отметки: имя каталога кэша (`<sha256>`, `tl-<sha256>`) или `master-<проект>-<media>@<n>-<d>`. */
export const CACHE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_@.-]{0,200}$/;

export interface CacheUse {
  job_id: string | null;
  at: string;
}

/** Путь отметки ключа. */
export function cacheUsePath(cacheDir: string, key: string): string {
  if (!CACHE_KEY_RE.test(key) || key.includes("..")) throw new Error(`cache: ключ не годится: ${JSON.stringify(key)}`);
  return join(cacheDir, CACHE_USED_DIR, `${key}.json`);
}

/** Отмечает использование ключа задачей `jobId` (атомарно: tmp + rename). Ошибки глотает. */
export async function markCacheUse(cacheDir: string, key: string, jobId?: string): Promise<void> {
  try {
    const file = cacheUsePath(cacheDir, key);
    await mkdirOne(join(cacheDir, CACHE_USED_DIR));
    const tmp = `${file}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`;
    const body: CacheUse = { job_id: jobId ?? null, at: new Date().toISOString() };
    await writeFile(tmp, JSON.stringify(body) + "\n");
    await rename(tmp, file);
  } catch {
    // отметка — подсказка уборке, не условие рендера
  }
}
