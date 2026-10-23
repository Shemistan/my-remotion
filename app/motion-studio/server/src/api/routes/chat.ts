// Чат сцены: сообщения и правка по сообщению (`playground.edit`): сообщение пользователя и
// задача — одной транзакцией, повтор по Idempotency-Key не создаёт второе сообщение (M15).
import { ChatBodySchema, ChatMessageDtoSchema, CreatedMessageDtoSchema, type ChatMessage } from "@ms/contracts";
import { z } from "zod";
import * as chat from "../../db/repos/chat.js";
import * as scenes from "../../db/repos/scenes.js";
import * as versions from "../../db/repos/versions.js";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, inputField, replay } from "../context.js";
import { ApiError, notFound } from "../errors.js";

export function chatRoutes(app: ZApp, { core }: ApiContext): void {
  app.get("/api/scenes/:id/messages", { schema: { params: IdParams, response: { 200: z.array(ChatMessageDtoSchema) } } }, async (req) => {
    if (!scenes.get(core.db, req.params.id)) throw notFound(`сцена ${req.params.id}`);
    return chat.list(core.db, req.params.id);
  });

  app.post("/api/scenes/:id/messages", {
    schema: { params: IdParams, body: ChatBodySchema, response: { 200: CreatedMessageDtoSchema, 202: CreatedMessageDtoSchema } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const db = core.db;
    const sceneId = req.params.id;
    const { text, baseVersionId } = req.body;
    const input = (messageId: string) => ({ sceneId, messageId, ...(baseVersionId === undefined ? {} : { baseVersionId }) });
    const out = tx(db, () => {
      let message: ChatMessage | undefined;
      const prev = replay(db, key, "playground.edit", (j) => {
        const id = inputField(j, "messageId");
        message = id ? chat.list(db, sceneId).find((m) => m.id === id) : undefined;
        return message && message.text === text ? input(message.id) : undefined;
      });
      if (prev) return { status: 200 as const, message: message!, job: prev };
      const scene = scenes.get(db, sceneId);
      if (!scene) throw notFound(`сцена ${sceneId}`);
      if (baseVersionId !== undefined) {
        const v = versions.get(db, baseVersionId);
        if (!v || v.scene_id !== scene.id) throw notFound(`версия ${baseVersionId} сцены ${scene.id}`);
      } else if (!scene.current_version_id && versions.listByScene(db, scene.id).length === 0) {
        throw new ApiError(409, "no_versions", `у сцены ${scene.id} ещё нет версий — править нечего`);
      }
      const m = chat.add(db, { scene_id: scene.id, role: "user", text });
      const { job } = enqueue(db, { type: "playground.edit", projectId: scene.project_id, sceneId: scene.id, input: input(m.id), idempotencyKey: key });
      return { status: 202 as const, message: m, job };
    });
    return reply.status(out.status).send({ message: out.message, job: out.job });
  });
}
