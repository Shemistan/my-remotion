// Маршруты Task 40: сцены видеопроекта — состояние, пакет генерации (по образцу `script-batch.ts`:
// 202 — новый пакет, 200 — повтор того же Idempotency-Key), Approval C на версию (с проверкой
// отпечатка версии против текущего плана — `root` в `approveScene`), снятие C, превью в контексте
// (задача `scene.preview_context` с Idempotency-Key) и его файл с Range. Путь файла — только из
// опубликованной строки БД; путь клиента на диск не попадает.
import { join } from "node:path";
import {
  ApprovalDtoSchema, ApproveSceneBodySchema, CreatedJobDtoSchema, PreviewContextBodySchema, SceneApprovalDtoSchema, VideoBatchDtoSchema,
  VideoGenerateBodySchema, VideoScenesStateDtoSchema,
} from "@ms/contracts";
import { z } from "zod";
import type { Db } from "../../db/open.js";
import * as scenes from "../../db/repos/scenes.js";
import { videoScenes } from "../../db/repos/video.js";
import * as versions from "../../db/repos/versions.js";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { deletedRefusal } from "../../projects/lifecycle.js";
import { approveScene, sceneApprovalState, unapproveScene } from "../../video-scenes/approval-c.js";
import { cancelVideoBatch, startVideoBatch, videoBatchForKey, videoBatchStatus } from "../../video-scenes/batch.js";
import { contextPreviewState } from "../../video-scenes/context-preview.js";
import { videoScenesState } from "../../video-scenes/state.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { publicJob } from "../job-dto.js";
import { sendFile } from "../range.js";

const PreviewQuery = z.object({ versionId: z.string().min(1).max(200).optional() }).strict();

/** Сцена видеопроекта (есть строка `video_scenes`); иначе 404 / 409 `not_video_scene`. */
function videoSceneOr404(db: Db, sceneId: string) {
  const scene = scenes.get(db, sceneId);
  if (!scene) throw notFound(`сцена ${sceneId}`);
  if (!videoScenes.bySceneId(db, sceneId)) throw new ApiError(409, "not_video_scene", "сцена не из видеопроекта");
  return scene;
}

export const videoBatchRoutes: (app: ZApp, ctx: ApiContext) => void = (app, { core }) => {
  app.get("/api/projects/:id/video/scenes", { schema: { params: IdParams, response: { 200: VideoScenesStateDtoSchema } } }, async (req) =>
    videoScenesState(core.db, core.root, req.params.id));

  app.post("/api/projects/:id/video/generate", {
    schema: { params: IdParams, body: VideoGenerateBodySchema, response: { 200: VideoBatchDtoSchema, 202: VideoBatchDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const { revision, item_ids, regenerate } = req.body;
    const existed = videoBatchForKey(core.db, req.params.id, key) !== undefined;
    const dto = startVideoBatch(core, {
      projectId: req.params.id, revision, idempotencyKey: key,
      ...(item_ids ? { itemIds: item_ids } : {}), ...(regenerate !== undefined ? { regenerate } : {}),
    });
    return reply.status(existed ? 200 : 202).send(dto);
  });

  app.get("/api/video-batches/:id", { schema: { params: IdParams, response: { 200: VideoBatchDtoSchema } } }, async (req) =>
    videoBatchStatus(core.db, core.root, req.params.id));

  app.post("/api/video-batches/:id/cancel", { schema: { params: IdParams, response: { 200: VideoBatchDtoSchema } } }, async (req) =>
    cancelVideoBatch(core, req.params.id));

  // C: версия сделана не по текущей сцене плана — 409 plan_changed (root обязателен, ревью 38-39)
  app.post("/api/scenes/:id/approve", {
    schema: { params: IdParams, body: ApproveSceneBodySchema, response: { 201: ApprovalDtoSchema } },
  }, async (req, reply) => {
    videoSceneOr404(core.db, req.params.id);
    const a = approveScene(core.db, { sceneId: req.params.id, versionId: req.body.version_id, root: core.root });
    return reply.status(201).send(a);
  });

  app.post("/api/scenes/:id/unapprove", { schema: { params: IdParams, response: { 200: SceneApprovalDtoSchema } } }, async (req) => {
    videoSceneOr404(core.db, req.params.id);
    unapproveScene(core.db, req.params.id);
    const s = sceneApprovalState(core.db, req.params.id, { root: core.root });
    return { state: s.state, ...(s.versionId ? { version_id: s.versionId } : {}), ...(s.versionNumber ? { version_number: s.versionNumber } : {}) };
  });

  // превью версии в контексте исходника: задача без замка; повтор того же ключа — та же задача
  app.post("/api/scenes/:id/preview-context", {
    schema: { params: IdParams, body: PreviewContextBodySchema, response: { 200: CreatedJobDtoSchema, 202: CreatedJobDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const db = core.db;
    const sceneId = req.params.id;
    const input = { sceneId, versionId: req.body.version_id, ...(req.body.pad_frames !== undefined ? { padFrames: req.body.pad_frames } : {}) };
    const out = tx(db, () => {
      const prev = replay(db, key, "scene.preview_context", () => input);
      if (prev) return { status: 200 as const, job: prev };
      const scene = videoSceneOr404(db, sceneId);
      const deleted = deletedRefusal(db, scene.project_id);
      if (deleted) throw deleted;
      const v = versions.get(db, req.body.version_id);
      if (!v) throw notFound(`версия ${req.body.version_id}`);
      if (v.scene_id !== sceneId) throw new ApiError(422, "version_not_in_scene", `версия ${v.id} — не сцены ${sceneId}`);
      if (v.status !== "ready" || v.broken_reason) throw new ApiError(409, "version_failed", `версия v${v.number} не готова — показывать нечего`);
      return { status: 202 as const, job: enqueue(db, { type: "scene.preview_context", projectId: scene.project_id, sceneId, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });

  // файл превью в контексте: версия по умолчанию — утверждённая (C), иначе текущая
  app.get("/api/scenes/:id/preview-context.mp4", { schema: { params: IdParams, querystring: PreviewQuery } }, async (req, reply) => {
    const scene = videoSceneOr404(core.db, req.params.id);
    const versionId = req.query.versionId ?? scene.approved_version_id ?? scene.current_version_id ?? undefined;
    if (!versionId) throw notFound(`версия сцены ${scene.id}`);
    const v = versions.get(core.db, versionId);
    if (!v || v.scene_id !== scene.id) throw notFound(`версия ${versionId} сцены ${scene.id}`);
    const st = contextPreviewState(core.db, core.root, scene.id, v.id);
    if (!st) throw notFound(`превью в контексте версии v${v.number}`);
    return sendFile(req, reply, join(core.root, st.rel_path), { contentType: "video/mp4" });
  });
};
