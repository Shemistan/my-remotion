// Отметки использования кэша (Task 49a): `<cacheDir>/used/<ключ>/<jobId>.json` — каждая задача,
// бравшая бандл, кадры или master, оставляет свою отметку (без задачи — `_.json`); mtime — время
// использования. Уборка (`cache.gc`) защищает ключ, пока активна ЛЮБАЯ из его задач, а LRU ведёт
// по самой свежей отметке: короткий рендер B не затирает отметку долгого экспорта A.
// Отметка ставится до первой записи в кэш (`writeEntry`/`writeTimelineEntry` → `onKey`). Сбой
// записи не роняет рендер — отметка только помогает уборке.
import { randomBytes } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdirOne } from "./entry.js";

export const CACHE_USED_DIR = "used";

/** Ключ отметки: имя каталога кэша (`<sha256>`, `tl-<sha256>`) или `master-<проект>-<media>@<n>-<d>`. */
export const CACHE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_@.-]{0,200}$/;
/** Id задачи в имени файла отметки; без задачи — `_`. */
const JOB_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,200}$/;
export const NO_JOB = "_";

export interface CacheUse {
  job_id: string | null;
  at: string;
}

/** Каталог отметок ключа. */
export function cacheUseDir(cacheDir: string, key: string): string {
  if (!CACHE_KEY_RE.test(key) || key.includes("..")) throw new Error(`cache: ключ не годится: ${JSON.stringify(key)}`);
  return join(cacheDir, CACHE_USED_DIR, key);
}

/** Файл отметки пары (ключ, задача). */
export function cacheUsePath(cacheDir: string, key: string, jobId?: string | null): string {
  const name = jobId && JOB_RE.test(jobId) ? jobId : NO_JOB;
  return join(cacheUseDir(cacheDir, key), `${name}.json`);
}

/** Отмечает использование ключа задачей `jobId` (атомарно: tmp + rename). Ошибки глотает. */
export async function markCacheUse(cacheDir: string, key: string, jobId?: string): Promise<void> {
  try {
    const file = cacheUsePath(cacheDir, key, jobId);
    await mkdirOne(join(cacheDir, CACHE_USED_DIR));
    await mkdirOne(cacheUseDir(cacheDir, key));
    const tmp = `${file}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`;
    const body: CacheUse = { job_id: jobId ?? null, at: new Date().toISOString() };
    await writeFile(tmp, JSON.stringify(body) + "\n");
    await rename(tmp, file);
  } catch {
    // отметка — подсказка уборке, не условие рендера
  }
}
