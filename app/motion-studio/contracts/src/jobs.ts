import { z } from "zod";
import { FailureStageSchema, JobErrorCodeSchema, failureToJobErrorCode } from "./failure.js";

export const JobStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled", "awaiting_approval", "awaiting_input", "blocked"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobTypeSchema = z.enum([
  "playground.generate", "playground.edit", "scene.restore", "scene.export",
  // Phase 2–3: видеопроект
  "media.import", "asr.transcribe", "roughcut.propose", "roughcut.preview", "footage.analyze", "semantic.analyze", "plan.visual", "plan.recheck",
]);
export type JobType = z.infer<typeof JobTypeSchema>;

/** Ошибка задачи: код — `failureToJobErrorCode(stage)`; `pids`/`cmds` — для `blocked(stale_process)`. */
export const JobErrorSchema = z.object({
  code: JobErrorCodeSchema,
  message: z.string(),
  stage: FailureStageSchema.optional(),
  pids: z.array(z.number().int().positive()).optional(),
  cmds: z.array(z.string()).optional(),
}).strict().superRefine((e, ctx) => {
  if (e.stage !== undefined && e.code !== failureToJobErrorCode(e.stage)) {
    ctx.addIssue({ code: "custom", path: ["code"], message: `для этапа ${e.stage} код должен быть ${failureToJobErrorCode(e.stage)}` });
  }
});
export type JobError = z.infer<typeof JobErrorSchema>;

const Ts = z.string().datetime();

/**
 * Задача (`05` §3, таблица `jobs`). JSON-столбцы разобраны: `input_refs_json` → `input`,
 * `output_refs_json` → `output_refs`, `error_json` → `error`; `cancel_requested` — boolean.
 * `attempt` — fencing-токен; `max_attempts` сравнивается с `interrupts` (M16).
 */
export const JobSchema = z.object({
  id: z.string().min(1),
  type: JobTypeSchema,
  project_id: z.string().min(1),
  scene_id: z.string().min(1).nullable(),
  version_id: z.string().min(1).nullable(),
  parent_job_id: z.string().min(1).nullable(),
  status: JobStatusSchema,
  progress: z.number().min(0).max(1),
  stage: z.string().nullable(),
  attempt: z.number().int().nonnegative(),
  max_attempts: z.number().int().positive(),
  interrupts: z.number().int().nonnegative(),
  input: z.unknown(),
  input_hash: z.string().nullable(),
  output_refs: z.unknown().nullable(),
  error: JobErrorSchema.nullable(),
  idempotency_key: z.string().min(1).nullable(),
  lease_owner: z.string().nullable(),
  lease_until: Ts.nullable(),
  cancel_requested: z.boolean(),
  created_at: Ts,
  started_at: Ts.nullable(),
  finished_at: Ts.nullable(),
}).strict();
export type Job = z.infer<typeof JobSchema>;
