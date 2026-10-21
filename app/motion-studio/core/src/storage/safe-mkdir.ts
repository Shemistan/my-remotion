import { lstatSync, mkdirSync } from "node:fs";
import { lstat, mkdir } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { StorageError, StoragePathError, readMarker, readMarkerSync, rootProblem, rootProblemSync } from "./guard.js";

function segments(rel: string): string[] {
  const norm = normalize(rel);
  if (rel === "" || isAbsolute(rel) || norm === "." || norm === ".." || norm.startsWith(".." + sep)) {
    throw new StoragePathError(rel);
  }
  return norm.split(sep).filter(Boolean);
}

/**
 * Создаёт подкаталог `rel` внутри хранилища и возвращает его абсолютный путь.
 *
 * Проверяет только, что корень — настоящий каталог (не симлинк) и маркер на месте;
 * том, системный диск, запись и место не проверяет — вызывающий обязан до этого
 * пройти `checkStorage`. Сегменты создаются по одному без `recursive`, поэтому
 * исчезнувший корень не будет воссоздан; симлинки внутри пути не допускаются.
 *
 * `rel`, выходящий за корень, — ошибка программиста: бросается `StoragePathError`
 * (сообщение `storage_path: …`), а не StorageError.
 */
export async function safeMkdir(root: string, rel: string): Promise<string> {
  const parts = segments(rel);
  const problem = await rootProblem(root);
  if (problem) throw new StorageError("not_found", `корень хранилища недоступен: ${problem}`);
  await readMarker(root);

  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      await mkdir(current);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new StorageError("not_writable", `${current}: ${(e as Error).message}`);
      }
    }
    const st = await lstat(current);
    if (!st.isDirectory() || st.isSymbolicLink()) {
      throw new StorageError("not_writable", `${current} — не каталог хранилища (файл или симлинк)`);
    }
  }
  return current;
}

/**
 * Синхронный `safeMkdir` с теми же проверками — для записи внутри синхронной транзакции
 * SQLite (better-sqlite3), где `await` недопустим.
 */
export function safeMkdirSync(root: string, rel: string): string {
  const parts = segments(rel);
  const problem = rootProblemSync(root);
  if (problem) throw new StorageError("not_found", `корень хранилища недоступен: ${problem}`);
  readMarkerSync(root);

  let current = root;
  for (const part of parts) {
    current = join(current, part);
    try {
      mkdirSync(current);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new StorageError("not_writable", `${current}: ${(e as Error).message}`);
      }
    }
    const st = lstatSync(current);
    if (!st.isDirectory() || st.isSymbolicLink()) {
      throw new StorageError("not_writable", `${current} — не каталог хранилища (файл или симлинк)`);
    }
  }
  return current;
}
