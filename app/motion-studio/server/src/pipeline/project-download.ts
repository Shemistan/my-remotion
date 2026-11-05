// Задача `project.download`: выбранные версии сцен → экспорт полного качества (готовый того же
// запроса переиспользуется, недостающий рендерится) → копия в папку, которую указал человек.
// Папка вне хранилища, поэтому файл копируется через `.part`, сверяется по sha256 и только потом
// получает своё имя. Повтор задачи не плодит дубли: файл с тем же содержимым уже на месте — готово;
// чужой файл с тем же именем не перезаписывается — копия получает суффикс `_2`.
import { chmod, copyFile, rename, rm, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { type ExportRequest, type ProjectDownloadFormat, ProjectDownloadFormatSchema, type ProjectDownloadRefs, failureToJobErrorCode } from "@ms/contracts";
import type { StorageStatus } from "@ms/core";
import { z } from "zod";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import { sha256File } from "../scenes/hash.js";
import { OVERLAY_IMPOSSIBLE, overlayProblem } from "../script/overlay-check.js";
import { versionQaWarnings } from "../script/state.js";
import type { ExportOneInput, SceneExportDeps } from "./scene-export.js";
import { PACKAGE_ALPHA, PACKAGE_MP4, ensureExport } from "./script-package.js";
import { errText } from "./steps.js";

export const ProjectDownloadInputSchema = z.object({
  projectId: z.string().min(1),
  dest: z.string().min(1),
  formats: z.array(ProjectDownloadFormatSchema).min(1),
  /** Снимок на момент запроса: `name` — имя файла без расширения. */
  items: z.array(z.object({ scene_id: z.string().min(1), version_id: z.string().min(1), name: z.string().min(1) }).strict()).min(1),
}).passthrough();
export type ProjectDownloadInput = z.infer<typeof ProjectDownloadInputSchema>;

export interface ProjectDownloadDeps {
  root: string;
  storage: () => Promise<StorageStatus>;
  exporter: SceneExportDeps;
  /** Экспорт одной версии (тесты подменяют); по умолчанию `exportOne`. */
  exportOne?: (ctx: JobContext, d: SceneExportDeps, input: ExportOneInput) => Promise<HandlerResult>;
  log?: (line: string) => void;
}

const REQUESTS: Record<ProjectDownloadFormat, ExportRequest> = { mp4: PACKAGE_MP4, alpha: PACKAGE_ALPHA };
export const fileNameOf = (name: string, format: ProjectDownloadFormat): string => (format === "mp4" ? `${name}.mp4` : `${name}_alpha.mov`);

type Stage = "prepare" | "storage" | "export" | "publish" | "fenced_out" | "cancelled";
const fail = (stage: Stage, message: string): HandlerResult => {
  const error = { code: failureToJobErrorCode(stage), stage, message };
  return stage === "cancelled" ? { status: "cancelled", error } : { status: "failed", error };
};

/** Сбой записи в папку назначения → причина для человека. */
export function copyErrorText(e: unknown, dest: string): string {
  switch ((e as NodeJS.ErrnoException).code) {
    case "ENOSPC": return `на диске с папкой «${dest}» закончилось место`;
    case "ENOENT": return `папка «${dest}» недоступна: диск отключён или папку удалили`;
    case "EACCES":
    case "EPERM":
    case "EROFS": return `нет прав на запись в папку «${dest}»`;
    default: return `файл не скопирован в папку «${dest}»: ${errText(e)}`;
  }
}

/** Копия `src` в `dest` под именем `file` или свободным `<имя>_N`; возвращает итоговое имя. */
export async function copyVerified(src: string, sha: string, dest: string, file: string, tag: string): Promise<string> {
  const ext = extname(file);
  const stem = file.slice(0, file.length - ext.length);
  const size = (await stat(src)).size;
  for (let i = 1; ; i++) {
    const name = i === 1 ? file : `${stem}_${i}${ext}`;
    const abs = join(dest, name);
    const present = await stat(abs).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return undefined;
      throw e;
    });
    if (present) {
      if (present.isFile() && present.size === size && (await sha256File(abs)) === sha) return name;
      continue;
    }
    const part = join(dest, `.${name}.${tag}.part`);
    await rm(part, { force: true });
    try {
      await copyFile(src, part);
      // файлы экспортов закрыты от записи — копия человека обычный файл; exFAT режим не хранит
      await chmod(part, 0o644).catch(() => undefined);
      const got = await sha256File(part);
      if (got !== sha) throw new Error(`контрольная сумма копии ${name} не совпала с экспортом`);
      await rename(part, abs);
      return name;
    } finally {
      await rm(part, { force: true }).catch(() => undefined);
    }
  }
}

export const projectDownload: (depsOf: () => ProjectDownloadDeps) => JobHandler = (depsOf) => async (ctx) => {
  const parsed = ProjectDownloadInputSchema.safeParse(ctx.job.input);
  if (!parsed.success) return fail("prepare", `вход project.download не годится: ${parsed.error.message}`);
  const { dest, formats, items } = parsed.data;
  const d = depsOf();
  const status = await d.storage().catch((e: unknown) => ({ ok: false as const, reason: "error", detail: errText(e) }));
  if (!status.ok) return fail("storage", `${status.reason}: ${status.detail}`);

  const refs: ProjectDownloadRefs = { dest, files: [], missing: [] };
  const total = items.length * formats.length;
  let step = 0;
  for (const [i, item] of items.entries()) {
    for (const format of formats) {
      if (ctx.signal.aborted) return fail("cancelled", "скачивание отменено");
      const file = fileNameOf(item.name, format);
      ctx.progress(step / total, "export");
      step++;
      const skip = (reason: string) => refs.missing.push({ scene_id: item.scene_id, format, name: file, reason });
      if (format === "alpha" && overlayProblem({ issues: versionQaWarnings(ctx.db, d.root, item.version_id) })) {
        skip(OVERLAY_IMPOSSIBLE);
        continue;
      }
      d.log?.(`${file}: экспорт`);
      const got = await ensureExport(ctx, d, item.version_id, REQUESTS[format], `${i + 1}-${format}`);
      if ("abort" in got) return got.abort;
      if ("reason" in got) {
        skip(got.reason);
        ctx.emit("export_failed", `${file}: ${got.detail ?? got.reason}`, { scene_id: item.scene_id, reason: got.reason });
        continue;
      }
      if (!ctx.fenceOk()) return fail("fenced_out", "попытка устарела");
      ctx.progress((step - 0.1) / total, "transfer");
      try {
        const name = await copyVerified(got.ok.abs, got.ok.sha256, dest, file, ctx.job.id);
        refs.files.push({ scene_id: item.scene_id, format, name });
      } catch (e) {
        return fail("publish", copyErrorText(e, dest));
      }
    }
  }
  if (refs.files.length === 0) return fail("export", `ни один файл не скачан: ${refs.missing[0]?.reason ?? "нет готовых версий"}`);
  return { status: "completed", outputRefs: refs };
};
