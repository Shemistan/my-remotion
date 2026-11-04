// Задачи: список и карточка (события, процессы попытки для `blocked`), отмена — только через
// `cancelJob` (полный реестр процессов), повтор — `retryJob` (409 при живых процессах), ответы
// на уточнения Concept. Task 48: в списке и карточке — `cost_usd` (`jobCost`, справочно).
import { isTrackedAlive } from "@ms/core";
import {
  type Job,
  JobDetailDtoSchema,
  JobDtoSchema,
  JobInputBodySchema,
  JobListDtoSchema,
  JobStatusSchema,
  RetryFailedJobsBodySchema,
  RetryFailedJobsResultSchema,
} from "@ms/contracts";
import { z } from "zod";
import * as jobEvents from "../../db/repos/job-events.js";
import * as jobs from "../../db/repos/jobs.js";
import { cancelJob, provideInput } from "../../jobs/queue.js";
import { retryJob } from "../../jobs/retry.js";
import { type ApiContext, IdParams, type ZApp } from "../context.js";
import { ApiError, notFound } from "../errors.js";
import { maskPaths, publicEvent, publicJob, withCost } from "../job-dto.js";

const EVENTS_LIMIT = 2_000;

function errorCode(e: unknown): string {
  if (e && typeof e === "object" && "code" in e && typeof e.code === "string") return e.code;
  return /^([a-z_]+):/.exec((e as Error)?.message ?? "")?.[1] ?? "internal";
}

function pageCursor(db: ApiContext["core"]["db"], value: string): { createdAt: string; id: string } | undefined {
  const separator = value.indexOf("|");
  if (separator > 0) {
    const createdAt = value.slice(0, separator);
    const id = value.slice(separator + 1);
    if (z.string().datetime().safeParse(createdAt).success && id) return { createdAt, id };
    return undefined;
  }
  const job = jobs.get(db, value);
  return job ? { createdAt: job.created_at, id: job.id } : undefined;
}

export function jobRoutes(app: ZApp, { core }: ApiContext): void {
  const pub = (j: Job) => publicJob(j, core.root);
  const jobOr404 = (id: string) => {
    const j = jobs.get(core.db, id);
    if (!j) throw notFound(`задача ${id}`);
    return j;
  };

  app.get("/api/jobs", {
    schema: {
      querystring: z.object({
        status: JobStatusSchema.optional(),
        sceneId: z.string().min(1).optional(),
        project_id: z.string().min(1).optional(),
        // без limit — 500 (главная, BuildPlan); «Задачи» просят порции по 50
        limit: z.coerce.number().int().min(1).max(500).default(500),
        before: z.string().min(1).max(200).optional(),
      }).strict(),
      response: { 200: z.array(JobListDtoSchema) },
    },
  }, async (req) => {
    const before = req.query.before ? pageCursor(core.db, req.query.before) : undefined;
    if (req.query.before && !before) throw new ApiError(400, "invalid_cursor", "курсор задачи не найден");
    const page = jobs.listPage(core.db, {
      ...(req.query.status ? { status: req.query.status } : {}),
      ...(req.query.sceneId ? { sceneId: req.query.sceneId } : {}),
      ...(req.query.project_id ? { projectId: req.query.project_id } : {}),
      limit: req.query.limit,
      ...(before ? { before } : {}),
    }).map((row) => ({ ...pub(row.job), project_title: row.projectTitle, scene_title: row.sceneTitle }));
    return withCost(core.db, page);
  });

  app.post("/api/jobs/retry-failed", {
    schema: { body: RetryFailedJobsBodySchema, response: { 200: RetryFailedJobsResultSchema } },
  }, async (req) => {
    const only = req.body.ids ? new Set(req.body.ids) : undefined;
    const failed = jobs.list(core.db, {
      status: "failed",
      ...(req.body.project_id ? { projectId: req.body.project_id } : {}),
      ...(req.body.scene_id ? { sceneId: req.body.scene_id } : {}),
    }).filter((j) => !only || only.has(j.id));
    const retried: string[] = [];
    const skipped: { id: string; code: string }[] = [];
    for (const job of failed) {
      try {
        await retryJob(core.db, job.id, core.processes);
        retried.push(job.id);
      } catch (e) {
        skipped.push({ id: job.id, code: errorCode(e) });
      }
    }
    return { retried, skipped };
  });

  app.get("/api/jobs/:id", { schema: { params: IdParams, response: { 200: JobDetailDtoSchema } } }, async (req) => {
    const job = jobOr404(req.params.id);
    // только чтение реестра: мёртвые записи здесь не закрываются (это делают повтор и уборка)
    const processes = await Promise.all(
      (await core.processes.live({ runId: job.id })).map(async (p) => ({
        pid: p.pid, pgid: p.pgid, attempt: p.attempt, cmd: maskPaths(p.cmd, core.root), started_at: p.startedAt, alive: await isTrackedAlive(p),
      })),
    );
    const events = jobEvents.listSince(core.db, 0, { jobId: job.id, limit: EVENTS_LIMIT }).map((e) => publicEvent(e, core.root));
    // Task 48: стоимость задачи (справочно)
    return { job: withCost(core.db, [pub(job)])[0]!, events, processes };
  });

  app.post("/api/jobs/:id/cancel", { schema: { params: IdParams, response: { 200: JobDtoSchema } } }, async (req) => {
    jobOr404(req.params.id);
    return pub(await cancelJob(core.db, core.processes, req.params.id));
  });

  app.post("/api/jobs/:id/retry", { schema: { params: IdParams, response: { 200: JobDtoSchema } } }, async (req) => {
    jobOr404(req.params.id);
    return pub(await retryJob(core.db, req.params.id, core.processes));
  });

  app.post("/api/jobs/:id/input", { schema: { params: IdParams, body: JobInputBodySchema, response: { 200: JobDtoSchema } } }, async (req) => {
    jobOr404(req.params.id);
    return pub(provideInput(core.db, req.params.id, "answers" in req.body ? req.body.answers : "skip"));
  });
}
