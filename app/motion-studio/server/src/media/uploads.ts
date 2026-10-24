// Загрузки видео через браузер (Task 29, ревью Task 25 M4): тело запроса пишется в
// `workspace/uploads/<upl_id>/upload.<ext>` (имя на диске — серверное), оттуда `media.import`
// копирует оригинал как при импорте по пути. Каталог загрузки удаляется после `completed` или
// `cancelled` импорта; при старте — уборка загрузок без живой задачи.
import { existsSync } from "node:fs";
import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import { type ImportFile, isInside, videoExt } from "./guards.js";
import { MediaInvalidError } from "./probe.js";

export const UPLOADS_REL = "workspace/uploads";
const UPLOAD_DIR_RE = /^upl_[0-9A-Z]+$/;
const UPLOAD_FILE_RE = /^upload\.(mov|mp4|m4v|mkv|webm)$/;

/** `workspace/uploads/<id>/upload.<ext>` — путь задачи (от корня хранилища, без MS_DATA_DIR). */
export function uploadRel(id: string, ext: string): string {
  if (!UPLOAD_DIR_RE.test(id) || !UPLOAD_FILE_RE.test(`upload.${ext}`)) throw new Error(`uploads: недопустимое имя загрузки: ${id}/${ext}`);
  return `${UPLOADS_REL}/${id}/upload.${ext}`;
}

/**
 * Имя файла пользователя — только для отображения: без каталогов, управляющих и
 * форматирующих символов, не длиннее 200 символов; расширение должно быть видео.
 */
export function displayName(raw: string): string | undefined {
  const base = raw.split(/[\\/]/).pop() ?? "";
  const clean = base.normalize("NFC").replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "").trim().slice(-200);
  if (!clean || clean === "." || clean === ".." || !videoExt(clean)) return undefined;
  return clean;
}

/**
 * Файл загрузки задачи: путь (от корня хранилища или абсолютный) по realpath — ровно
 * `workspace/uploads/<upl_id>/upload.<ext>` хранилища, обычный файл; иначе `MediaInvalidError`.
 */
export async function resolveUploadFile(root: string, uploadPath: string, originalName: string): Promise<ImportFile> {
  if (!videoExt(originalName)) throw new MediaInvalidError("расширение загруженного файла не видео");
  const abs = isAbsolute(uploadPath) ? uploadPath : join(root, uploadPath);
  let real: string;
  let base: string;
  try {
    real = await realpath(abs);
    base = await realpath(join(root, UPLOADS_REL));
  } catch {
    throw new MediaInvalidError("загруженный файл не найден");
  }
  const rel = relative(base, real).split(sep);
  if (!isInside(real, base) || rel.length !== 2 || !UPLOAD_DIR_RE.test(rel[0]!) || !UPLOAD_FILE_RE.test(rel[1]!)) {
    throw new MediaInvalidError(`загруженный файл не в ${UPLOADS_REL}/<id>/`);
  }
  const st = await lstat(real);
  if (!st.isFile()) throw new MediaInvalidError("загрузка — не обычный файл");
  return { path: real, dev: st.dev, ino: st.ino, size: st.size };
}

/** Удаляет каталог загрузки `uploadPath` (только `workspace/uploads/<upl_id>`); ошибки не бросает. */
export async function removeUpload(root: string, uploadPath: string): Promise<void> {
  const abs = isAbsolute(uploadPath) ? uploadPath : join(root, uploadPath);
  const dir = dirname(abs);
  if (dirname(dir) !== join(root, UPLOADS_REL) || !UPLOAD_DIR_RE.test(basename(dir))) return;
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * Уборка при старте: каталог загрузки остаётся, только если на него ссылается задача
 * `media.import`, которую ещё можно выполнить или повторить (pending, running, blocked, failed);
 * сироты (обрыв до создания задачи), завершённые и отменённые — удаляются. Список удалённых.
 */
export async function sweepUploads(db: Db, root: string): Promise<string[]> {
  const dir = join(root, UPLOADS_REL);
  if (!existsSync(dir)) return [];
  const keep = new Set<string>();
  for (const j of jobs.list(db).filter((x) => x.type === "media.import" && ["pending", "running", "blocked", "failed"].includes(x.status))) {
    const p = (j.input as { uploadPath?: unknown } | null)?.uploadPath;
    if (typeof p === "string") keep.add(basename(dirname(p)));
  }
  const removed: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (keep.has(e.name)) continue;
    await rm(join(dir, e.name), { recursive: true, force: true }).catch(() => undefined);
    removed.push(e.name);
  }
  return removed;
}
