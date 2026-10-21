// Временный обработчик `playground.generate` (Task 13, M6): generateScene среза с
// контекстом попытки задачи. Task 17 заменяет регистрацию на `playgroundGenerate` и
// удаляет этот файл.
import { type Job, SettingsSchema, failureToJobErrorCode } from "@ms/contracts";
import { z } from "zod";
import { type GenerateDeps, type GenerateResult, generateScene } from "../pipeline/generate.js";
import type { JobContext, JobHandler } from "./types.js";

const InputSchema = z.object({ sceneId: z.string().min(1), prompt: z.string().min(1), settings: SettingsSchema }).passthrough();

export interface InterimDeps {
  /** Зависимости пайплайна для попытки (хранилище, KB, агенты, рендер, конфиг). */
  deps: (ctx: JobContext) => GenerateDeps;
  /** Подмена generateScene в тестах. */
  generate?: typeof generateScene;
  /** Полный итог пайплайна (CLI печатает стоимость и предупреждения и при неудаче). */
  onResult?: (job: Job, r: GenerateResult) => void;
}

export function interimGenerate(d: InterimDeps): JobHandler {
  return async (ctx) => {
    const input = InputSchema.safeParse(ctx.job.input);
    if (!input.success) return { status: "failed", error: { code: "pipeline", message: `вход playground.generate не годится: ${input.error.message}` } };
    const { sceneId, prompt, settings } = input.data;
    const deps: GenerateDeps = { ...d.deps(ctx), sceneId, run: { runId: ctx.run.runId, attempt: ctx.run.attempt, registry: ctx.run.registry } };
    const r = await (d.generate ?? generateScene)(prompt, settings, deps, ctx.signal);
    d.onResult?.(ctx.job, r);
    if (r.status === "ready") {
      return {
        status: "completed",
        outputRefs: { scene_id: r.sceneId ?? sceneId, version_dir: r.versionDir ?? null, preview_path: r.previewPath ?? null, cost_usd: r.costUsd, warnings: r.warnings },
      };
    }
    const f = r.failure ?? { stage: "publish" as const, message: "неудача без причины" };
    const error = { code: failureToJobErrorCode(f.stage), stage: f.stage, message: f.message };
    if (f.stage === "orphaned") return { status: "blocked", error };
    if (f.stage === "cancelled") return { status: "cancelled", error };
    return { status: "failed", error };
  };
}
