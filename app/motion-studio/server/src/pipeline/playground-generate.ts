// Обработчик задачи `playground.generate` (P1-10, P1-12; 04 §2): Concept (уточнения →
// awaiting_input) → кандидаты KB по ключам Concept → Motion Director → draft попытки →
// Engineer → технический gate (static, typecheck, provenance, props H4, рендер, probe) →
// QA по кадрам (программные проверки, spec, Visual QA) → исправления (общий лимит
// `maxAutoFixes`) → публикация через `SceneRepo.publish` (fencing и отмена в транзакции) →
// журнал задачи (`recordRun`). Сервер и CLI регистрируют один и тот же обработчик.
import { readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { readFileSync } from "node:fs";
import { type ConceptOutput, ConceptOutputSchema, type Job, type MotionSpec, MotionSpecSchema, STRUCTURE_RULES, structureOf, type QAIssue, type ScriptPlanRevisionDoc, ScriptPlanRevisionDocSchema, type ScriptSceneContext, ScriptSceneContextSchema, type ScriptSceneItem, SettingsSchema, failureToJobErrorCode } from "@ms/contracts";
import { z } from "zod";
import { loadPartial } from "../agents/prompts.js";
import * as jobs from "../db/repos/jobs.js";
import * as plans from "../db/repos/plans.js";
import { scriptScenes } from "../db/repos/script.js";
import { overlayChecks, shortsUiIssues } from "../script/overlay-check.js";
import { fragmentFitAttempt } from "../qa/fragment-fit.js";
import { foreignLabelQa } from "../qa/spec-checks.js";
import { PAYOFF_PEAK, payoffStart } from "./script-temporal.js";
import { recordPublishedFingerprint } from "../script/batch.js";
import * as scenes from "../db/repos/scenes.js";
import * as versions from "../db/repos/versions.js";
import { setOutputRefs } from "../jobs/queue.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import type { SceneRepo } from "../scenes/repo.js";
import { type StepRef, checkpointPath } from "./checkpoints.js";
import { type AbortKind, type GenerateDeps, type GenerateResult, patternTexts, readKitApi, runGeneration } from "./generate.js";
import { selectCandidates } from "./kb-select.js";
import { assistantMessage, recordRun } from "./record.js";
import { type CheckpointOpts, conceptStep, directorStep, errText, sceneStyle, startPropsStyle } from "./steps.js";

export const PlaygroundGenerateInputSchema = z.object({
  sceneId: z.string().min(1),
  prompt: z.string().min(1),
  settings: SettingsSchema,
  /** Явное разрешение пользователя на restricted/unknown записи KB. */
  allowRestricted: z.boolean().optional(),
  /** Ответы на уточнения Concept (`provideInput`): ответы или `skip`. */
  answers: z.union([z.record(z.string()), z.literal("skip")]).optional(),
  /** Сцена сценария (S5, §6.2): проверяется `ScriptSceneContextSchema` в обработчике. */
  script: z.unknown().optional(),
  /** Отпечаток сцены плана (S5 fix I2): после публикации — в `script_scenes.item_fingerprint`. */
  script_fingerprint: z.string().optional(),
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
    const { sceneId, prompt, settings } = parsed.data;
    const allowRestricted = parsed.data.allowRestricted ?? false;
    const jobId = ctx.job.id;
    const fence = { jobId, attempt: ctx.attempt };
    const base = d.deps(ctx);
    const projectId = scenes.get(ctx.db, sceneId)?.project_id;
    // сцена сценария: бриф вместо промпта, уточнения пропускаются, стиль — проекта (S5)
    let sc: ScriptScene | undefined;
    if (parsed.data.script !== undefined) {
      const r = scriptScene(ctx, d.repo.root, parsed.data.script);
      if (typeof r === "string") return { status: "failed", error: { code: "pipeline", message: r } };
      sc = r;
    }
    // S10: двойник 9:16 — concept и структура из эталонной 16:9-версии, Concept не вызывается
    let ref: Reference | undefined;
    if (sc?.ctx.reference_version_id) {
      const r = await loadReference(ctx, d.repo.root, sc.ctx.reference_version_id, sc.item, settings);
      if (typeof r === "string") return { status: "failed", error: { code: "pipeline", message: r } };
      ref = r;
    }
    const answers = parsed.data.answers ?? (sc ? "skip" : undefined);
    const neighbors = sc && projectId ? await neighborSpecs(ctx, d.repo.root, sc) : [];
    const previous = neighbors.length > 0 ? neighbors : projectId ? await previousSpecs(ctx, d.repo.root, projectId, sceneId) : [];
    const kbQuery = sc ? `${sc.item.purpose} ${sc.item.idea} ${sc.item.quote}` : prompt;
    const scriptRules = sc ? loadPartial("script-scene") : undefined;
    const speechWindow = sc ? { lead: sc.ctx.lead_frames, speech: settings.duration_frames - sc.ctx.lead_frames - sc.ctx.tail_frames, tail: sc.ctx.tail_frames } : undefined;
    // S11: раскрытие не раньше слова и подписи только из текста сцены — подсказки Director
    // S15b: фрагмент сценария — сверка смысла строк spec и props.json малой моделью
    const fragment = sc ? { quote: sc.item.quote, purpose: sc.item.purpose, key_terms: sc.item.key_terms, data: sc.item.data } : undefined;
    const scriptHints = sc ? { ...(sc.ctx.key_moments ? { keyMoments: sc.ctx.key_moments } : {}), sourceText: sceneSourceText(sc.item), ...(fragment ? { fragment } : {}) } : undefined;

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
        if (parsed.data.script_fingerprint) recordPublishedFingerprint(ctx.db, sceneId, parsed.data);
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
        // сцена сценария (S6, Р16): альфа-версия — перерендер с transparent, фон только <Background>
        // S11: подписи-примеры kit в props.json (код Engineer) — warning QA версии
        ...(sc ? { script: true, technique: sc.item.technique } : {}),
        // S15b: окно речи и моменты слов — проверки по всей сцене (временной проход пробы)
        ...(speechWindow ? { scriptTiming: { window: speechWindow, ...(sc?.ctx.key_moments ? { moments: sc.ctx.key_moments } : {}) } } : {}),
        // S10 fix I1: 9:16 — текст под интерфейсом Shorts (низ, колонка кнопок) по пробе раскладки
        ...(sc ? {
          extraQa: async (v) => {
            const peak = payoffStart(v.spec);
            return [
              ...(await overlayChecks(v)), ...(await propsForeignLabels(v.versionDir, scriptHints!.sourceText)), ...shortsUiIssues(v.layout, v.settings),
              ...(await fragmentFitAttempt(v, fragment!, speechWindow, peak === undefined ? undefined : peak + PAYOFF_PEAK)),
            ];
          },
        } : {}),
        plan: async (rc) => {
          ctx.progress(0.05, "concept");
          let concept: ConceptOutput;
          if (ref) {
            concept = ref.concept;
            rc.log(`Concept пропущен: двойник 9:16 по эталону ${ref.label}`);
          } else {
            const c = await conceptStep(rc, { prompt, settings, ...(answers !== undefined ? { answers } : {}), ...(scriptRules ? { scriptRules } : {}) }, cp);
            if (!c.ok) return { kind: "failed", stage: c.stage, message: c.message };
            concept = c.concept;
          }
          if (concept.needs_clarification.length > 0 && answers === undefined) return { kind: "awaiting_input", concept };
          const candidates = selectCandidates(deps.kb, kbQuery, concept, 12, { allowRestricted }).map((h) => h.view);
          rc.log(`KB: ${candidates.length} кандидатов по ключам Concept`);
          const texts = await patternTexts(deps.kb, concept.patterns, rc.warnings);
          if (sc && (concept.style_hint.palette_overrides || concept.style_hint.preset !== settings.style_preset)) {
            rc.log("style_hint Concept не применяется: у сцены сценария стиль проекта (settings.style_lock)");
          }
          const style = sceneStyle(startPropsStyle(settings, sc ? undefined : concept.style_hint.palette_overrides), settings);
          ctx.progress(0.15, "director");
          const dr = await directorStep(rc, { prompt, settings, concept, ...(ref ? { reference: ref.spec } : {}), candidates, patternTexts: texts, kitApi: await readKitApi(), style, previous, ...(speechWindow ? { speechWindow } : {}), ...(scriptRules ? { scriptRules } : {}), ...(scriptHints ? { scriptHints } : {}) }, cp);
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

/** `foreign_label` по props.json версии; файла нет или он не читается — без замечаний (их даст техпроверка). */
async function propsForeignLabels(versionDir: string, source: string): Promise<QAIssue[]> {
  try {
    return foreignLabelQa(JSON.parse(await readFile(join(versionDir, "props.json"), "utf8")), source);
  } catch {
    return [];
  }
}

/** Текст, из которого сцена сценария законно берёт подписи (S11): фрагмент, идея, назначение, термины, числа. */
export function sceneSourceText(item: ScriptSceneItem): string {
  const data = item.data.flatMap((d) => [d.label, String(d.value), String(d.value).replace(".", ","), d.unit ?? "", d.quote]);
  return [item.quote, item.idea, item.purpose, ...item.key_terms.map((k) => k.text), ...data].join("\n");
}

/** Сцена сценария задачи: вход `script`, документ плана и сцена плана. */
interface ScriptScene {
  ctx: ScriptSceneContext;
  plan: ScriptPlanRevisionDoc;
  item: ScriptSceneItem;
}

/** Вход `script` и сцена плана из ревизии `plan_revision`; не годится — текст ошибки. */
function scriptScene(ctx: JobContext, root: string, raw: unknown): ScriptScene | string {
  const p = ScriptSceneContextSchema.safeParse(raw);
  if (!p.success) return `вход script не годится: ${p.error.message}`;
  const rev = plans.revision(ctx.db, p.data.plan_id, p.data.plan_revision);
  if (!rev) return `ревизии плана ${p.data.plan_id}@r${p.data.plan_revision} нет`;
  let plan: ScriptPlanRevisionDoc;
  try {
    plan = ScriptPlanRevisionDocSchema.parse(JSON.parse(readFileSync(join(root, rev.rel_path), "utf8")));
  } catch (e) {
    return `план сценария ${p.data.plan_id}@r${p.data.plan_revision} не прочитан: ${errText(e)}`;
  }
  const item = plan.items.find((x) => x.id === p.data.item_id);
  if (!item) return `в плане ${p.data.plan_id}@r${p.data.plan_revision} нет сцены ${p.data.item_id}`;
  return { ctx: p.data, plan, item };
}

/** Эталон двойника 9:16 (S10): spec 16:9-версии и concept её задачи (или собранный по spec). */
interface Reference {
  spec: MotionSpec;
  concept: ConceptOutput;
  /** Для журнала: «v<N> (<id>)». */
  label: string;
}

/**
 * Эталон: готовая неповреждённая версия, её spec.json и чекпоинт Concept задачи, которая её
 * сделала. Чекпоинта нет (версия правки, старый журнал) — concept собирается из spec и сцены
 * плана. Структура всегда та, что в spec эталона (правило Concept подбирается под неё).
 */
async function loadReference(ctx: JobContext, root: string, versionId: string, item: ScriptSceneItem, settings: z.infer<typeof SettingsSchema>): Promise<Reference | string> {
  const v = versions.get(ctx.db, versionId);
  if (!v || v.status !== "ready" || v.broken_reason) return `эталонная версия 16:9 ${versionId} не готова или удалена — переделайте под 9:16 заново`;
  let spec: MotionSpec;
  try {
    spec = MotionSpecSchema.parse(JSON.parse(await readFile(join(root, v.path, "spec.json"), "utf8")));
  } catch (e) {
    return `spec эталона ${versionId} не прочитана: ${errText(e)}`;
  }
  const structure = structureOf(spec);
  const rule = STRUCTURE_RULES.find(([, st]) => st === structure)![0];
  let concept: ConceptOutput | undefined;
  if (v.created_by_job_id) {
    try {
      const raw = JSON.parse(await readFile(checkpointPath(root, v.created_by_job_id, "concept"), "utf8")) as { output?: unknown };
      const p = ConceptOutputSchema.safeParse(raw.output);
      if (p.success) concept = p.data;
    } catch {
      // чекпоинта нет — concept собирается ниже
    }
  }
  if (!concept) ctx.emit("log", `чекпоинта Concept у эталона ${versionId} нет — concept собран из spec эталона и сцены плана`);
  const base: ConceptOutput = concept ?? {
    needs_clarification: [],
    concept: spec.composition?.idea ?? item.idea,
    patterns: [item.pattern],
    kb_queries: { ru: [item.idea], en: [] },
    composition_mode: "fullscreen",
    style_hint: { preset: settings.style_preset },
    structure: { rule, runner_up: "build-strike", reason: "структура эталона 16:9" },
  };
  const same = STRUCTURE_RULES.find(([r]) => r === base.structure.rule)?.[1] === structure;
  return {
    spec,
    concept: { ...base, needs_clarification: [], structure: same ? base.structure : { ...base.structure, rule, reason: `структура эталона 16:9 (${structure})` } },
    label: `v${v.number} (${v.id})`,
  };
}

/** Соседей плана для сверки подписи кадра (до 2: предыдущая и следующая принятые). */
const NEIGHBORS = 2;

/**
 * Spec готовых версий соседних сцен плана того же формата (S5, §6.2): подпись кадра новой
 * сцены не повторяет соседей в пакете. Нет готовых — пусто (вызывающий берёт `recentInProject`).
 */
async function neighborSpecs(ctx: JobContext, root: string, sc: ScriptScene): Promise<MotionSpec[]> {
  const accepted = sc.plan.items.filter((x) => x.status === "accepted");
  const at = accepted.findIndex((x) => x.id === sc.item.id);
  const around = (at < 0 ? [] : [accepted[at - 1], accepted[at + 1]]).filter((x): x is ScriptSceneItem => x !== undefined).slice(0, NEIGHBORS);
  const out: MotionSpec[] = [];
  const used: string[] = [];
  for (const n of around) {
    const row = scriptScenes.get(ctx.db, sc.ctx.plan_id, n.id, sc.ctx.aspect);
    const vid = row ? scenes.get(ctx.db, row.scene_id)?.current_version_id : undefined;
    const v = vid ? versions.get(ctx.db, vid) : undefined;
    if (!v || v.status !== "ready" || v.broken_reason) continue;
    try {
      out.push(MotionSpecSchema.parse(JSON.parse(await readFile(join(root, v.path, "spec.json"), "utf8"))));
      used.push(n.id);
    } catch (e) {
      ctx.emit("log", `spec версии ${v.id} соседа ${n.id} не прочитана для сверки подписи кадра: ${errText(e)}`);
    }
  }
  if (used.length > 0) ctx.emit("log", `подпись кадра сверяется с соседями плана: ${used.join(", ")}`);
  return out;
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
