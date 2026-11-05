// Проекты: список (служебные bench-проекты скрыты), создание, карточка; новая сцена по промпту
// (`playground.generate`): сцена и задача — одной транзакцией, повтор по Idempotency-Key.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  CreateProjectBodySchema,
  CreateSceneBodySchema,
  CreatedSceneDtoSchema,
  ProjectDetailDtoSchema,
  ProjectDtoSchema,
  type SceneDto,
  defaultSettings,
} from "@ms/contracts";
import { z } from "zod";
import * as exportsRepo from "../../db/repos/exports.js";
import * as jobs from "../../db/repos/jobs.js";
import * as projects from "../../db/repos/projects.js";
import * as scenes from "../../db/repos/scenes.js";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { lifecycleOf, listProjects } from "../../projects/lifecycle.js";
import { versionHistoryDigest } from "../../scenes/history.js";
import { sceneRel } from "../../scenes/store.js";
import { type ApiContext, IdParams, QueryBool, type ZApp, idempotencyKey, inputField, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";

const RECENT_EXPORTS = 20;
const EXCERPT_MAX = 120;

function promptOf(root: string, projectId: string, sceneId: string): string | null {
  try {
    const value = JSON.parse(readFileSync(join(root, sceneRel(projectId, sceneId), "brief.json"), "utf8")) as { prompt?: unknown };
    return typeof value.prompt === "string" ? value.prompt.trim().replace(/\s+/g, " ") : null;
  } catch {
    return null;
  }
}

/** Общая часть стиля режется назад до границы слова. */
function sharedPromptCut(prompts: readonly (string | null)[]): number {
  if (prompts.length < 2 || prompts.some((p) => p === null)) return 0;
  let prefix = prompts[0]!;
  for (const prompt of prompts.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < prompt!.length && prefix[i] === prompt![i]) i++;
    prefix = prefix.slice(0, i);
  }
  if (prefix.length < 20) return 0;
  return /\s$/.test(prefix) ? prefix.length : prefix.lastIndexOf(" ") + 1;
}

function excerptOf(prompt: string | null, cut: number): string | null {
  const text = prompt?.slice(cut).trim();
  if (!text) return null;
  if (text.length <= EXCERPT_MAX) return text;
  const head = text.slice(0, EXCERPT_MAX - 1);
  const boundary = head.lastIndexOf(" ");
  return `${(boundary > 0 ? head.slice(0, boundary) : head).trimEnd()}…`;
}

/** Отрывки промптов сцен без общей части стиля (по порядку `rows`): подпись и имя файла ролика. */
export function sceneExcerpts(root: string, projectId: string, rows: readonly { id: string }[]): (string | null)[] {
  const prompts = rows.map((s) => promptOf(root, projectId, s.id));
  const cut = sharedPromptCut(prompts);
  return prompts.map((p) => excerptOf(p, cut));
}

export function projectRoutes(app: ZApp, { core }: ApiContext): void {
  app.get("/api/projects", {
    // Task 47: `view` — активные (по умолчанию) или архив; удалённые — только в `GET /trash`
    schema: { querystring: z.object({ includeBench: QueryBool.optional(), view: z.enum(["active", "archived"]).optional() }).strict(), response: { 200: z.array(ProjectDtoSchema) } },
  }, async (req) => {
    const all = listProjects(core.db, req.query.view ?? "active");
    return req.query.includeBench ? all : all.filter((p) => !projects.isBenchProject(p.id));
  });

  app.post("/api/projects", { schema: { body: CreateProjectBodySchema, response: { 201: ProjectDtoSchema } } }, async (req, reply) => {
    const { title, kind, settings } = req.body;
    // сценарий: настройки по умолчанию 16:9 1920×1080 30 fps (спека §1), если не заданы
    const s = settings ?? (kind === "script" ? defaultSettings() : undefined);
    const p = projects.create(core.db, { title, kind: kind ?? "playground", ...(s ? { settings: s } : {}) });
    return reply.status(201).send(p);
  });

  app.get("/api/projects/:id", { schema: { params: IdParams, response: { 200: ProjectDetailDtoSchema } } }, async (req) => {
    const db = core.db;
    const project = projects.get(db, req.params.id);
    // проект в корзине (Task 47) открывается только после восстановления
    if (!project || lifecycleOf(db, project.id)?.deleted_at) throw notFound(`проект ${req.params.id}`);
    const rows = scenes.listByProject(db, project.id);
    const excerpts = sceneExcerpts(core.root, project.id, rows);
    const lastJobs = new Map<string, ReturnType<typeof jobs.list>[number]>();
    for (const job of jobs.list(db, { projectId: project.id })) {
      if (job.scene_id) lastJobs.set(job.scene_id, job);
    }
    const list = rows.map((s, index) => {
      const history = versionHistoryDigest(db, core.root, s.id);
      const current = s.current_version_id ? history.find((h) => h.version_id === s.current_version_id) ?? null : null;
      const latest = history.reduce<(typeof history)[number] | null>((a, h) => (!a || h.number > a.number ? h : a), null);
      const last = lastJobs.get(s.id);
      const pub = last ? publicJob(last, core.root) : null;
      const last_job = pub ? { id: pub.id, status: pub.status, stage: pub.stage, error: pub.error } : null;
      return { ...s, excerpt: excerpts[index]!, current_version: current, latest_version: latest, last_job };
    });
    return { project, scenes: list, exports: exportsRepo.recentInProject(db, project.id, RECENT_EXPORTS) };
  });

  app.post("/api/projects/:id/scenes", {
    schema: { params: IdParams, body: CreateSceneBodySchema, response: { 200: CreatedSceneDtoSchema, 202: CreatedSceneDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const db = core.db;
    const { prompt, title, settings, allowRestricted } = req.body;
    const input = (sceneId: string) => ({ sceneId, prompt, ...(title === undefined ? {} : { title }), settings, ...(allowRestricted === undefined ? {} : { allowRestricted }) });
    let created: string | undefined;
    let out;
    try {
      out = tx(db, () => {
        const prev = replay(db, key, "playground.generate", (j) => (j.project_id === req.params.id && j.scene_id ? input(j.scene_id) : undefined));
        if (prev) return { status: 200 as const, scene: scenes.get(db, prev.scene_id!) as SceneDto, job: prev };
        if (!projects.get(db, req.params.id)) throw notFound(`проект ${req.params.id}`);
        const scene = core.repo.createScene(req.params.id, { prompt, ...(title === undefined ? {} : { title }), settings });
        created = scene.id;
        const { job } = enqueue(db, { type: "playground.generate", projectId: req.params.id, sceneId: scene.id, input: input(scene.id), idempotencyKey: key });
        return { status: 202 as const, scene, job };
      });
    } catch (e) {
      // откат транзакции: brief.json уже на диске — каталог сцены без строки в БД убираем (F11)
      if (created && !scenes.get(core.db, created)) {
        try {
          rmSync(join(core.root, sceneRel(req.params.id, created)), { recursive: true, force: true });
        } catch (rmErr) {
          req.log.warn({ err: rmErr }, "каталог отменённой сцены не удалён (подберёт уборка)");
        }
      }
      throw e;
    }
    if (!out.scene) throw new ApiError(500, "internal", `сцена задачи ${out.job.id} пропала (${inputField(out.job, "sceneId") ?? "—"})`);
    return reply.status(out.status).send({ scene: out.scene, job: publicJob(out.job, core.root) });
  });
}
