// Границы импорта (Task 25, Review Focus 1): импорт по пути — только регулярный видеофайл
// внутри `media.importRoots` (по realpath, симлинк наружу не проходит); выход ffmpeg никогда
// не пишется в `source/` проекта и не совпадает с путём оригинала.
import { lstat, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { MediaInvalidError } from "./probe.js";

export const VIDEO_EXTENSIONS = ["mov", "mp4", "m4v", "mkv", "webm"] as const;

export const videoExt = (p: string): string | undefined => {
  const e = extname(p).slice(1).toLowerCase();
  return (VIDEO_EXTENSIONS as readonly string[]).includes(e) ? e : undefined;
};

/** `child` внутри `parent` (или равен) — по сегментам, не по префиксу строки. */
export function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel) && rel.split(sep)[0] !== "..");
}

/**
 * Путь импорта → realpath регулярного видеофайла внутри одного из корней (корни тоже по
 * realpath; несуществующие пропускаются). Относительный путь, URL, каталог, спецфайл, чужое
 * расширение, путь вне корней — `MediaInvalidError`.
 */
export async function resolveImportPath(p: string, roots: string[]): Promise<string> {
  if (!isAbsolute(p)) throw new MediaInvalidError(`путь импорта должен быть абсолютным путём к файлу: ${JSON.stringify(p)}`);
  let real: string;
  try {
    real = await realpath(p);
  } catch (e) {
    throw new MediaInvalidError(`файл не найден: ${p} (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`);
  }
  const st = await lstat(real);
  if (!st.isFile()) throw new MediaInvalidError(`не обычный файл: ${p}`);
  if (!videoExt(real)) throw new MediaInvalidError(`расширение не видео (${VIDEO_EXTENSIONS.join(", ")}): ${p}`);
  const realRoots: string[] = [];
  for (const r of roots) {
    try {
      realRoots.push(await realpath(r));
    } catch {
      // корня нет (диск не подключён) — пропускаем
    }
  }
  if (!realRoots.some((r) => isInside(real, r))) {
    throw new MediaInvalidError(`файл вне разрешённых каталогов импорта (media.importRoots: ${roots.join(", ")}): ${p}`);
  }
  return real;
}

/**
 * Выход ffmpeg: не внутри `workspace/projects/<p>/source/` хранилища `root` и не равен ни
 * одному из `originals` (по нормализованному пути) — иначе ошибка.
 */
export function assertOutsideSource(outPath: string, root: string, originals: string[] = []): void {
  const out = resolve(outPath);
  for (const o of originals) {
    if (resolve(o) === out) throw new Error(`assertOutsideSource: выход ffmpeg совпадает с путём оригинала: ${outPath}`);
  }
  const projects = resolve(root, "workspace/projects");
  if (!isInside(out, projects)) return;
  const parts = relative(projects, out).split(sep);
  if (parts[1] === "source") throw new Error(`assertOutsideSource: выход ffmpeg в source/ запрещён: ${outPath}`);
}
