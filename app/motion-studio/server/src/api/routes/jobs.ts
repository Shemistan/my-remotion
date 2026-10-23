// Задачи: список и карточка (события, процессы попытки для `blocked`), отмена — только через
// `cancelJob` (полный реестр процессов), повтор — `retryJob` (409 при живых процессах), ответы
// на уточнения Concept.
import { isTrackedAlive } from "@ms/core";
import { JobDetailDtoSchema, JobDtoSchema, JobInputBodySchema, JobStatusSchema } from "@ms/contracts";
import { z } from "zod";
import * as jobEvents from "../../db/repos/job-events.js";
import * as jobs from "../../db/repos/jobs.js";
import { cancelJob, provideInput } from "../../jobs/queue.js";
import { retryJob } from "../../jobs/retry.js";
import { type ApiContext, IdParams, type ZApp } from "../context.js";
import { notFound } from "../errors.js";

const EVENTS_LIMIT = 2_000;

export function jobRoutes(app: ZApp, { core }: ApiContext): void {
  const jobOr404 = (id: string) => {
    const j = jobs.get(core.db, id);
    if (!j) throw notFound(`задача ${id}`);
    return j;
  };

  app.get("/api/jobs", {
    schema: {
      querystring: z.object({ status: JobStatusSchema.optional(), sceneId: z.string().min(1).optional() }).strict(),
      response: { 200: z.array(JobDtoSchema) },
    },
  }, async (req) => jobs.list(core.db, { ...(req.query.status ? { status: req.query.status } : {}), ...(req.query.sceneId ? { sceneId: req.query.sceneId } : {}) }));

  app.get("/api/jobs/:id", { schema: { params: IdParams, response: { 200: JobDetailDtoSchema } } }, async (req) => {
    const job = jobOr404(req.params.id);
    // только чтение реестра: мёртвые записи здесь не закрываются (это делают повтор и уборка)
    const processes = await Promise.all(
      (await core.processes.live({ runId: job.id })).map(async (p) => ({
        pid: p.pid, pgid: p.pgid, attempt: p.attempt, cmd: p.cmd, started_at: p.startedAt, alive: await isTrackedAlive(p),
      })),
    );
    return { job, events: jobEvents.listSince(core.db, 0, { jobId: job.id, limit: EVENTS_LIMIT }), processes };
  });

  app.post("/api/jobs/:id/cancel", { schema: { params: IdParams, response: { 200: JobDtoSchema } } }, async (req) => {
    jobOr404(req.params.id);
    return cancelJob(core.db, core.processes, req.params.id);
  });

  app.post("/api/jobs/:id/retry", { schema: { params: IdParams, response: { 200: JobDtoSchema } } }, async (req) => {
    jobOr404(req.params.id);
    return retryJob(core.db, req.params.id, core.processes);
  });

  app.post("/api/jobs/:id/input", { schema: { params: IdParams, body: JobInputBodySchema, response: { 200: JobDtoSchema } } }, async (req) => {
    jobOr404(req.params.id);
    return provideInput(core.db, req.params.id, "answers" in req.body ? req.body.answers : "skip");
  });
}
