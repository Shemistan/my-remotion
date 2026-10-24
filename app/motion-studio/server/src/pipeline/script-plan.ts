// Задача `script.plan` (спека сценария §6.1, §11): Script Director → проверки кодом → стиль
// проекта → ревизия плана сценария `plan/<id>/r1/script-plan.json` с fencing.
//
// Один вызов агента на весь текст (без инструментов, бюджет `analysis.maxCostUsd`). Ответ
// проверяет `validateScriptPlan`; blocking-проблемы и отклонённые сцены → до `scene.maxAutoFixes`
// переотправок с перечнем; отказ схемы — своя одна переотправка (при maxAutoFixes ≥ 1). Из всех
// ответов берётся лучший: меньше проблем (blocking + отклонённые), затем больше сцен, при равенстве —
// более поздний. Выбранный ответ — чекпоинт задачи (хеш входа, модели и системного промпта).
//
// Каждый запуск — полное перестроение: новый `plan_id` (`scriptPlans.create`, Р13), ревизия 1;
// правки человека (S4) — следующие ревизии того же плана. Индекс — `scriptPlans.insertRevision`
// (видеотаблица `scene_plans` не трогается). Стиль: задан человеком — не меняется; иначе — из
// ответа агента (плохой контраст — палитра пресета, событие `style_fallback`); `plan.recheck`
// сценарий не ставит. M3: ревизия плана этой задачи уже опубликована — завершение по ней без агента.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Fps, type JobError, PATTERN_SLUGS, type PatternSlug, type PlanIssue, type ProjectStyleBase, type ProjectStyleDoc, ProjectStyleDocSchema,
  type ReadingSettings, ReadingSettingsSchema, type ScriptDirectorOutput, ScriptDirectorOutputSchema, type ScriptPlanRevisionDoc,
  ScriptPlanRevisionDocSchema, type ScriptRevisionDoc,
} from "@ms/contracts";
import { canonicalJson } from "@ms/contracts/canonical";
import type { StorageStatus } from "@ms/core";
import { type ZodType, z } from "zod";
import { loadPrompt, oneLine } from "../agents/prompts.js";
import type { AgentRuntimeAdapter, Role } from "../agents/runtime.js";
import { buildScriptDirectorTask } from "../agents/script-prompts.js";
import { PATTERN_FALLBACK, patternSummaryFromKb } from "../analysis/planner-input.js";
import { currentProjectStyle, projectStyleFrom, saveProjectStyle } from "../analysis/project-style.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactStore } from "../artifacts/store.js";
import type { AppConfig } from "../config.js";
import * as projects from "../db/repos/projects.js";
import { scriptPlans, scriptRevisions } from "../db/repos/script.js";
import * as styles from "../db/repos/styles.js";
import type { HandlerResult, JobHandler } from "../jobs/types.js";
import type { KnowledgeAdapter } from "../knowledge/adapter.js";
import { sha256 } from "../scenes/hash.js";
import { type ScriptPlanValidation, validateScriptPlan } from "../script/plan-validate.js";
import { planDiversity } from "../script/diversity.js";
import { SCRIPT_PLAN_FILE, currentScript } from "../script/read.js";
import { scriptReading } from "../script/text.js";
import { checkpointPath, readCheckpoint, stepInputHash, writeCheckpoint } from "./checkpoints.js";
import { planFailure, planIdFor, planPublications } from "./plan-visual.js";
import { RunCtx, errText, toolless } from "./steps.js";

/** Вход задачи: `useAgent: false` — план без сцен (UI-тесты без LLM); `reading` нет — как у прошлого плана. */
export const ScriptPlanJobInputSchema = z.object({
  projectId: z.string().min(1),
  useAgent: z.boolean().optional(),
  reading: ReadingSettingsSchema.optional(),
}).strict();

export const SCRIPT_PLAN_STAGES = ["prepare", "agent", "publish"] as const;
export type ScriptPlanStage = (typeof SCRIPT_PLAN_STAGES)[number];

/** Зависимости обработчика. */
export interface ScriptPlanDeps {
  root: string;
  config: AppConfig;
  storage: () => Promise<StorageStatus>;
  agents: AgentRuntimeAdapter;
  /** Описания паттернов из KB; нет — запасной словарь `PATTERN_FALLBACK`. */
  kb?: Pick<KnowledgeAdapter, "getVisualPatterns">;
  watchIntervalMs?: number;
  onStage?: (stage: ScriptPlanStage) => void | Promise<void>;
  log?: (line: string) => void;
  /** Системный промпт роли для хеша чекпоинта (по умолчанию `loadPrompt`). */
  systemPrompt?: (role: Role) => string;
}

/** Итог задачи (`output_refs`). */
export interface ScriptPlanResult {
  plan_id: string;
  revision: number;
  rel_path: string;
  /** Ревизия опубликована прошлой попыткой этой задачи (M3). */
  reused: boolean;
  items: number;
  skipped: number;
  /** Отклонено проверкой кодом (входит в `skipped`). */
  rejected: number;
  issues: { blocking: number; warning: number };
  style: { style_id: string; revision: number; author: "agent" | "user" };
  agent: { status: "skipped" | "completed"; calls: number; cost_usd: number; retried: number; from_checkpoint: number };
}

const DEFAULT_FPS: Fps = { num: 30, den: 1 };
const DEFAULT_STYLE: ProjectStyleBase = { preset: "dark-premium", intensity: "balanced", depth: 1 };

class ScriptFail extends Error {
  constructor(readonly error: JobError, readonly status: "failed" | "blocked" = "failed") {
    super(error.message);
  }
}

/** Оценка ответа: проверка кодом и число проблем по вине агента. */
interface Evaluated {
  v: ScriptPlanValidation;
  faults: number;
}

const evaluateWith = (doc: ScriptRevisionDoc, reading: ReadingSettings, fps: Fps) => (o: ScriptDirectorOutput): Evaluated => {
  const v = validateScriptPlan(o, doc, reading, fps);
  return { v, faults: v.rejected.length + v.issues.filter((x) => x.severity === "blocking").length };
};

/** Перечень проблем ответа для переотправки: отклонённое и blocking, затем warning — как пожелание. */
export function scriptFaultList(v: ScriptPlanValidation): string {
  const L: string[] = [];
  for (const r of v.rejected) L.push(`- ${r.id}: ${r.code} — ${oneLine(r.detail)}`);
  for (const x of v.issues.filter((i) => i.severity === "blocking")) L.push(`- ${x.item_id ? `${x.item_id} ${sceneWords(v, x.item_id)}` : "план"}: ${x.code} — ${oneLine(x.message)}`);
  const warn = v.issues.filter((i) => i.severity === "warning");
  if (warn.length > 0) {
    L.push("", "Желательно поправить (не ошибка):");
    for (const x of warn.slice(0, 30)) L.push(`- ${x.item_id ? `${x.item_id} ${sceneWords(v, x.item_id)}` : "план"}: ${x.code} — ${oneLine(x.message)}`);
  }
  return L.join("\n");
}

/** Коды проблем по вине агента (отклонённое и blocking), без повторов. */
const faultCodes = (v: ScriptPlanValidation): string[] =>
  [...new Set([...v.rejected.map((x) => x.code), ...v.issues.filter((x) => x.severity === "blocking").map((x) => x.code)])];

const sceneWords = (v: ScriptPlanValidation, id: string): string => {
  const x = v.items.find((i) => i.id === id);
  return x ? `(слова ${x.start_word_id}–${x.end_word_id}, ${x.technique})` : "";
};

const counts = (issues: PlanIssue[]) => ({
  blocking: issues.filter((x) => x.severity === "blocking").length,
  warning: issues.filter((x) => x.severity === "warning").length,
});

export const scriptPlan: (depsOf: () => ScriptPlanDeps) => JobHandler = (depsOf) => async (ctx) => {
  const d = depsOf();
  const prep = (message: string): HandlerResult => ({ status: "failed", error: { code: "pipeline", stage: "prepare", message } });
  const parsed = ScriptPlanJobInputSchema.safeParse(ctx.job.input);
  if (!parsed.success) return prep(`вход script.plan не годится: ${parsed.error.message}`);
  const { projectId } = parsed.data;
  if (projectId !== ctx.job.project_id) return prep(`вход script.plan: projectId ${projectId} не совпадает с проектом задачи ${ctx.job.project_id}`);
  const project = projects.get(ctx.db, projectId);
  if (!project) return prep(`проекта ${projectId} нет`);
  if (project.kind !== "script") return prep(`not_script_project: проект ${projectId} не сценарный (${project.kind})`);

  const root = d.root;
  const paths = artifactPaths(root, projectId);
  const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
  const signal = ctx.signal;
  let stage: ScriptPlanStage = "prepare";
  const enter = async (s: ScriptPlanStage, p: number) => {
    stage = s;
    ctx.progress(p, s);
    await d.onStage?.(s);
    signal.throwIfAborted();
  };
  const rc = new RunCtx({
    storage: d.storage, agents: d.agents, config: d.config, budgetUsd: d.config.analysis.maxCostUsd, budgetName: "плана сценария",
    permits: { agents: ctx.agents, renders: ctx.renders }, ...(d.watchIntervalMs ? { watchIntervalMs: d.watchIntervalMs } : {}), ...(d.log ? { log: d.log } : {}),
  }, signal, root, ctx.job.id, ctx.attempt, ctx.run.registry);

  try {
    // M3: ревизия плана этой задачи уже опубликована (попытка упала после COMMIT)
    const pubs = planPublications(ctx.db, projectId, ctx.job.id);
    if (pubs.plan) {
      const rel = `${paths.planRev(pubs.plan.id, pubs.plan.revision)}/${SCRIPT_PLAN_FILE}`;
      const doc = ScriptPlanRevisionDocSchema.parse(JSON.parse(await readFile(join(root, rel), "utf8")));
      ctx.emit("plan_reused", `ревизия плана ${doc.plan_id} r${doc.revision} опубликована прошлой попыткой: агент не вызывается`);
      const st = styles.revision(ctx.db, doc.inputs.style.id, doc.inputs.style.revision);
      const rejected = doc.skipped.filter((x) => x.reason.startsWith("отклонено проверкой")).length;
      return done({
        plan_id: doc.plan_id, revision: doc.revision, rel_path: rel, reused: true, items: doc.items.length, skipped: doc.skipped.length, rejected,
        issues: counts(doc.issues), style: { style_id: doc.inputs.style.id, revision: doc.inputs.style.revision, author: st?.author ?? "agent" },
        agent: { status: doc.agent === "skipped" ? "skipped" : "completed", calls: 0, cost_usd: 0, retried: 0, from_checkpoint: 0 },
      });
    }

    const script = currentScript(ctx.db, root, projectId);
    if (!script) return prep(`no_script: у проекта ${projectId} нет текста сценария — сначала сохраните текст`);
    const scriptRow = scriptRevisions.get(ctx.db, script.script_id, script.revision)!;
    const reading = parsed.data.reading ?? scriptReading(ctx.db, root, projectId);
    const fps = project.settings?.fps ?? DEFAULT_FPS;
    const status = await d.storage();
    if (!status.ok) throw new ScriptFail({ code: "storage_unavailable", stage: "storage", message: `${status.reason}: ${status.detail}` });
    const style0 = currentProjectStyle(ctx.db, root, projectId);
    // M3: стиль опубликован прошлой попыткой — вход агента со стилем до него (как у той попытки: чекпоинт)
    const inputStyle = pubs.style ? styleDoc(pubs.style.id, pubs.style.revision - 1) : style0;
    const evaluate = evaluateWith(script, reading, fps);

    let chosen: ScriptDirectorOutput;
    let ev: Evaluated;
    let agentInfo: ScriptPlanResult["agent"] = { status: "skipped", calls: 0, cost_usd: 0, retried: 0, from_checkpoint: 0 };
    if (parsed.data.useAgent === false) {
      ctx.emit("agent_skipped", "агент Script Director не вызывался (useAgent: false): план без сцен — сцены добавляет человек");
      chosen = ScriptDirectorOutputSchema.parse({
        chapters: [], numbers: [], scenes: [],
        style: { ...(inputStyle?.base ?? DEFAULT_STYLE), rationale: inputStyle?.rationale || "по умолчанию: план без агента" },
      });
      ev = evaluate(chosen);
    } else {
      await enter("agent", 0.1);
      const patterns = await patternMap();
      const r = await runAgent(script, reading, fps, patterns, inputStyle, evaluate);
      chosen = r.output;
      ev = r.ev;
      agentInfo = { ...r.info, calls: rc.records.length, cost_usd: Math.round(rc.spent * 1e4) / 1e4 };
    }
    if (ev.faults > 0) {
      ctx.emit("plan_problems", `после проверки осталось проблем по вине агента: ${ev.faults} (${faultCodes(ev.v).join(", ")}) — видны человеку`);
    }

    await enter("publish", 0.9);
    const style = await decideStyle(chosen.style, inputStyle, pubs.style);
    const stRev = styles.revision(ctx.db, style.style_id, style.revision)!;
    const planId = planIdFor(ctx.job.id);
    const div = planDiversity(ev.v.items);
    const doc: ScriptPlanRevisionDoc = ScriptPlanRevisionDocSchema.parse({
      schema_version: 1, plan_id: planId, revision: 1,
      inputs: { script: { id: script.script_id, revision: script.revision, hash: scriptRow.hash }, style: { id: stRev.style_id, revision: stRev.revision, hash: stRev.hash } },
      fps, aspect: "16:9", reading, analysis: ev.v.analysis, items: ev.v.items, skipped: ev.v.skipped, issues: ev.v.issues,
      diversity: { techniques: div.techniques, adjacent_repeats: div.adjacent_repeats, kinetic_share: div.kinetic_share },
      ...(parsed.data.useAgent === false ? { agent: "skipped" as const } : {}),
    });
    const destRel = paths.planRev(planId, 1);
    const store = new ArtifactStore({ root, db: ctx.db, guard: d.storage });
    await store.publishJobDoc(fence, destRel, SCRIPT_PLAN_FILE, doc, (db, files) => {
      scriptPlans.create(db, { id: planId, project_id: projectId });
      scriptPlans.insertRevision(db, { doc, rel_path: `${destRel}/${SCRIPT_PLAN_FILE}`, sha256: files[0]!.sha256 });
    });
    const res: ScriptPlanResult = {
      plan_id: planId, revision: 1, rel_path: `${destRel}/${SCRIPT_PLAN_FILE}`, reused: false,
      items: doc.items.length, skipped: doc.skipped.length, rejected: ev.v.rejected.length, issues: counts(doc.issues),
      style: { style_id: style.style_id, revision: style.revision, author: style.author }, agent: agentInfo,
    };
    d.log?.(`script.plan ${planId}: сцен ${res.items}, пропусков ${res.skipped} (отклонено ${res.rejected}), blocking ${res.issues.blocking}, $${agentInfo.cost_usd}`);
    return done(res);
  } catch (e) {
    if (e instanceof ScriptFail) return { status: e.status, error: e.error };
    return planFailure(e, { ctx, stage, storage: d.storage, what: "план сценария" });
  }

  /** Описания паттернов: KB (первый абзац), иначе запасной словарь. */
  async function patternMap(): Promise<Record<PatternSlug, string>> {
    const out = {} as Record<PatternSlug, string>;
    for (const slug of PATTERN_SLUGS) {
      let summary: string | undefined;
      if (d.kb) {
        try {
          summary = patternSummaryFromKb(await d.kb.getVisualPatterns(slug));
        } catch {
          summary = undefined;
        }
      }
      out[slug] = summary ?? PATTERN_FALLBACK[slug];
    }
    return out;
  }

  /**
   * Script Director: вызов → проверка кодом → (проблемы — до `maxAutoFixes` переотправок с
   * перечнем) → лучший из ответов; отказ схемы — одна переотправка на весь запуск. Чекпоинт —
   * выбранный ответ.
   */
  async function runAgent(
    script: ScriptRevisionDoc, reading: ReadingSettings, fps: Fps, patterns: Record<PatternSlug, string>, style: ProjectStyleDoc | undefined,
    evaluate: (o: ScriptDirectorOutput) => Evaluated,
  ): Promise<{ output: ScriptDirectorOutput; ev: Evaluated; info: ScriptPlanResult["agent"] }> {
    const label = "Script Director";
    const role = "script_director" as const;
    const fixes = Math.max(0, Math.floor(d.config.scene.maxAutoFixes));
    let schemaRetries = fixes >= 1 ? 1 : 0;
    const info: ScriptPlanResult["agent"] = { status: "completed", calls: 0, cost_usd: 0, retried: 0, from_checkpoint: 0 };
    const base = { script, reading, fps, patterns, style: style?.base ?? null, styleFixed: style?.author === "user" };
    const make = (workdir: string, seq: number, fix?: string) => buildScriptDirectorTask({ ...base, workdir, ...(fix ? { fix } : {}) }, { ...rc.taskRun, seq });
    const promptSha = sha256((d.systemPrompt ?? loadPrompt)(role));
    const probe = make("", 1);
    const hash = stepInputHash(role, probe.model, { input: probe.input, system_prompt_sha256: promptSha });
    const saved = await readCheckpoint(checkpointPath(root, ctx.job.id, role), hash);
    const fromCp = saved === undefined ? undefined : ScriptDirectorOutputSchema.safeParse(saved);
    if (fromCp?.success) {
      info.from_checkpoint = 1;
      ctx.emit("agent_checkpoint", `${label}: ответ из чекпоинта прошлой попытки — агент не вызывался`);
      return { output: fromCp.data, ev: evaluate(fromCp.data), info };
    }
    const fatal = (r: { stage: string; message: string }): never => {
      if (r.stage === "storage") throw new ScriptFail({ code: "storage_unavailable", stage: "storage", message: r.message });
      if (r.stage === "orphaned") throw new ScriptFail({ code: "stale_process", stage: "orphaned", message: r.message }, "blocked");
      if (r.stage === "cancelled" || signal.aborted) throw new DOMException(r.message, "AbortError");
      if (r.stage === "budget") throw new ScriptFail({ code: "budget", stage: "budget", message: r.message });
      throw new ScriptFail({ code: "pipeline", message: `${label}: ${r.message}` });
    };
    let seq = 0;
    /** Один вызов (с перечнем исправлений); отказ схемы — переотправка, пока не израсходована. */
    const call = async (fix?: string) => {
      let why: string | undefined;
      for (;;) {
        const k = ++seq;
        const note = why;
        const r = await toolless(rc, role, "prepare", label, (workdir) => {
          const t = make(workdir, k, fix);
          if (note !== undefined) t.input += `\n\n# Прошлый ответ отклонён схемой\n\n${oneLine(note).slice(0, 2000)}\n\nОтветь заново строго по схеме.`;
          return t;
        }, ScriptDirectorOutputSchema as ZodType<ScriptDirectorOutput>);
        if (r.ok || r.kind !== "schema" || schemaRetries <= 0) return r;
        schemaRetries--;
        info.retried++;
        why = r.message;
        ctx.emit("agent_retry", `${label}: ответ не прошёл схему — переотправка (одна): ${r.message.slice(0, 500)}`);
      }
    };
    const first = await call();
    if (!first.ok) fatal(first);
    const answers: { output: ScriptDirectorOutput; ev: Evaluated }[] = [];
    const firstOut = (first as { output: ScriptDirectorOutput }).output;
    answers.push({ output: firstOut, ev: evaluate(firstOut) });
    let best = 0;
    for (let round = 1; round <= fixes; round++) {
      const last = answers[answers.length - 1]!;
      if (last.ev.faults === 0) break;
      info.retried++;
      ctx.emit("agent_retry", `${label}: проблем ${last.ev.faults} (${faultCodes(last.ev.v).join(", ")}) — переотправка ${round} из ${fixes} с перечнем`);
      const r = await call(scriptFaultList(last.ev.v));
      if (!r.ok) {
        if (["storage", "orphaned", "cancelled"].includes(r.stage) || signal.aborted) fatal(r);
        ctx.emit("agent_retry_failed", `${label}: переотправка ${round} не удалась (${r.message.slice(0, 300)}) — остаётся лучший из полученных ответов`);
        break;
      }
      const next = { output: r.output, ev: evaluate(r.output) };
      answers.push(next);
      const b = answers[best]!.ev;
      if (next.ev.faults < b.faults || (next.ev.faults === b.faults && next.ev.v.items.length >= b.v.items.length)) {
        best = answers.length - 1;
      } else {
        ctx.emit("agent_retry_kept_first", `${label}: ответ ${answers.length} хуже (проблем ${next.ev.faults}, сцен ${next.ev.v.items.length}) — остаётся ответ ${best + 1} (проблем ${b.faults}, сцен ${b.v.items.length})`);
      }
    }
    const { output, ev } = answers[best]!;
    try {
      await writeCheckpoint(root, ctx.job.id, role, { input_hash: hash, output });
    } catch (e) {
      ctx.emit("checkpoint_failed", `${label}: чекпоинт не записан: ${errText(e)}`);
    }
    return { output, ev, info };
  }

  /**
   * Стиль проекта для плана: опубликованный этой задачей (M3) — он; человека — как есть; иначе из
   * ответа агента (blocking-проблемы — палитра и шрифт пресета), тот же, что текущий, — без новой ревизии.
   */
  async function decideStyle(
    agent: ScriptDirectorOutput["style"], current: ProjectStyleDoc | undefined, published: { id: string; revision: number } | undefined,
  ): Promise<ProjectStyleDoc> {
    if (published) return styleDoc(published.id, published.revision)!;
    if (current?.author === "user") {
      ctx.emit("style_kept", `стиль проекта задан человеком (${current.style_id} r${current.revision}) — агент его не меняет`);
      return current;
    }
    let base: ProjectStyleBase = {
      preset: agent.preset, intensity: agent.intensity, depth: agent.depth,
      ...(agent.palette_overrides && Object.keys(agent.palette_overrides).length > 0 ? { palette_overrides: agent.palette_overrides } : {}),
      ...(agent.font !== undefined ? { font: agent.font } : {}),
    };
    const bad = projectStyleFrom(base).issues.filter((x) => x.severity === "blocking");
    if (bad.length > 0) {
      base = { preset: agent.preset, intensity: agent.intensity, depth: agent.depth };
      ctx.emit("style_fallback", `стиль агента не прошёл проверку (${bad.map((x) => x.message).join("; ")}) — палитра и шрифт пресета ${agent.preset}`);
    }
    if (current && canonicalJson(current.base) === canonicalJson(base)) return current;
    return saveProjectStyle({ db: ctx.db, store: new ArtifactStore({ root, db: ctx.db, guard: d.storage }), root }, projectId, base, "agent", {
      rationale: agent.rationale, fence, recheck: false, ...(current ? { base_revision: current.revision } : {}),
    });
  }

  /** Документ ревизии стиля; ревизии нет (0 или не найдена) — `undefined`. */
  function styleDoc(id: string, revision: number): ProjectStyleDoc | undefined {
    const rev = revision > 0 ? styles.revision(ctx.db, id, revision) : undefined;
    return rev ? ProjectStyleDocSchema.parse(JSON.parse(readFileSync(join(root, rev.rel_path), "utf8"))) : undefined;
  }

  function done(r: ScriptPlanResult): HandlerResult {
    ctx.progress(1, "done");
    return { status: "completed", outputRefs: r };
  }
};
