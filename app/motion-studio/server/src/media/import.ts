// Копия оригинала в хранилище (Task 25, Global Constraints «Оригинал неизменяем»): исходник
// только читается; на том же томе — APFS-клон (`COPYFILE_FICLONE`), иначе потоковая копия с
// хешем на лету; sha256 исходника до и после и sha256 копии совпадают, иначе копия удаляется.
// Копия — `0444`. Все чтения отменяемы (`signal`) и дают прогресс (`onBytes`).
import { createHash } from "node:crypto";
import { constants, createReadStream, createWriteStream } from "node:fs";
import { chmod, copyFile, mkdir, open, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { sha256File } from "../scenes/hash.js";
import { videoExt } from "./guards.js";
import { MediaInvalidError } from "./probe.js";

export interface CopiedOriginal {
  path: string;
  sha256: string;
  cloned: boolean;
  srcSha256Before: string;
  srcSha256After: string;
}

export interface CopyOriginalOptions {
  /** sha256 источника, уже посчитанный вызывающим (повторный импорт). */
  srcSha256?: string;
  /** Расширение копии (`original.<ext>`); по умолчанию — из имени источника (загрузки — из `originalName`). */
  ext?: string;
  signal?: AbortSignal;
  /** Прочитано байт (прирост) по всем проходам: хеш до, копия, хеш копии, хеш после. */
  onBytes?: (n: number) => void;
  /** Потоковая копия даже на том же томе (тесты пути «другой том»). */
  forceStream?: boolean;
  /** Сразу после копирования, до проверочных хешей (тесты: подмена источника). */
  onCopied?: () => Promise<void> | void;
}

/** Потоковая копия `src` → `dest` (новый файл) с sha256 прочитанного; fsync перед закрытием. */
async function streamCopy(src: string, dest: string, o: CopyOriginalOptions): Promise<string> {
  const h = createHash("sha256");
  const tap = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      h.update(chunk);
      o.onBytes?.(chunk.length);
      cb(null, chunk);
    },
  });
  const rs = createReadStream(src, { highWaterMark: 1024 * 1024 });
  const ws = createWriteStream(dest, { flags: "wx", mode: 0o600 });
  await (o.signal ? pipeline(rs, tap, ws, { signal: o.signal }) : pipeline(rs, tap, ws));
  const fh = await open(dest, "r+");
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
  return h.digest("hex");
}

/**
 * `original.<ext>` в `destDir` (существующий файл — ошибка, перезаписи нет). Тот же том —
 * `COPYFILE_FICLONE` (libuv на macOS зовёт `copyfile(COPYFILE_CLONE)` — APFS-клон; `FICLONE_FORCE`
 * не реализован, ENOSYS), затем sha256 копии; другой том — потоковая копия, sha256 копии считается
 * на лету (ревью I4: на один полный проход меньше). `cloned` = источник на том же устройстве.
 */
export async function copyOriginal(src: string, destDir: string, opts: CopyOriginalOptions = {}): Promise<CopiedOriginal> {
  const { signal, onBytes } = opts;
  const ext = opts.ext ?? videoExt(src) ?? "bin";
  await mkdir(destDir, { recursive: true });
  const dest = join(destDir, `original.${ext}`);
  const hashOpts = { ...(signal ? { signal } : {}), ...(onBytes ? { onBytes } : {}) };
  const before = opts.srcSha256 ?? (await sha256File(src, hashOpts));
  const sameDevice = (await stat(src)).dev === (await stat(destDir)).dev;
  const cloned = sameDevice && !opts.forceStream;
  let created = false;
  try {
    let copy: string;
    if (cloned) {
      await copyFile(src, dest, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
      created = true;
      await opts.onCopied?.();
      copy = await sha256File(dest, { ...hashOpts, sync: true });
    } else {
      created = true; // `wx`: файл создаёт streamCopy; если он уже был — EEXIST до записи
      try {
        copy = await streamCopy(src, dest, opts);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "EEXIST") created = false;
        throw e;
      }
      await opts.onCopied?.();
    }
    const after = await sha256File(src, hashOpts);
    if (after !== before || copy !== before) {
      throw new MediaInvalidError(`исходник изменился во время импорта (sha256 до ${before.slice(0, 12)}…, после ${after.slice(0, 12)}…, копия ${copy.slice(0, 12)}…)`);
    }
    await chmod(dest, 0o444);
    return { path: dest, sha256: copy, cloned, srcSha256Before: before, srcSha256After: after };
  } catch (e) {
    if (created) await rm(dest, { force: true });
    throw e;
  }
}
