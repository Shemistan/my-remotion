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

export interface ImportFile {
  /** realpath файла. */
  path: string;
  dev: number;
  ino: number;
  size: number;
}

export interface ResolveImportOptions {
  /** Каталоги, из которых импорт запрещён, даже если они внутри корней (хранилище `MS_DATA_DIR`, ревью M3). */
  forbidden?: string[];
}

/** Как `resolveImportFile`, только путь. */
export async function resolveImportPath(p: string, roots: string[], o: ResolveImportOptions = {}): Promise<string> {
  return (await resolveImportFile(p, roots, o)).path;
}

/**
 * Путь импорта → realpath регулярного видеофайла внутри одного из корней (корни тоже по
 * realpath; несуществующие пропускаются) и не внутри `forbidden`, с dev/ino из lstat (ревью M2:
 * после копии вызывающий сверяет, что это тот же файл). Относительный путь, URL, каталог,
 * спецфайл, чужое расширение, путь вне корней или в хранилище — `MediaInvalidError`.
 */
export async function resolveImportFile(p: string, roots: string[], o: ResolveImportOptions = {}): Promise<ImportFile> {
  if (!isAbsolute(p)) throw new MediaInvalidError(`путь импорта должен быть абсолютным путём к файлу: ${JSON.stringify(p)}`, "not_absolute");
  let real: string;
  try {
    real = await realpath(p);
  } catch (e) {
    throw new MediaInvalidError(`файл не найден: ${p} (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`, "not_found");
  }
  const st = await lstat(real);
  if (!st.isFile()) throw new MediaInvalidError(`не обычный файл: ${p}`, "not_file");
  if (!videoExt(real)) throw new MediaInvalidError(`расширение не видео (${VIDEO_EXTENSIONS.join(", ")}): ${p}`, "bad_extension");
  const realRoots: string[] = [];
  for (const r of roots) {
    try {
      realRoots.push(await realpath(r));
    } catch {
      // корня нет (диск не подключён) — пропускаем
    }
  }
  if (!realRoots.some((r) => isInside(real, r))) {
    throw new MediaInvalidError(`файл вне разрешённых каталогов импорта (media.importRoots: ${roots.join(", ")}): ${p}`, "outside_roots");
  }
  for (const f of o.forbidden ?? []) {
    const rf = await realpath(f).catch(() => resolve(f));
    if (isInside(real, rf)) throw new MediaInvalidError(`файл внутри хранилища Motion Studio — импорт оттуда запрещён: ${p}`, "in_storage");
  }
  return { path: real, dev: st.dev, ino: st.ino, size: st.size };
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
