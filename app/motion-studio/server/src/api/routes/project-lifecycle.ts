// Маршруты Task 47: переименование, архив, удаление в корзину с подтверждением, корзина.
// Удаление и очистка — в два шага: сводка с токеном (`delete-intent`, `purge-intent`), затем
// действие с этим токеном; удаление дополнительно сверяет введённое название. Ничего не
// стирается без второго подтверждения: удаление — перенос в `workspace/trash`, стирает только
// задача `trash.purge`.
import { DeleteIntentDtoSchema, JobSchema, ProjectDtoSchema, ProjectLifecycleDtoSchema } from "@ms/contracts";
import { z } from "zod";
import { tx } from "../../db/tx.js";
import { enqueue } from "../../jobs/queue.js";
import { deleteIntent, purgeIntent, verifyPurgeToken } from "../../projects/delete-intent.js";
import { archiveProject, renameProject, unarchiveProject } from "../../projects/lifecycle.js";
import { deleteProject, listTrash, restoreFromTrash } from "../../projects/trash.js";
import { DEFAULT_PROJECT } from "../../scenes/store.js";
import { type ApiContext, IdParams, type ZApp, idempotencyKey, replay } from "../context.js";
import { publicJob } from "../job-dto.js";

const Ts = z.string().datetime();
const Count = z.number().int().nonnegative();

export const RenameBodySchema = z.object({ title: z.string().max(1000) }).strict();
export const DeleteBodySchema = z.object({ token: z.string().min(1).max(200), confirm_title: z.string().max(1000) }).strict();
export const TrashEntryDtoSchema = z.object({
  id: z.string().min(1), project_id: z.string().min(1), title: z.string(), kind: ProjectDtoSchema.shape.kind, bytes: Count, created_at: Ts,
}).strict();
const TrashIds = z.array(z.string().min(1).max(200)).min(1).max(500);
export const PurgeIntentBodySchema = z.object({ trash_ids: TrashIds }).strict();
export const PurgeIntentDtoSchema = z.object({ token: z.string().min(1), count: Count, bytes: Count, files: Count, expires_at: Ts }).strict();
export const PurgeBodySchema = z.object({ trash_ids: TrashIds, token: z.string().min(1).max(200) }).strict();

export function projectLifecycleRoutes(app: ZApp, { core }: ApiContext): void {
  app.patch("/api/projects/:id", { schema: { params: IdParams, body: RenameBodySchema, response: { 200: ProjectDtoSchema } } }, async (req) =>
    renameProject(core.db, req.params.id, req.body.title));

  app.post("/api/projects/:id/archive", { schema: { params: IdParams, response: { 200: ProjectLifecycleDtoSchema } } }, async (req) =>
    archiveProject(core.db, req.params.id));

  app.post("/api/projects/:id/unarchive", { schema: { params: IdParams, response: { 200: ProjectLifecycleDtoSchema } } }, async (req) =>
    unarchiveProject(core.db, req.params.id));

  app.post("/api/projects/:id/delete-intent", { schema: { params: IdParams, response: { 200: DeleteIntentDtoSchema } } }, async (req) => {
    const i = deleteIntent(core.db, core.root, req.params.id);
    return {
      project_id: req.params.id, token: i.token, bytes: i.bytes, files: i.files, active_jobs: i.activeJobs.length, expires_at: i.expiresAt,
      title: i.title, scenes: i.scenes, versions: i.versions, exports: i.exports, packages: i.packages, active_job_ids: i.activeJobs,
    };
  });

  app.delete("/api/projects/:id", {
    schema: { params: IdParams, body: DeleteBodySchema, response: { 200: z.object({ trash_id: z.string().min(1) }).strict() } },
  }, async (req) => ({ trash_id: deleteProject(core, req.params.id, req.body).trashId }));

  app.get("/api/trash", { schema: { response: { 200: z.array(TrashEntryDtoSchema) } } }, async () => listTrash(core.db));

  app.post("/api/trash/:id/restore", { schema: { params: IdParams, response: { 200: ProjectDtoSchema } } }, async (req) =>
    restoreFromTrash(core, req.params.id));

  app.post("/api/trash/purge-intent", { schema: { body: PurgeIntentBodySchema, response: { 200: PurgeIntentDtoSchema } } }, async (req) => {
    const i = purgeIntent(core.db, core.root, req.body.trash_ids);
    return { token: i.token, count: i.count, bytes: i.bytes, files: i.files, expires_at: i.expiresAt };
  });

  // очистка — задача `trash.purge` (замок `store:trash`); токен второго подтверждения сверяется здесь
  app.post("/api/trash/purge", {
    schema: { body: PurgeBodySchema, response: { 200: z.object({ job: JobSchema }).strict(), 202: z.object({ job: JobSchema }).strict() } },
  }, async (req, reply) => {
    const key = idempotencyKey(req);
    const db = core.db;
    const input = { trashIds: [...new Set(req.body.trash_ids)].sort(), token: req.body.token };
    const out = tx(db, () => {
      const prev = replay(db, key, "trash.purge", () => input);
      if (prev) return { status: 200 as const, job: prev };
      verifyPurgeToken(db, core.root, input.trashIds, input.token);
      return { status: 202 as const, job: enqueue(db, { type: "trash.purge", projectId: DEFAULT_PROJECT, input, idempotencyKey: key }).job };
    });
    return reply.status(out.status).send({ job: publicJob(out.job, core.root) });
  });
}
