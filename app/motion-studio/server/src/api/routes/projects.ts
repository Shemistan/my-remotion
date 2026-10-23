// Проекты: список (служебные bench-проекты скрыты), создание, карточка; новая сцена по промпту
// (`playground.generate`): сцена и задача — одной транзакцией, повтор по Idempotency-Key.
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
  CreateProjectBodySchema,
  CreateSceneBodySchema,
  CreatedSceneDtoSchema,
  ProjectDetailDtoSchema,
  ProjectDtoSchema,
  type SceneDto,
} from "@ms/contracts";
import { z } from "zod";
import * as exportsRepo from "../../db/repos/exports.js";
import * as projects from "../../db/repos/projects.js";
import * as scenes from "../../db/repos/scenes.js";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { versionHistoryDigest } from "../../scenes/history.js";
import { sceneRel } from "../../scenes/store.js";
import { type ApiContext, IdParams, QueryBool, type ZApp, idempotencyKey, inputField, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";

const RECENT_EXPORTS = 20;

export function projectRoutes(app: ZApp, { core }: ApiContext): void {
  app.get("/api/projects", {
    schema: { querystring: z.object({ includeBench: QueryBool.optional() }).strict(), response: { 200: z.array(ProjectDtoSchema) } },
  }, async (req) => {
    const all = projects.list(core.db);
    return req.query.includeBench ? all : all.filter((p) => !projects.isBenchProject(p.id));
  });

  app.post("/api/projects", { schema: { body: CreateProjectBodySchema, response: { 201: ProjectDtoSchema } } }, async (req, reply) => {
    const p = projects.create(core.db, { title: req.body.title, ...(req.body.settings ? { settings: req.body.settings } : {}) });
    return reply.status(201).send(p);
  });

  app.get("/api/projects/:id", { schema: { params: IdParams, response: { 200: ProjectDetailDtoSchema } } }, async (req) => {
    const db = core.db;
    const project = projects.get(db, req.params.id);
    if (!project) throw notFound(`проект ${req.params.id}`);
    const list = scenes.listByProject(db, project.id).map((s) => {
      const current = s.current_version_id ? versionHistoryDigest(db, core.root, s.id).find((h) => h.version_id === s.current_version_id) ?? null : null;
      return { ...s, current_version: current };
    });
    return { project, scenes: list, exports: exportsRepo.recentInProject(db, project.id, RECENT_EXPORTS) };
  });

  app.post("/api/projects/:id/scenes", {
    schema: { params: IdParams, body: CreateSceneBodySchema, response: { 200: CreatedSceneDtoSchema, 202: CreatedSceneDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const db = core.db;
    const { prompt, settings, allowRestricted } = req.body;
    const input = (sceneId: string) => ({ sceneId, prompt, settings, ...(allowRestricted === undefined ? {} : { allowRestricted }) });
    let created: string | undefined;
    let out;
    try {
      out = tx(db, () => {
        const prev = replay(db, key, "playground.generate", (j) => (j.project_id === req.params.id && j.scene_id ? input(j.scene_id) : undefined));
        if (prev) return { status: 200 as const, scene: scenes.get(db, prev.scene_id!) as SceneDto, job: prev };
        if (!projects.get(db, req.params.id)) throw notFound(`проект ${req.params.id}`);
        const scene = core.repo.createScene(req.params.id, { prompt, settings });
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
    return reply.status(out.status).send({ scene: out.scene, job: out.job });
  });
}
