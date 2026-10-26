// Маршруты Task 47: центр восстановления после сбоя — последний отчёт старта, задачи,
// прерванные сбоем (с исходом), заблокированные (`blocked` с PID и командами), черновики в
// карантине. Удаление черновика — только явно: сводка с токеном, затем удаление с ним.
import { type Job, RecoveryDtoSchema } from "@ms/contracts";
import { z } from "zod";
import * as jobs from "../../db/repos/jobs.js";
import { acknowledgeBootReport, bootSummary, latestBootReport, type PersistedBootReport } from "../../recovery/boot-report.js";
import { discardIntent, discardQuarantined, listQuarantined } from "../../recovery/quarantine.js";
import { type ApiContext, IdParams, type ZApp } from "../context.js";
import { maskPaths, publicJob } from "../job-dto.js";

const Dir = z.string().min(1).max(500);
export const DiscardIntentBodySchema = z.object({ dir: Dir }).strict();
export const DiscardIntentDtoSchema = z.object({ dir: Dir, token: z.string().min(1), bytes: z.number().int().nonnegative(), expires_at: z.string().datetime() }).strict();
export const DiscardBodySchema = z.object({ dir: Dir, token: z.string().min(1).max(200) }).strict();

export function recoveryRoutes(app: ZApp, { core }: ApiContext): void {
  // S20: предупреждения (отчёты до S20 — без них); пути — как в остальных DTO, маской
  const warnings = (b: PersistedBootReport) =>
    (b.report.warnings ?? []).map((w) => ({ kind: w.kind, message: maskPaths(w.message, core.root), ...(w.job_id ? { job_id: w.job_id } : {}), ...(w.owner_pids ? { owner_pids: w.owner_pids } : {}) }));
  const bootDto = (b: PersistedBootReport | undefined) =>
    b ? { id: b.id, created_at: b.created_at, crashed: b.crashed, acknowledged_at: b.acknowledged_at, summary: bootSummary(b.report), warnings: warnings(b) } : null;

  const recovery = () => {
    const db = core.db;
    const boot = latestBootReport(db);
    // прерванные последним стартом — в текущем состоянии (исход: снова в очереди, готово, не удалось…)
    const ids = boot ? [...boot.report.requeued, ...boot.report.completed, ...boot.report.cancelled, ...boot.report.failed] : [];
    const interrupted = ids.map((id) => jobs.get(db, id)).filter((j): j is Job => j !== undefined).map((j) => publicJob(j, core.root));
    const blocked = jobs.list(db, { status: "blocked" }).map((j) => publicJob(j, core.root));
    const quarantined = listQuarantined(core.root, db).map((q) => ({ rel_path: q.dir, reason: q.reason, job_id: q.job_id, attempt: q.attempt, bytes: q.bytes, at: q.at }));
    return { boot: bootDto(boot), interrupted, blocked, quarantined };
  };

  app.get("/api/recovery", { schema: { response: { 200: RecoveryDtoSchema } } }, async () => recovery());

  app.post("/api/recovery/:id/ack", { schema: { params: IdParams, response: { 200: RecoveryDtoSchema } } }, async (req) => {
    acknowledgeBootReport(core.db, req.params.id, core.root);
    return recovery();
  });

  app.post("/api/recovery/quarantine/intent", { schema: { body: DiscardIntentBodySchema, response: { 200: DiscardIntentDtoSchema } } }, async (req) => {
    const i = discardIntent(core.root, core.db, req.body.dir);
    return { dir: req.body.dir, token: i.token, bytes: i.bytes, expires_at: i.expiresAt };
  });

  app.post("/api/recovery/quarantine/discard", {
    schema: { body: DiscardBodySchema, response: { 200: z.object({ removed: Dir }).strict() } },
  }, async (req) => discardQuarantined({ root: core.root, db: core.db, processes: core.processes }, req.body.dir, req.body.token));
}
