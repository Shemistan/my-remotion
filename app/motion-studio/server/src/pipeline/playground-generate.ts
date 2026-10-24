// Обработчик задачи `playground.generate` (P1-10, P1-12; 04 §2): Concept (уточнения →
// awaiting_input) → кандидаты KB по ключам Concept → Motion Director → draft попытки →
// Engineer → технический gate (static, typecheck, provenance, props H4, рендер, probe) →
// QA по кадрам (программные проверки, spec, Visual QA) → исправления (общий лимит
// `maxAutoFixes`) → публикация через `SceneRepo.publish` (fencing и отмена в транзакции) →
// журнал задачи (`recordRun`). Сервер и CLI регистрируют один и тот же обработчик.
import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { type Job, type MotionSpec, MotionSpecSchema, SettingsSchema, failureToJobErrorCode } from "@ms/contracts";
import { z } from "zod";
import * as jobs from "../db/repos/jobs.js";
import * as scenes from "../db/repos/scenes.js";
import * as versions from "../db/repos/versions.js";
import { setOutputRefs } from "../jobs/queue.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import type { SceneRepo } from "../scenes/repo.js";
import type { StepRef } from "./checkpoints.js";
import { type AbortKind, type GenerateDeps, type GenerateResult, patternTexts, readKitApi, runGeneration } from "./generate.js";
import { selectCandidates } from "./kb-select.js";
import { assistantMessage, recordRun } from "./record.js";
import { type CheckpointOpts, conceptStep, directorStep, errText, scenePropsStyle, sceneStyle } from "./steps.js";

export const PlaygroundGenerateInputSchema = z.object({
  sceneId: z.string().min(1),
  prompt: z.string().min(1),
  settings: SettingsSchema,
  /** Явное разрешение пользователя на restricted/unknown записи KB. */
  allowRestricted: z.boolean().optional(),
  /** Ответы на уточнения Concept (`provideInput`): ответы или `skip`. */
  answers: z.union([z.record(z.string()), z.literal("skip")]).optional(),
}).passthrough();
export type PlaygroundGenerateInput = z.infer<typeof PlaygroundGenerateInputSchema>;

export interface PlaygroundDeps {
  /** Зависимости пайплайна для попытки: хранилище, KB, агенты, рендер, проверки, конфиг. */
  deps: (ctx: JobContext) => Pick<GenerateDeps, "storage" | "kb" | "agents" | "render" | "check" | "typecheck" | "config" | "watchIntervalMs" | "skillsRoot" | "log">;
  /** Публикация с fencing и отменой в транзакции, строка `scene_versions`. */
  repo: SceneRepo;
  /** Полный итог пайплайна (CLI печатает стоимость и предупреждения). */
  onResult?: (job: Job, r: GenerateResult) => void;
}

/** Почему прерван сигнал попытки: отмена пользователя, fencing или остановка/хранилище. */
export function abortKind(ctx: JobContext): AbortKind {
  try {
    const j = jobs.get(ctx.db, ctx.job.id);
    if (j?.cancel_requested) return "cancelled";
    if (!j || j.attempt !== ctx.attempt) return "fenced_out";
  } catch {
    // база недоступна (storage_offline) — прерывание
  }
  return "interrupted";
}

export function playgroundGenerate(d: PlaygroundDeps): JobHandler {
  return async (ctx) => {
    const parsed = PlaygroundGenerateInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return { status: "failed", error: { code: "pipeline", message: `вход playground.generate не годится: ${parsed.error.message}` } };
    const { sceneId, prompt, settings, answers } = parsed.data;
    const allowRestricted = parsed.data.allowRestricted ?? false;
    const jobId = ctx.job.id;
    const fence = { jobId, attempt: ctx.attempt };
    const base = d.deps(ctx);
    const projectId = scenes.get(ctx.db, sceneId)?.project_id;
    const previous = projectId ? await previousSpecs(ctx, d.repo.root, projectId, sceneId) : [];

    // чекпоинты Concept и Director (M7): файл в logs/agent-runs/<jobId>/checkpoints/, ссылка — в output_refs.steps
    const steps: Partial<Record<"concept" | "motion_director", StepRef>> = {};
    const cp: CheckpointOpts = {
      jobId,
      onStep: (role, ref) => {
        if (role !== "concept" && role !== "motion_director") return;
        steps[role] = ref;
        try {
          setOutputRefs(ctx.db, jobId, ctx.attempt, { steps: stepRefs(steps) });
        } catch {
          // журнал шагов — не причина ронять попытку (база может быть закрыта)
        }
      },
    };

    const deps: GenerateDeps = {
      ...base,
      log: (line) => {
        base.log?.(line);
        ctx.emit("log", line);
      },
      sceneId,
      ...(projectId ? { projectId } : {}),
      run: { runId: jobId, attempt: ctx.attempt, registry: ctx.run.registry },
      // отмена, повторный захват, storage_offline — попытка больше не публикует
      fenceOk: () => ctx.fenceOk() && !ctx.signal.aborted,
      abortReason: () => abortKind(ctx),
      publish: async (draft, meta) => {
        const v = await d.repo.publish(draft, meta, fence);
        return { dir: v.dir, warnings: v.warnings.map((w) => `${w.code}: ${w.message}`), versionId: v.versionId, number: v.manifest.number };
      },
      permits: { agents: ctx.agents, renders: ctx.renders },
      progress: (p, stage) => ctx.progress(p, stage),
    };

    const r = await runGeneration(
      {
        prompt,
        settings,
        qa: { allowRestricted },
        steps,
        previous,
        plan: async (rc) => {
          ctx.progress(0.05, "concept");
          const c = await conceptStep(rc, { prompt, settings, ...(answers !== undefined ? { answers } : {}) }, cp);
          if (!c.ok) return { kind: "failed", stage: c.stage, message: c.message };
          const concept = c.concept;
          if (concept.needs_clarification.length > 0 && answers === undefined) return { kind: "awaiting_input", concept };
          const candidates = selectCandidates(deps.kb, prompt, concept, 12, { allowRestricted }).map((h) => h.view);
          rc.log(`KB: ${candidates.length} кандидатов по ключам Concept`);
          const texts = await patternTexts(deps.kb, concept.patterns, rc.warnings);
          const style = sceneStyle({ ...scenePropsStyle(settings), ...(concept.style_hint.palette_overrides ? { palette_overrides: concept.style_hint.palette_overrides } : {}) }, settings);
          ctx.progress(0.15, "director");
          const dr = await directorStep(rc, { prompt, settings, concept, candidates, patternTexts: texts, kitApi: await readKitApi(), style, previous }, cp);
          if (!dr.ok) return { kind: "failed", stage: dr.stage, message: dr.message };
          return { kind: "plan", director: dr.director, spec: dr.spec, candidates, concept };
        },
      },
      deps,
      ctx.signal,
    );
    d.onResult?.(ctx.job, r);
    record(ctx, d.repo.root, sceneId, r);
    return toHandlerResult(r, sceneId);
  };
}

/** Сколько последних сцен проекта сверяется с новой по подписи кадра. */
const SIGNATURE_SCENES = 3;

/**
 * Spec текущих версий последних других сцен проекта (новые первыми). Не прочиталась —
 * событие лога, сверка без неё: проверка подсказывает, а не валит генерацию.
 */
async function previousSpecs(ctx: JobContext, root: string, projectId: string, sceneId: string): Promise<MotionSpec[]> {
  const out: MotionSpec[] = [];
  for (const v of versions.recentInProject(ctx.db, projectId, sceneId, SIGNATURE_SCENES)) {
    try {
      out.push(MotionSpecSchema.parse(JSON.parse(await readFile(join(root, v.path, "spec.json"), "utf8"))));
    } catch (e) {
      ctx.emit("log", `spec версии ${v.id} не прочитана для сверки подписи кадра: ${errText(e)}`);
    }
  }
  return out;
}

/** `output_refs.steps`: `concept`, `director` (без префикса роли). */
function stepRefs(steps: Partial<Record<"concept" | "motion_director", StepRef>>) {
  return { ...(steps.concept ? { concept: steps.concept } : {}), ...(steps.motion_director ? { director: steps.motion_director } : {}) };
}

/**
 * Журнал попытки в БД (fencing внутри); сбой записи — событие, не отказ задачи. `text` —
 * своё сообщение ассистента (правка: ответ Edit Planner и итог); без него — итог генерации.
 */
export function record(ctx: JobContext, root: string, sceneId: string, r: GenerateResult, text?: (auto: string) => string): void {
  const silent = r.failure && ["cancelled", "fenced_out", "interrupted"].includes(r.failure.stage);
  const messages: { role: "assistant" | "system"; text: string }[] = [];
  if (r.status === "awaiting_input") {
    for (const q of r.questions ?? []) messages.push({ role: "system", text: `${q.question}\n(если пропустить: ${q.default_if_skipped})` });
  } else if (!silent) {
    const auto = assistantMessage({ version: r.version, concept: r.concept, refs: r.refs, kitComponents: r.report?.kit_components_used, qa: r.qa, failure: r.failure });
    messages.push({ role: "assistant", text: text ? text(auto) : auto });
  }
  const version = r.version?.id && r.versionDir
    ? { id: r.version.id, number: r.version.number, status: r.version.status, path: relative(root, r.versionDir).split(sep).join("/") }
    : undefined;
  try {
    const ok = recordRun(ctx.db, ctx.job.id, {
      attempt: ctx.attempt, sceneId, agentRuns: r.agentRuns, renders: r.renders, refs: r.refs, messages,
      ...(version ? { version } : {}), ...(r.qa ? { qa: r.qa } : {}), ...(r.version?.remotion ? { remotion: r.version.remotion } : {}),
    });
    if (!ok) ctx.emit("fenced_out", `журнал попытки ${ctx.attempt} не записан: попытка устарела`);
  } catch (e) {
    ctx.emit("record_failed", `журнал попытки не записан: ${errText(e)}`);
  }
}

export function toHandlerResult(r: GenerateResult, sceneId: string): HandlerResult {
  if (r.status === "awaiting_input") return { status: "awaiting_input", questions: r.questions ?? [] };
  if (r.status === "ready") {
    return {
      status: "completed",
      outputRefs: {
        scene_id: r.sceneId ?? sceneId,
        version_id: r.version?.id ?? null,
        version_number: r.version?.number ?? null,
        version_dir: r.versionDir ?? null,
        preview_path: r.previewPath ?? null,
        cost_usd: r.costUsd,
        engineer_calls: r.engineerCalls,
        qa: r.qa?.gate ?? null,
        // S5: время этапов по часам и итог — постоянная метрика генерации
        stage_wall_ms: r.stageWallMs ?? null,
        attempts: r.attempts ?? null,
        warnings: r.warnings,
        steps: stepRefs(r.steps),
      },
    };
  }
  const f = r.failure ?? { stage: "publish" as const, message: "неудача без причины" };
  const error = { code: failureToJobErrorCode(f.stage), stage: f.stage, message: f.message };
  if (f.stage === "orphaned") return { status: "blocked", error };
  if (f.stage === "cancelled") return { status: "cancelled", error };
  return { status: "failed", error };
}
