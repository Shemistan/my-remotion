// Копия оригинала в хранилище (Task 25, Global Constraints «Оригинал неизменяем»): исходник
// только читается; на том же томе — APFS-клон (`COPYFILE_FICLONE`), иначе потоковая копия с
// хешем на лету. Один проход чтения (S17c, F4: было три — хеш до, копия, хеш после): sha256
// считается по копии (у потоковой — по байтам, записанным в неё), неизменность источника —
// отпечаток stat (dev, ino, размер, mtime и ctime в нс) до и после; размер копии = размеру
// источника. ctime ядро ставит при любой записи и смене mtime — из user space его не вернуть.
// Расхождение — ошибка, копия удаляется. Копия — `0444`. Чтение отменяемо (`signal`), прогресс — `onBytes`.
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
  /** Прочитано байт (прирост): один проход — копия с хешем (у клона — хеш копии). */
  onBytes?: (n: number) => void;
  /** Потоковая копия даже на том же томе (тесты пути «другой том»). */
  forceStream?: boolean;
  /** Сразу после копирования, до проверки источника (тесты: подмена источника). */
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

/** Отпечаток файла: любая запись меняет размер или mtime/ctime (нс), подмена пути — ino. */
async function fingerprint(path: string): Promise<{ dev: bigint; size: bigint; file: string; id: string }> {
  const st = await stat(path, { bigint: true });
  return { dev: st.dev, size: st.size, file: `${st.dev}:${st.ino}`, id: [st.size, st.mtimeNs, st.ctimeNs].join(":") };
}

/**
 * `original.<ext>` в `destDir` (существующий файл — ошибка, перезаписи нет). Тот же том —
 * `COPYFILE_FICLONE` (libuv на macOS зовёт `copyfile(COPYFILE_CLONE)` — APFS-клон; `FICLONE_FORCE`
 * не реализован, ENOSYS), затем sha256 копии; другой том — потоковая копия, sha256 на лету.
 * `cloned` = источник на том же устройстве. `srcSha256Before`/`After` — sha256 копии (или
 * переданный `srcSha256`): содержимое источника равно копии, раз отпечаток stat не изменился.
 */
export async function copyOriginal(src: string, destDir: string, opts: CopyOriginalOptions = {}): Promise<CopiedOriginal> {
  const { signal, onBytes } = opts;
  signal?.throwIfAborted();
  const ext = opts.ext ?? videoExt(src) ?? "bin";
  await mkdir(destDir, { recursive: true });
  const dest = join(destDir, `original.${ext}`);
  const hashOpts = { ...(signal ? { signal } : {}), ...(onBytes ? { onBytes } : {}) };
  const before = await fingerprint(src);
  const sameDevice = before.dev === (await stat(destDir, { bigint: true })).dev;
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
    const after = await fingerprint(src);
    if (after.file !== before.file) throw new MediaInvalidError(`исходник подменён во время импорта (путь ${src} ведёт к другому файлу)`);
    const copySize = (await stat(dest, { bigint: true })).size;
    const known = opts.srcSha256 ?? copy;
    if (after.id !== before.id || copySize !== before.size || copy !== known) {
      throw new MediaInvalidError(`исходник изменился во время импорта (размер ${before.size} → ${after.size}, копия ${copySize} байт; mtime/ctime/inode ${after.id === before.id ? "те же" : "другие"}; sha256 копии ${copy.slice(0, 12)}…, ожидался ${known.slice(0, 12)}…)`);
    }
    await chmod(dest, 0o444);
    return { path: dest, sha256: copy, cloned, srcSha256Before: known, srcSha256After: copy };
  } catch (e) {
    if (created) await rm(dest, { force: true });
    throw e;
  }
}
