// Генерация сцены (04-agent-workflows.md §2) из шагов (`steps.ts`, `fix-loop.ts`):
// план (срез — поиск KB по запросу и Motion Director; задача — Concept, кандидаты,
// Director) → draft + refs/ → Engineer → технический gate → (QA) → публикация.
// `runGeneration` — общий движок, `generateScene` — композиция среза (CLI до Task 17,
// e2e среза), обработчик задачи — `playground-generate.ts`.
//
// Хранилище: проверка перед стартом, перед каждым вызовом агента и рендером, перед
// публикацией; во время дочерних процессов — сторож `watchStorage`.
//
// Инвариант draft: после createDraft любой выход кончается либо публикацией (ready или
// failed с логами), либо карантином с причиной. Процесс не подтверждён мёртвым или
// хранилище недоступно — карантин; прерывание (отмена, fencing, остановка) — карантин,
// публикации нет; иначе — публикация failed. Если хранилище пропало, маркер карантина
// может не записаться — такой draft найдёт `sweepAbandonedDrafts` при следующем старте.
// До draft неудача пишет `failure.json` рядом с brief.json.
import { existsSync } from "node:fs";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type ConceptOutput,
  type DirectorOutput,
  type EditPlan,
  type EngineerReport,
  type FailureStage,
  type KnowledgeRef,
  type MotionSpec,
  type QAReport,
  type Settings,
  type Technique,
  type VersionManifest,
} from "@ms/contracts";
import { type ProcessRegistry, type ReapOptions, type StorageStatus, safeMkdir } from "@ms/core";
import { MOTION_KIT_DIR, type renderVersion } from "@ms/render";
import type { AgentRuntimeAdapter } from "../agents/runtime.js";
import type { AppConfig } from "../config.js";
import type { Permits } from "../jobs/semaphore.js";
import type { CapabilityView } from "../knowledge/types.js";
import { sha256File } from "../scenes/hash.js";
import { newId } from "../scenes/ids.js";
import type { checkSceneDir } from "../scenes/static-check.js";
import { type Draft, type PublishMeta, createDraft, publishVersion, quarantineDraft, writeBrief, writeSceneFailure } from "../scenes/store.js";
import type { typecheckVersion } from "../scenes/typecheck.js";
import { type StepRef } from "./checkpoints.js";
import { type AttemptRecord, type DraftFiles, type Exit, type LoopInput, type LoopState, type RenderRecord, type VisualQaRun, type ZoneDiff, describeDiff, diffSnapshots, runFixLoop, snapshotOutsideZone } from "./fix-loop.js";
import { type KnowledgeSource, SKILLS_REL, filterSelection, knowledgeRefs, prepareRefs, topPatterns } from "./refs.js";
import { selectQaFrames } from "./qa-frames.js";
import { cameraBrief } from "../qa/visual-agent.js";
import { renderEnv } from "./render-env.js";
import { type AgentRunRecord, RunCtx, clip, directorStep, errText, isStorageError, scenePropsStyle, sceneStyle, stageWall, startPropsStyle, withSceneSeed } from "./steps.js";
import { PROMPTS_DIR } from "../agents/prompts.js";

/** Словарь этапов неудачи — `@ms/contracts` (`FailureStageSchema`). */
export type { FailureStage };
export { isStorageError, scenePropsStyle, specWarnings } from "./steps.js";
export { diffSnapshots, snapshotOutsideZone } from "./fix-loop.js";

/** Каталог системных промптов ролей (`prompts/<role>.md`). */
export const DEFAULT_PROMPTS_DIR = PROMPTS_DIR;

/** Почему попытка прервана сигналом: отмена, fencing (захвачена заново) или остановка. */
export type AbortKind = "cancelled" | "fenced_out" | "interrupted";

export interface GenerateDeps {
  storage: () => Promise<StorageStatus>;
  kb: KnowledgeSource;
  agents: AgentRuntimeAdapter;
  render: typeof renderVersion;
  /** Static check каталога версии; идёт до typecheck и рендера (rulings п. 16). */
  check: typeof checkSceneDir;
  typecheck: typeof typecheckVersion;
  config: AppConfig;
  /** Период сторожа хранилища, мс (10 000). */
  watchIntervalMs?: number;
  /** Каталог official skills (`<kb.sourceRoot>/official_skills/skills/skills`). */
  skillsRoot?: string;
  /** Строки прогресса (CLI печатает в stderr). */
  log?: (line: string) => void;
  /**
   * Прогон задачи: `runId` = id задачи, `attempt` — fencing-токен, `registry` — реестр
   * процессов раннера; draft — `<runId>-a<attempt>`, в manifest пишется `job`. Без него —
   * свой `run_*`, попытка 1, файловый реестр (срез).
   */
  run?: { runId: string; attempt: number; registry?: ProcessRegistry };
  /** Сцена, созданная вызывающим (строка в БД и brief.json); без неё — новая. */
  sceneId?: string;
  /** Проект сцены (по умолчанию playground). */
  projectId?: string;
  /**
   * Попытка ещё текущая (`ctx.fenceOk` задачи): проверяется прямо перед публикацией;
   * `false` — draft в карантин `fenced_out`, публикации нет.
   */
  fenceOk?: () => boolean;
  /** Причина прерывания по сигналу (задача); по умолчанию — отмена. */
  abortReason?: () => AbortKind;
  /**
   * Публикация версии (задача: `SceneRepo.publish` с fencing и отменой в транзакции и
   * строкой `scene_versions`); по умолчанию — файловая `publishVersion` среза.
   */
  publish?: (draft: Draft, meta: PublishMeta) => Promise<PublishedRef>;
  /** Места семафоров раннера (задача). */
  permits?: { agents: Permits; renders: Permits };
  /** Опции разбора процессов дубля 2 после итога цикла (m2; подменяются в тестах). */
  reapOptions?: Omit<ReapOptions, "registry">;
  /** Прогресс задачи 0..1 и этап. */
  progress?: (p: number, stage: string) => void;
}

/** Опубликованная версия: каталог и (у задачи) id и номер. */
export interface PublishedRef {
  dir: string;
  warnings: string[];
  versionId?: string;
  number?: number;
}

export interface GenerateResult {
  status: "ready" | "failed" | "awaiting_input";
  runId: string;
  sceneId?: string;
  /** Есть, если создан draft: опубликованная версия или draft (при `storage`/`orphaned`). */
  versionDir?: string;
  /** Опубликованная версия (id и номер — при публикации задачи). */
  version?: { id?: string; number?: number; status: "ready" | "failed"; remotion: string };
  previewPath?: string;
  costUsd: number;
  engineerCalls: number;
  /** `transient` — сбой среды (обрыв сети в вызове Visual QA), не результат сцены. */
  failure?: { stage: FailureStage; message: string; transient?: true };
  /** Предупреждения (отказы прав Engineer, неизвестные kb_id, ошибки консоли браузера). */
  warnings: string[];
  /** Длительность этапов, мс (сумма вызовов по ключам `timed`). */
  timings: Record<string, number>;
  /**
   * Время этапов по часам, мс (S5): concept, director, engineer, check, render, qa, publish
   * (параллельные вызовы этапа не складываются) и total — постоянная метрика генерации.
   */
  stageWallMs?: Record<string, number>;
  /** Попытки с оценкой Visual QA и какая опубликована (S5). */
  attempts?: AttemptRecord[];
  /** Уточнения Concept (`awaiting_input`). */
  questions?: ConceptOutput["needs_clarification"];
  concept?: ConceptOutput;
  spec?: MotionSpec;
  refs: KnowledgeRef[];
  /** Итоговый QA-отчёт (задача). */
  qa?: QAReport;
  /** Последний отчёт Engineer. */
  report?: EngineerReport;
  agentRuns: AgentRunRecord[];
  renders: RenderRecord[];
  visualQa: VisualQaRun[];
  /** Чекпоинты шагов (`output_refs.steps`). */
  steps: Partial<Record<"concept" | "motion_director", StepRef>>;
}

/** План сцены до draft. */
export type PlanOutcome =
  | {
      kind: "plan";
      director: Pick<DirectorOutput, "selection" | "rationale">;
      spec: MotionSpec;
      candidates: CapabilityView[];
      concept?: ConceptOutput;
      /** Настройки версии, если план их меняет (правка); иначе — настройки запроса. */
      settings?: Settings;
      /** Правка версии (Task 18): draft — копия базы, версия публикуется от неё. */
      edit?: EditRequest;
    }
  | { kind: "awaiting_input"; concept: ConceptOutput }
  | { kind: "failed"; stage: FailureStage; message: string };

export interface GenerationRequest {
  prompt: string;
  settings: Settings;
  /** План: срез — поиск по запросу и Director; задача — Concept, кандидаты, Director. */
  plan: (rc: RunCtx) => Promise<PlanOutcome>;
  /** Полный gate задачи (provenance, props H4, QA по кадрам); без него — gate среза. */
  qa?: { allowRestricted: boolean };
  /** Чекпоинты шагов, записанные планом. */
  steps?: GenerateResult["steps"];
  /** Spec последних версий других сцен проекта (QA spec: повтор подписи кадра). */
  previous?: readonly MotionSpec[];
  /** Не переписывать brief.json сцены (правка: brief — исходный запрос сцены). */
  keepBrief?: boolean;
  /**
   * Дополнительная проверка каждой попытки (S6: наложение сцены сценария) после программных
   * проверок; blocking — исправление Engineer тем же циклом. Только с `qa`.
   */
  extraQa?: LoopInput["extraQa"];
  /** Сцена сценария (S11): носитель финала в задаче Engineer. */
  script?: boolean;
  /** Приём сцены сценария (S14): код без его ключевого компонента — исправление до рендера. */
  technique?: Technique;
  /** Время сцены сценария (S15b): окно речи и моменты слов — QA по всей сцене. */
  scriptTiming?: LoopInput["scriptTiming"];
  /** Видеосцена с прозрачным размещением (Task 37′): прямоугольник графики — Engineer и `props.layout`. */
  layout?: LoopInput["layout"];
}

/** Правка: база, план и как вести цикл (`playground-edit.ts`). */
export interface EditRequest {
  /** Версия-основа: её src/ и props.json копируются в draft (createDraft с parentVersionId). */
  baseVersionId: string;
  /** Каталог базы — для `changed_files` (что правка изменила относительно неё). */
  baseDir: string;
  /** План правки — в manifest (`edit_plan`). */
  plan: EditPlan;
  /** props.json правки параметров: пишется в draft, первый проход — без Engineer. */
  props?: string;
  /** Заголовок первого вызова Engineer (правка кода). */
  brief?: string;
  /** Запрос сцены для Visual QA: исходный запрос и правка (manifest.prompt — сообщение правки). */
  qaPrompt?: string;
  preserveCheck?: LoopInput["preserveCheck"];
  /** «Сохрани композицию»: кадр hold базы и правки по реестру раскладки (fix-loop). */
  preserveHold?: LoopInput["preserveHold"];
}

export async function runGeneration(req: GenerationRequest, deps: GenerateDeps, signal?: AbortSignal): Promise<GenerateResult> {
  const t0 = Date.now();
  const { prompt } = req;
  let settings = req.settings;
  const runId = deps.run?.runId ?? newId("run");
  const attempt = deps.run?.attempt ?? 1;
  const sceneId = deps.sceneId ?? newId("scn");
  const projectId = deps.projectId;
  let root = "";
  let rc: RunCtx | undefined = undefined;
  let draft: Draft | undefined;
  let briefWritten = false;
  let spec: MotionSpec | undefined = undefined;
  let concept: ConceptOutput | undefined;
  let refs: KnowledgeRef[] = [];
  const state: LoopState = { engineerCalls: 0, renders: [], visualQa: [], deniedLog: [] };
  const log = deps.log ?? (() => undefined);
  const fallbackWarnings: string[] = [];
  /** Время этапов, записанное в pipeline-log.json (то же число — в результате). */
  let wall: Record<string, number> | undefined;

  const result = (status: GenerateResult["status"], extra: Partial<GenerateResult> = {}): GenerateResult => {
    const timings = rc?.timings ?? {};
    timings.total = Date.now() - t0;
    return {
      status, runId, sceneId, versionDir: draft?.dir, costUsd: rc?.spent ?? 0, engineerCalls: state.engineerCalls,
      warnings: rc?.warnings ?? fallbackWarnings, timings, refs, agentRuns: rc?.records ?? [], renders: state.renders,
      visualQa: state.visualQa, steps: req.steps ?? {},
      ...(rc ? { stageWallMs: wall ?? stageWall(rc.spans, timings.total) } : {}),
      ...(state.attempts ? { attempts: state.attempts } : {}),
      ...(spec ? { spec } : {}), ...(concept ? { concept } : {}), ...(state.report ? { report: state.report } : {}),
      ...extra,
    };
  };
  /**
   * Неудача без опубликованной версии: рядом с brief.json пишется failure.json (если
   * хранилище позволяет), чтобы сцена с одним brief не выглядела «в работе».
   */
  const failed = async (stage: FailureStage, message: string, extra: Partial<GenerateResult> = {}, transient?: true): Promise<GenerateResult> => {
    log(`✗ ${stage}: ${message}`);
    if (briefWritten && !extra.versionDir) {
      await writeSceneFailure(root, sceneId, { run_id: runId, stage, message, draft: draft?.dir ?? null }).catch((e: unknown) =>
        (rc?.warnings ?? fallbackWarnings).push(`failure.json не записан: ${(e as Error).message}`),
      );
    }
    return result("failed", { failure: { stage, message, ...(transient ? { transient } : {}) }, ...extra });
  };
  const aborted = (): { stage: FailureStage; reason: AbortKind } => {
    const reason = deps.abortReason?.() ?? "cancelled";
    return { reason, stage: reason };
  };

  // --- 1. Хранилище до любой записи ---
  let status: StorageStatus;
  try {
    status = await deps.storage();
  } catch (e) {
    return failed("storage", `проверка хранилища упала: ${errText(e)}`);
  }
  if (!status.ok) return failed("storage", `${status.reason}: ${status.detail}`);
  root = status.root;
  rc = new RunCtx(deps, signal, root, runId, attempt, deps.run?.registry);
  // реестр Chrome (chrome-wrapper.sh пишет туда сам) — до трат на агентов: без каталога рендер
  // падал бы уже после Director и Engineer
  try {
    await safeMkdir(root, "run/processes");
  } catch (e) {
    return failed("storage", `каталог run/processes не создан: ${errText(e)}`);
  }

  // правка: brief.json сцены — исходный запрос, его не переписываем
  if (!req.keepBrief) {
    try {
      await writeBrief(root, sceneId, { prompt, settings, created_at: new Date().toISOString() }, projectId);
      briefWritten = true;
    } catch (e) {
      if (isStorageError(e)) return failed("storage", errText(e));
      throw e;
    }
  }

  // --- 2. План: (Concept,) кандидаты KB, Motion Director ---
  const plan = await req.plan(rc);
  if (plan.kind === "failed") {
    if (plan.stage === "cancelled" && signal?.aborted) {
      const a = aborted();
      return failed(a.stage, plan.message);
    }
    return failed(plan.stage, plan.message);
  }
  if (plan.kind === "awaiting_input") {
    concept = plan.concept;
    return result("awaiting_input", { questions: plan.concept.needs_clarification });
  }
  concept = plan.concept;
  if (plan.settings) settings = plan.settings;
  const edit = plan.edit;
  spec = withSceneSeed(plan.spec, sceneId);
  const director = plan.director;
  // выбор Director — только из предложенных кандидатов и только permissive (или с разрешением)
  const filtered = filterSelection(director.selection, plan.candidates, deps.kb, req.qa?.allowRestricted ?? false);
  for (const x of filtered.dropped) rc.warnings.push(`Director выбрал ${x.kb_id} — отброшено: ${x.reason}`);
  const kr = knowledgeRefs(filtered.selection, deps.kb);
  refs = kr.refs;
  if (kr.unknown.length > 0) rc.warnings.push(`Director выбрал неизвестные kb_id (пропущены): ${kr.unknown.join(", ")}`);
  if (refs.length === 0) rc.warnings.push("knowledge-refs пуст: Director не выбрал ни одной допустимой записи KB");
  const selection = { items: filtered.selection.items.filter((i) => refs.some((r) => r.kb_id === i.kb_id)) };
  log(`Director: «${spec.title}» (${spec.composition?.archetype ?? "—"}), ${spec.beats.length} битов, KB: ${refs.map((r) => `${r.kb_id} (${r.strategy})`).join(", ") || "—"}`);
  const startStyle = startPropsStyle(settings, spec.palette_overrides);
  const frames = selectQaFrames(spec, settings.duration_frames, sceneStyle(startStyle, settings));
  if (signal?.aborted) return failed(aborted().stage, "отменено до draft");

  // --- 3. Draft. С этого места любой выход — публикация failed или карантин ---
  try {
    draft = await createDraft(root, { runId, attempt, sceneId, projectId, ...(edit ? { parentVersionId: edit.baseVersionId } : {}) });
  } catch (e) {
    const storage = isStorageError(e) || (await rc.storageProblem()) !== undefined;
    return failed(storage ? "storage" : "prepare", `draft не создан: ${errText(e)}`);
  }
  const draftDir = draft.dir;
  let phase: FailureStage = "prepare";
  const ctx = rc;

  // Файлы пайплайна в draft — из памяти: пишутся до Engineer, восстанавливаются после
  // нарушения границы и перезаписываются перед публикацией (опубликованы всегда эти).
  const owned: Record<string, string> = {
    "spec.json": JSON.stringify(spec, null, 2) + "\n",
    "settings.json": JSON.stringify(settings, null, 2) + "\n",
    "style.json": JSON.stringify(sceneStyle(startStyle, settings), null, 2) + "\n",
    "selection.json": JSON.stringify({ ...selection, rationale: director.rationale, dropped: filtered.dropped }, null, 2) + "\n",
    "knowledge-refs.json": JSON.stringify(refs satisfies KnowledgeRef[], null, 2) + "\n",
  };
  const skillsRoot = deps.skillsRoot ?? join(deps.config.kb.sourceRoot, SKILLS_REL);
  const filesFor = (dir: string, own: Record<string, string>): DraftFiles => {
    const f: DraftFiles = {
      set: (name, text) => {
        own[name] = text;
      },
      async write() {
        for (const [name, text] of Object.entries(own)) {
          await rm(join(dir, name), { recursive: true, force: true });
          await writeFile(join(dir, name), text);
        }
      },
      /**
       * Возвращает draft вне зоны Engineer к снимку `before`: добавленное удаляется, файлы
       * пайплайна пишутся из памяти, `refs/` готовится заново, прочее (кадры и превью
       * прошлого рендера) удаляется — рендер создаст их снова. Не сошлось — исключение.
       */
      async restore(before: Map<string, string>, d: ZoneDiff) {
        for (const p of d.added) await rm(join(dir, p), { recursive: true, force: true });
        let refsDirty = false;
        const dropped: string[] = [];
        for (const p of [...d.changed, ...d.removed]) {
          if (p in own) continue; // ниже — write
          if (p === "refs" || p.startsWith("refs/")) refsDirty = true;
          else {
            await rm(join(dir, p), { recursive: true, force: true });
            dropped.push(p);
          }
        }
        if (refsDirty) {
          await rm(join(dir, "refs"), { recursive: true, force: true });
          await prepareRefs(dir, selection, deps.kb, skillsRoot);
        }
        await f.write();
        const gone = (p: string) => dropped.some((x) => p === x || p.startsWith(`${x}/`));
        const expected = new Map([...before].filter(([p]) => !gone(p)));
        const left = diffSnapshots(expected, await snapshotOutsideZone(dir));
        if (left.added.length + left.changed.length + left.removed.length > 0) {
          throw new Error(`draft вне src/ и props.json не восстановлен: ${describeDiff(left)}`);
        }
      },
    };
    return f;
  };
  const files = filesFor(draftDir, owned);

  const afterDraft = async (): Promise<Exit> => {
    await files.write();
    await prepareRefs(draftDir, selection, deps.kb, skillsRoot);
    const ed = edit;
    if (ed?.props !== undefined) await writeFile(join(draftDir, "props.json"), ed.props);
    const cacheDir = await safeMkdir(root, "cache");
    phase = "engineer";
    // правка параметров — без второго дубля: код базы не переписывается ради оценки
    const paramEdit = ed?.props !== undefined;
    return runFixLoop(
      {
        rc: ctx, deps, draftDir, cacheDir, settings, spec: spec!, refs, frames, files,
        ...(req.qa ? { qa: { brief: { prompt: ed?.qaPrompt ?? prompt, settings, camera: cameraBrief(spec!) }, allowRestricted: req.qa.allowRestricted } } : {}),
        ...(req.previous ? { previous: req.previous } : {}),
        ...(req.extraQa ? { extraQa: req.extraQa } : {}),
        ...(req.script ? { script: true } : {}),
        ...(req.technique ? { technique: req.technique } : {}),
        ...(req.scriptTiming ? { scriptTiming: req.scriptTiming } : {}),
        ...(req.layout ? { layout: req.layout } : {}),
        progress: deps.progress,
        ...(ed ? { reviseOnly: true, ...(paramEdit ? { skipFirstEngineer: true } : {}), ...(ed.brief ? { brief: ed.brief } : {}), ...(ed.preserveCheck ? { preserveCheck: ed.preserveCheck } : {}), ...(ed.preserveHold ? { preserveHold: ed.preserveHold } : {}) } : {}),
        // второй дубль (S5): свой каталог попытки задачи вне draft (граница draft первого дубля
        // не видит его файлов), файлы пайплайна со своим spec и refs/
        takeDir: paramEdit ? undefined : async (spec2) => {
          const dir = await safeMkdir(root, `run/tmp/${runId}-a${attempt}/take2`);
          const own: Record<string, string> = { ...owned, "spec.json": JSON.stringify(spec2, null, 2) + "\n" };
          const f = filesFor(dir, own);
          await f.write();
          await prepareRefs(dir, selection, deps.kb, skillsRoot);
          return { dir, files: f };
        },
      },
      state,
    );
  };

  /** Публикация версии; вся подготовка (логи, хеши, окружение) — внутри try. */
  const publish = async (exit: Exit): Promise<GenerateResult> => {
    try {
      deps.progress?.(0.95, "publish");
      if (exit.qa) owned["qa.json"] = JSON.stringify(exit.qa, null, 2) + "\n";
      // опубликованные файлы пайплайна — всегда из памяти, а не то, что лежит в draft
      await files.write();
      if (ctx.warnings.length > 0 || state.deniedLog.length > 0) {
        await writeFile(join(draftDir, "warnings.json"), JSON.stringify({ warnings: ctx.warnings, permission_denials: state.deniedLog }, null, 2) + "\n");
      }
      wall = stageWall(ctx.spans, Date.now() - t0);
      await writeFile(
        join(draftDir, "pipeline-log.json"),
        JSON.stringify({
          run_id: runId, attempt, cost_usd: ctx.spent, engineer_calls: state.engineerCalls, visual_qa: state.visualQa,
          ...(state.attempts ? { attempts: state.attempts } : {}), timings: ctx.timings, stage_wall_ms: wall, history: ctx.history,
        }, null, 2) + "\n",
      );
      const changed = edit
        ? await changedFromBase(edit.baseDir, draftDir)
        : [...(await listFiles(draftDir, "src")), ...(existsSync(join(draftDir, "props.json")) ? ["props.json"] : [])];
      const previewFile = join(draftDir, "preview.mp4");
      const preview = exit.ok
        ? { path: "preview.mp4", sha256: exit.previewSha }
        : existsSync(previewFile)
          ? { path: "preview.mp4", sha256: await sha256File(previewFile) }
          : null;
      // технический gate пройден; визуальный, смысловой и стилевой — из QA (у среза — не проверялись)
      const qa = exit.qa?.gate ?? (exit.ok ? ({ technical: "pass", visual: "not_checked", semantic: "not_checked", style: "not_checked" } as const) : null);
      const meta = {
        schema_version: 1 as const,
        scene_id: sceneId,
        parent_version_id: edit?.baseVersionId ?? null,
        prompt,
        edit_plan: edit?.plan ?? null,
        settings,
        changed_files: changed,
        render_env: await renderEnv(),
        knowledge_refs: refs.map((r) => ({ kb_id: r.kb_id, commit: r.commit, license: r.license, strategy: r.strategy })),
        agent_runs: ctx.agentLogs,
        qa,
        preview,
        status: exit.ok ? ("ready" as const) : ("failed" as const),
        ...(exit.ok ? {} : { failure: { stage: exit.stage, message: exit.message } }),
        qa_frames: exit.ok ? frames : [],
        qa_frames_sha256: exit.ok ? exit.framesSha : [],
        // ruling P3: восстановление узнаёт версию попытки по manifest.job
        ...(deps.run ? { job: { id: runId, attempt } } : {}),
      } satisfies Omit<VersionManifest, "files" | "version_id" | "number" | "created_at">;
      if (deps.fenceOk && !deps.fenceOk()) {
        const a = signal?.aborted ? aborted().reason : "fenced_out";
        // префикс маркера — причина: `cancelled`/`interrupted` одноразовые (cleanupDrafts, H6)
        const msg = {
          cancelled: `cancelled: отмена задачи ${runId} запрошена — попытка ${attempt} версию не публикует`,
          interrupted: `interrupted: попытка ${attempt} задачи ${runId} остановлена (остановка или хранилище) — публикации нет`,
          fenced_out: `fenced_out: попытка ${attempt} задачи ${runId} больше не текущая (отменена или захвачена заново) — публикации нет`,
        }[a];
        await quarantine(draft!, msg, ctx.warnings);
        return failed(a, msg);
      }
      const fileOnly = async (d: Draft, m: PublishMeta): Promise<PublishedRef> => {
        const v = await publishVersion(d, m, deps.storage);
        return { dir: v.dir, warnings: v.warnings, versionId: v.versionId, number: v.manifest.number };
      };
      const published = await ctx.timed("publish", () => (deps.publish ?? fileOnly)(draft!, meta));
      ctx.warnings.push(...published.warnings);
      const extra: Partial<GenerateResult> = {
        versionDir: published.dir,
        version: { id: published.versionId, number: published.number, status: meta.status, remotion: meta.render_env.remotion },
        previewPath: preview ? join(published.dir, "preview.mp4") : undefined,
        ...(exit.qa ? { qa: exit.qa } : {}),
      };
      if (exit.ok) {
        log(`✓ ready: ${published.dir}`);
        return result("ready", extra);
      }
      return failed(exit.stage, exit.message, extra, exit.transient);
    } catch (e) {
      const sp = isStorageError(e) ? errText(e) : await ctx.storageProblem();
      // fencing и отмена в транзакции публикации: draft уже в карантине (SceneRepo) — второй раз не помечаем
      if (!(e as { quarantined?: boolean }).quarantined) await quarantine(draft!, `публикация не удалась: ${errText(e)}`, ctx.warnings);
      if (/^fenced_out\b/.test(errText(e))) return failed("fenced_out", errText(e));
      if (/^cancelled\b/.test(errText(e))) return failed("cancelled", errText(e));
      if (sp) return failed("storage", `публикация не удалась: ${errText(e)}`);
      const what = exit.ok ? "" : ` (до этого: ${exit.stage}: ${clip(exit.message, 500)})`;
      return failed("publish", `публикация не удалась: ${errText(e)}${what}`);
    }
  };

  // --- 4. Единый выход после draft ---
  let exit: Exit;
  try {
    exit = await afterDraft();
  } catch (e) {
    const storage = isStorageError(e) || (await ctx.storageProblem()) !== undefined;
    // `alive` — процесс второго дубля не подтверждён мёртвым (runFixLoop, m3): только карантин
    const alive = (e as { alive?: unknown } | undefined)?.alive === true;
    exit = { ok: false, stage: storage ? "storage" : phase, message: `${phase}: ${errText(e)}`, ...(alive ? { alive: true } : {}) };
  }
  // второй дубль `fresh` с другим кадрированием выиграл — версия несёт его spec
  if (exit.ok && exit.spec) spec = exit.spec;
  if (!exit.ok && signal?.aborted) {
    // прерывание (отмена, fencing, остановка): отменённая или устаревшая попытка версию не
    // публикует, draft — в карантин с причиной (`cancelled`/`interrupted` — одноразовые, H6)
    const a = aborted();
    const prefix = a.reason === "interrupted" ? "interrupted" : a.reason;
    await quarantine(draft, `${prefix}: ${exit.stage}: ${exit.message}`, ctx.warnings);
    return failed(a.stage, exit.message);
  }
  if (exit.ok) return publish(exit);
  if (exit.alive) {
    // процесс не подтверждён мёртвым — только карантин, публиковать нельзя
    await quarantine(draft, `${exit.stage}: ${exit.message}`, ctx.warnings);
    return failed(exit.stage, exit.message, {}, exit.transient);
  }
  const sp = await ctx.storageProblem();
  if (sp) {
    // Процессы мертвы, но хранилища нет: маркер, скорее всего, не запишется. Такой draft
    // без маркера и manifest найдёт следующий старт (sweepAbandonedDrafts → abandoned).
    await quarantine(draft, `хранилище недоступно: ${sp}; ${exit.stage}: ${exit.message}`, ctx.warnings);
    return failed("storage", exit.stage === "storage" ? exit.message : `${sp} (этап ${exit.stage}: ${exit.message})`);
  }
  return publish(exit);
}

/** Карантин draft; ошибка записи маркера — предупреждение (хранилище может быть недоступно). */
async function quarantine(draft: Draft, reason: string, warnings: string[]): Promise<void> {
  await quarantineDraft(draft, reason).catch((e: unknown) => warnings.push(`карантин draft не записан: ${(e as Error).message}`));
}

async function listFiles(dir: string, rel = ""): Promise<string[]> {
  if (!existsSync(join(dir, rel))) return [];
  const out: string[] = [];
  for (const e of await readdir(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(dir, r)));
    else if (e.isFile()) out.push(r);
  }
  return out.sort();
}

/** Файлы сцены (src/**, props.json), которые правка добавила, изменила или удалила относительно базы. */
async function changedFromBase(baseDir: string, draftDir: string): Promise<string[]> {
  const scene = async (dir: string) => [...(await listFiles(dir, "src")), ...(existsSync(join(dir, "props.json")) ? ["props.json"] : [])];
  const before = new Set(await scene(baseDir));
  const out: string[] = [];
  for (const p of await scene(draftDir)) {
    if (!before.delete(p)) out.push(p);
    else if ((await sha256File(join(baseDir, p))) !== (await sha256File(join(draftDir, p)))) out.push(p);
  }
  return [...out, ...before].sort();
}

/** Справка motion-kit для Director (то же, что Engineer получит в `refs/`). */
export const readKitApi = () => readFile(join(MOTION_KIT_DIR, "API.md"), "utf8");

/** Тексты паттернов KB; не прочитался — предупреждение. */
export async function patternTexts(kb: Pick<KnowledgeSource, "getVisualPatterns">, slugs: string[], warnings: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of slugs) {
    try {
      out.push(await kb.getVisualPatterns(p));
    } catch (e) {
      warnings.push(`паттерн ${p} не прочитан: ${errText(e)}`);
    }
  }
  return out;
}

/**
 * Генерация среза: кандидаты KB по запросу (визуальные, native/adaptable, permissive) →
 * Motion Director → Engineer → технический gate → публикация (`qa` — только технический).
 * Отмена — карантин `cancelled`, без публикации.
 */
export async function generateScene(prompt: string, settings: Settings, deps: GenerateDeps, signal?: AbortSignal): Promise<GenerateResult> {
  return runGeneration(
    {
      prompt,
      settings,
      plan: async (rc) => {
        const candidates = deps.kb.search(prompt, {}, 12).map((h) => h.view);
        const patterns = topPatterns(candidates, 2);
        const texts = await patternTexts(deps.kb, patterns, rc.warnings);
        rc.log(`KB: ${candidates.length} кандидатов, паттерны: ${patterns.join(", ") || "—"}`);
        const style = sceneStyle(scenePropsStyle(settings), settings);
        const d = await directorStep(rc, { prompt, settings, candidates, patternTexts: texts, kitApi: await readKitApi(), style });
        if (!d.ok) return { kind: "failed", stage: d.stage, message: d.message };
        return { kind: "plan", director: d.director, spec: d.spec, candidates };
      },
    },
    deps,
    signal,
  );
}
