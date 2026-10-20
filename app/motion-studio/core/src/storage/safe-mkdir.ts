import { lstat, mkdir } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { StorageError, readMarker } from "./guard.js";

/**
 * Создаёт подкаталог `rel` внутри хранилища. Сначала проверяет, что корень и маркер
 * на месте; затем создаёт сегменты по одному без `recursive`, поэтому исчезнувший
 * корень не будет воссоздан. Симлинки внутри пути не допускаются.
 */
export async function safeMkdir(root: string, rel: string): Promise<string> {
  const norm = normalize(rel);
  if (rel === "" || isAbsolute(rel) || norm === "." || norm === ".." || norm.startsWith(".." + sep)) {
    throw new StorageError("not_found", `путь выходит за пределы хранилища: ${JSON.stringify(rel)}`);
  }
  try {
    if (!(await lstat(root)).isDirectory()) throw new Error("не каталог");
  } catch (e) {
    throw new StorageError("not_found", `корень хранилища недоступен: ${root} (${(e as Error).message})`);
  }
  await readMarker(root);

  let current = root;
  for (const part of norm.split(sep).filter(Boolean)) {
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
