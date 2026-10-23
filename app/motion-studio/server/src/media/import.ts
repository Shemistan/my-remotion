// Копия оригинала в хранилище (Task 25, Global Constraints «Оригинал неизменяем»): исходник
// только читается; на том же томе — APFS-клон (`COPYFILE_FICLONE`), иначе обычная копия;
// sha256 исходника до и после и sha256 копии совпадают, иначе копия удаляется. Копия — `0444`.
import { constants } from "node:fs";
import { chmod, copyFile, mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
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

/**
 * `original.<ext>` в `destDir` (существующий файл — ошибка, перезаписи нет). Копия —
 * `COPYFILE_FICLONE`: на macOS libuv зовёт `copyfile(COPYFILE_CLONE)` — APFS-клон, если файл
 * на том же томе, иначе обычная копия. `COPYFILE_FICLONE_FORCE` на macOS не реализован (ENOSYS),
 * поэтому `cloned` = источник на том же устройстве, что и каталог копии.
 */
export async function copyOriginal(src: string, destDir: string, opts: { srcSha256?: string } = {}): Promise<CopiedOriginal> {
  const ext = videoExt(src) ?? "bin";
  await mkdir(destDir, { recursive: true });
  const dest = join(destDir, `original.${ext}`);
  const before = opts.srcSha256 ?? (await sha256File(src));
  await copyFile(src, dest, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE);
  const cloned = (await stat(src)).dev === (await stat(destDir)).dev;
  try {
    const copy = await sha256File(dest, { sync: true });
    const after = await sha256File(src);
    if (after !== before || copy !== before) {
      throw new MediaInvalidError(`исходник изменился во время импорта (sha256 до ${before.slice(0, 12)}…, после ${after.slice(0, 12)}…, копия ${copy.slice(0, 12)}…)`);
    }
    await chmod(dest, 0o444);
    return { path: dest, sha256: copy, cloned, srcSha256Before: before, srcSha256After: after };
  } catch (e) {
    await rm(dest, { force: true });
    throw e;
  }
}
