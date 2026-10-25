// Кэш стоп-кадров (Task 49a): кадры для QA, сравнения версий и миниатюр по ключу содержимого
// (`contentKey` версии сцены или `tl-<sha256>` таймлайна), номеру кадра и размеру —
// `<root>/cache/stills/<ключ>/<кадр>-<w>x<h>.png`. Один и тот же кадр второй раз не рендерится:
// вызывающий сначала спрашивает `get`, рендерит только промах и кладёт результат `put`.
// Ключ содержимого меняется вместе с кодом, props, motion-kit и Remotion, поэтому кадр из кэша —
// тот же кадр. Каталог ключа уборка кэша (`gcCache`) удаляет вместе с бандлом того же ключа;
// `get`/`put` отмечают использование (`cache/used/<ключ>.json`) — LRU уборки.
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { safeMkdir } from "@ms/core";
import { markCacheUse } from "@ms/render";

export const STILLS_REL = "cache/stills";
/** Ключ содержимого: sha256 версии сцены или таймлайна (`tl-`). */
export const CONTENT_KEY_RE = /^(?:tl-)?[0-9a-f]{64}$/;

export interface StillSize {
  width: number;
  height: number;
}

function checkArgs(key: string, frame: number, size: StillSize): void {
  if (!CONTENT_KEY_RE.test(key)) throw new Error(`stills: ключ содержимого не годится: ${JSON.stringify(key)}`);
  if (!Number.isInteger(frame) || frame < 0) throw new Error(`stills: кадр должен быть целым >= 0: ${frame}`);
  for (const v of [size.width, size.height]) if (!Number.isInteger(v) || v < 1 || v > 16384) throw new Error(`stills: размер ${size.width}x${size.height} не годится`);
}

export interface StillsCache {
  /** Путь кадра в кэше (файла может не быть). */
  path(key: string, frame: number, size: StillSize): string;
  /** Кадр из кэша или `undefined` (промах). Попадание отмечает использование ключа. */
  get(key: string, frame: number, size: StillSize, jobId?: string): string | undefined;
  /** Кладёт отрендеренный кадр `src` (копия, атомарно) и возвращает путь в кэше. */
  put(key: string, frame: number, size: StillSize, src: string, jobId?: string): Promise<string>;
}

/** Кэш стоп-кадров хранилища `root`. */
export function stillsCache(root: string): StillsCache {
  const cacheDir = join(root, "cache");
  const path = (key: string, frame: number, size: StillSize) => {
    checkArgs(key, frame, size);
    return join(root, STILLS_REL, key, `${frame}-${size.width}x${size.height}.png`);
  };
  return {
    path,
    get(key, frame, size, jobId) {
      const p = path(key, frame, size);
      if (!existsSync(p)) return undefined;
      void markCacheUse(cacheDir, key, jobId);
      return p;
    },
    async put(key, frame, size, src, jobId) {
      const p = path(key, frame, size);
      await safeMkdir(root, `${STILLS_REL}/${key}`);
      const tmp = `${p}.${process.pid}-${randomBytes(4).toString("hex")}.tmp`;
      try {
        await copyFile(src, tmp);
        await rename(tmp, p);
      } catch (e) {
        await rm(tmp, { force: true }).catch(() => undefined);
        throw e;
      }
      await markCacheUse(cacheDir, key, jobId);
      return p;
    },
  };
}
