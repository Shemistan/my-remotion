// Скачивание выбранных роликов проекта в папку человека: системный выбор папки (macOS, без shell,
// текст скрипта постоянный), постановка задачи `project.download` и «Показать в Finder».
import { execFile } from "node:child_process";
import { constants, existsSync } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { CreatedJobDtoSchema, PickFolderDtoSchema, ProjectDownloadBodySchema, ProjectDownloadFormatSchema } from "@ms/contracts";
import { z } from "zod";
import * as jobs from "../../db/repos/jobs.js";
import * as projects from "../../db/repos/projects.js";
import * as scenes from "../../db/repos/scenes.js";
import * as versions from "../../db/repos/versions.js";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { ProjectDownloadInputSchema } from "../../pipeline/project-download.js";
import { lifecycleOf } from "../../projects/lifecycle.js";
import { fileSlug } from "../../script/package-names.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";
import { sceneExcerpts } from "./projects.js";
import { revealInFinder } from "./script-batch.js";

const PICK_SCRIPT = ["-e", "activate", "-e", 'POSIX path of (choose folder with prompt "Куда скачать ролики?")'];
const PICK_TIMEOUT_MS = 10 * 60_000;
/** Отмена в системном диалоге AppleScript: `User canceled. (-128)`. */
const PICK_CANCELLED = /-128/;

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

function pickFolder(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    execFile("osascript", PICK_SCRIPT, { timeout: PICK_TIMEOUT_MS }, (err, stdout, stderr) => {
      if (!err) return resolve(trimSlash(String(stdout).trim()));
      if (err.killed || PICK_CANCELLED.test(String(stderr))) return resolve(null);
      reject(new ApiError(500, "pick_failed", "окно выбора папки не открылось: укажите путь вручную"));
    });
  });
}

/** Папка назначения: существует, доступна на запись, вне хранилища приложения. */
async function checkedDest(raw: string, root: string): Promise<string> {
  if (!isAbsolute(raw)) throw new ApiError(400, "dest_invalid", "укажите полный путь к папке, он начинается с /");
  let dest: string;
  try {
    dest = await realpath(raw);
    if (!(await stat(dest)).isDirectory()) throw new ApiError(400, "dest_invalid", `«${raw}» — это не папка`);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "dest_missing", `папка «${raw}» не найдена: проверьте путь и подключён ли диск`);
  }
  await access(dest, constants.W_OK).catch(() => {
    throw new ApiError(400, "dest_not_writable", `нет прав на запись в папку «${raw}»`);
  });
  const inside = relative(await realpath(root), dest);
  if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) {
    throw new ApiError(400, "dest_inside_store", "эта папка — внутри хранилища приложения: выберите другую");
  }
  return dest;
}

export function projectDownloadRoutes(app: ZApp, { core }: ApiContext): void {
  let picking = false;
  app.post("/api/system/pick-folder", { schema: { response: { 200: PickFolderDtoSchema } } }, async () => {
    if (picking) throw new ApiError(409, "picker_busy", "окно выбора папки уже открыто");
    picking = true;
    try {
      return { path: await pickFolder() };
    } finally {
      picking = false;
    }
  });

  app.post("/api/projects/:id/downloads", {
    schema: { params: IdParams, body: ProjectDownloadBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const db = core.db;
    const project = projects.get(db, req.params.id);
    if (!project || lifecycleOf(db, project.id)?.deleted_at) throw notFound(`проект ${req.params.id}`);
    const dest = await checkedDest(req.body.dest, core.root);

    const rows = scenes.listByProject(db, project.id);
    const known = new Set(rows.map((s) => s.id));
    const unknown = req.body.scene_ids.find((id) => !known.has(id));
    if (unknown) throw notFound(`сцена ${unknown} в проекте`);
    const wanted = new Set(req.body.scene_ids);
    const excerpts = sceneExcerpts(core.root, project.id, rows);
    const width = Math.max(2, String(rows.length).length);
    // номер — позиция сцены в проекте: у той же сцены то же имя файла при любом выборе
    const items = rows.flatMap((s, i) => {
      if (!wanted.has(s.id)) return [];
      const v = s.current_version_id ? versions.get(db, s.current_version_id) : undefined;
      if (v?.status !== "ready") throw new ApiError(409, "scene_not_ready", `у сцены ${i + 1} нет готовой версии`);
      return [{ scene_id: s.id, version_id: v.id, name: `${String(i + 1).padStart(width, "0")}_${fileSlug(excerpts[i] ?? s.title)}` }];
    });
    const formats = ProjectDownloadFormatSchema.options.filter((f) => req.body.formats.includes(f));
    const input = ProjectDownloadInputSchema.parse({ projectId: project.id, dest, formats, items });

    const out = tx(db, () => {
      const prev = replay(db, key, "project.download", () => input);
      if (prev) return { status: 200 as const, job: prev };
      return { status: 202 as const, job: enqueue(db, { type: "project.download", projectId: project.id, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });

  // Finder: путь — только из входа задачи в БД
  app.post("/api/project-downloads/:id/reveal", { schema: { params: IdParams, response: { 204: z.null() } } }, async (req, reply) => {
    const job = jobs.get(core.db, req.params.id);
    const parsed = job?.type === "project.download" ? ProjectDownloadInputSchema.safeParse(job.input) : undefined;
    if (!parsed?.success) throw notFound(`скачивание ${req.params.id}`);
    if (!existsSync(parsed.data.dest)) throw notFound("папка скачивания: диск отключён или папку удалили");
    await revealInFinder(parsed.data.dest);
    return reply.status(204).send(null);
  });
}
