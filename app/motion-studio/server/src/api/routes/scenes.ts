// Сцена: история версий и активная задача; восстановление версии (`scene.restore`); кнопка
// Render и «Улучшить» (`playground.edit` с готовым планом, без Edit Planner, H8).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CreatedJobDtoSchema,
  ImproveBodySchema,
  type Job,
  QAReportSchema,
  RenderBodySchema,
  RestoreBodySchema,
  SceneDetailDtoSchema,
  type Settings,
  SettingsSchema,
} from "@ms/contracts";
import * as jobs from "../../db/repos/jobs.js";
import * as projects from "../../db/repos/projects.js";
import * as scenes from "../../db/repos/scenes.js";
import * as versions from "../../db/repos/versions.js";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { planFromQa } from "../../pipeline/improve-plan.js";
import { planFromPatch } from "../../pipeline/playground-edit.js";
import { versionHistoryDigest } from "../../scenes/history.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";

/** Задача сцены, которую UI показывает как текущую: не завершённая (последняя по времени). */
const ACTIVE: ReadonlySet<Job["status"]> = new Set(["pending", "running", "awaiting_input", "awaiting_approval", "blocked"]);

export function sceneRoutes(app: ZApp, { core }: ApiContext): void {
  const sceneOr404 = (id: string) => {
    const s = scenes.get(core.db, id);
    if (!s) throw notFound(`сцена ${id}`);
    return s;
  };

  app.get("/api/scenes/:id", { schema: { params: IdParams, response: { 200: SceneDetailDtoSchema } } }, async (req) => {
    const scene = sceneOr404(req.params.id);
    const active = jobs.list(core.db, { sceneId: scene.id }).filter((j) => ACTIVE.has(j.status));
    return { scene, versions: versionHistoryDigest(core.db, core.root, scene.id), active_job: active.length ? publicJob(active.at(-1)!, core.root) : null };
  });

  app.post("/api/scenes/:id/restore", {
    schema: { params: IdParams, body: RestoreBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const db = core.db;
    const input = { sceneId: req.params.id, versionId: req.body.versionId };
    const out = tx(db, () => {
      const prev = replay(db, key, "scene.restore", () => input);
      if (prev) return { status: 200 as const, job: prev };
      const scene = sceneOr404(req.params.id);
      const v = versions.get(db, req.body.versionId);
      if (!v || v.scene_id !== scene.id) throw notFound(`версия ${req.body.versionId} сцены ${scene.id}`);
      if (v.status !== "ready") throw new ApiError(409, "version_not_ready", `восстановить можно только ready-версию (v${v.number} — ${v.status})`);
      return { status: 202 as const, job: enqueue(db, { type: "scene.restore", projectId: scene.project_id, sceneId: scene.id, versionId: v.id, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });

  app.post("/api/scenes/:id/render", {
    schema: { params: IdParams, body: RenderBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const db = core.db;
    const patch = req.body.settings_patch as Partial<Settings>;
    const asked = req.body.base_version_id;
    const out = tx(db, () => {
      // без base_version_id план зависит от текущей версии: повтор сверяется с базой, взятой в
      // первый раз; с ним — с переданной (другая база под тем же ключом → 422)
      const prev = replay(db, key, "playground.edit", (j) => {
        const base = asked ?? (j.input as { plan?: { base_version_id?: string } } | null)?.plan?.base_version_id;
        return base ? { sceneId: req.params.id, plan: planFromPatch(patch, base), settings_patch: patch } : undefined;
      });
      if (prev) return { status: 200 as const, job: prev };
      const scene = sceneOr404(req.params.id);
      if (Object.keys(patch).length === 0) throw new ApiError(400, "empty_patch", "settings_patch пуст — менять нечего");
      let base;
      if (asked !== undefined) {
        base = versions.get(db, asked);
        if (!base || base.scene_id !== scene.id) throw notFound(`версия ${asked} сцены ${scene.id}`);
        if (base.status !== "ready") throw new ApiError(409, "version_not_ready", `Render строится только от ready-версии (v${base.number} — ${base.status})`);
      } else {
        if (!scene.current_version_id) throw new ApiError(409, "no_current_version", `у сцены ${scene.id} нет готовой версии — Render нечего перерисовывать`);
        base = versions.get(db, scene.current_version_id)!;
      }
      // Task 41: FPS видеосцены = FPS проекта (кадры плана и таймлайна); смена FPS изменила бы длину сцены
      // в кадрах в обход плана (Р-V6) — отказ, как у длительности, только через план
      if (patch.fps && (patch.fps.num !== base.settings.fps.num || patch.fps.den !== base.settings.fps.den) && projects.get(db, scene.project_id)?.kind === "video") {
        throw new ApiError(409, "fps_locked", "FPS сцены видеопроекта задаёт проект: менять его у сцены нельзя — длительность и кадры сцены идут по плану");
      }
      const merged = SettingsSchema.safeParse({ ...base.settings, ...patch });
      if (!merged.success) {
        const issues = merged.error.issues.map((i) => ({ path: ["settings", ...i.path].join("."), message: i.message }));
        throw new ApiError(400, "validation", issues.map((i) => `${i.path}: ${i.message}`).join("; "), { issues });
      }
      const input = { sceneId: scene.id, plan: planFromPatch(patch, base.id), settings_patch: patch };
      return { status: 202 as const, job: enqueue(db, { type: "playground.edit", projectId: scene.project_id, sceneId: scene.id, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });

  app.post("/api/scenes/:id/improve", {
    schema: { params: IdParams, body: ImproveBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const db = core.db;
    const asked = req.body.base_version_id;
    const out = tx(db, () => {
      const prev = replay(db, key, "playground.edit", (j) => {
        const input = j.input as { sceneId?: string; plan?: { base_version_id?: string }; settings_patch?: unknown; messageId?: string } | null;
        if (input?.sceneId !== req.params.id || !input.plan || input.settings_patch !== undefined || input.messageId !== undefined) return undefined;
        if (asked !== undefined && input.plan.base_version_id !== asked) return undefined;
        return input;
      });
      if (prev) return { status: 200 as const, job: prev };
      const scene = sceneOr404(req.params.id);
      if (!asked && !scene.current_version_id) {
        throw new ApiError(409, "no_current_version", `у сцены ${scene.id} нет готовой версии — улучшать нечего`);
      }
      const baseId = asked ?? scene.current_version_id!;
      const base = versions.get(db, baseId);
      if (!base || base.scene_id !== scene.id) throw notFound(`версия ${baseId} сцены ${scene.id}`);
      if (base.status !== "ready") throw new ApiError(409, "version_not_ready", `улучшать можно только ready-версию (v${base.number} — ${base.status})`);
      let qa;
      try {
        const parsed = QAReportSchema.safeParse(JSON.parse(readFileSync(join(core.root, base.path, "qa.json"), "utf8")));
        qa = parsed.success && parsed.data.scores ? parsed.data : undefined;
      } catch {
        qa = undefined;
      }
      if (!qa) {
        throw new ApiError(409, "no_scores", "у версии нет оценки QA — улучшать не по чему, используйте Перегенерировать или Playground");
      }
      const input = { sceneId: scene.id, plan: planFromQa(qa, base.id) };
      return { status: 202 as const, job: enqueue(db, { type: "playground.edit", projectId: scene.project_id, sceneId: scene.id, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });
}
