// Обработчик `plan.visual` (Task 32): визуальный план и StyleBible проекта. Шаги: вход → гейт
// Approval A → входы на текущих ревизиях (смысловая разметка ровно на текущих EDL и транскрипте —
// ревью Task 31 m4; анализ видеоряда того же исходника), иначе `failed` с перечнем недостающего →
// `plannerInput` → Visual Planner (без инструментов, бюджет `analysis.maxCostUsd`) → `buildPlanItems`
// + `planChecks` → стиль проекта → ревизия плана с fencing.
//
// Агент даёт только id слов, зону, режим и оценки: время, кадры, прямоугольник и долю лица считает
// код. Проблемы по вине агента (отклонённые размещения — `quote_mismatch`, `anchor_in_cut`, … — и
// blocking `face_overlap`, `scene_overlap`, `density`, `key_term_outside`) → до `scene.maxAutoFixes`
// переотправок с перечнем (0 — без них); отказ схемы — своя одна переотправка (при maxAutoFixes ≥ 1).
// Из всех ответов берётся лучший (меньше проблем, при равенстве больше решений, дальше — более
// поздний). Остаток — сцены `proposed` с проблемами, видимыми человеку; отклонённое — в `skipped`
// с причиной «отклонено проверкой (код)».
//
// Стиль: задан пользователем — не трогается; иначе стиль из ответа агента (плохой контраст или
// неверная правка — откат к палитре пресета, событие `style_fallback`), тот же, что текущий, — без
// новой ревизии. Один план на проект: повторный запуск — следующая ревизия того же плана.
//
// Ответ агента — чекпоинт задачи (хеш входа, модели и системного промпта): повтор не платит второй
// раз. M3: задача уже опубликовала ревизию плана — завершается по ней; опубликовала только стиль —
// берёт его без новой публикации (вход агента — со стилем до публикации, как у прошлой попытки, чтобы
// сработал чекпоинт). Стиль проекта к публикации плана уже другой (пользователь сменил его между
// попытками) — событие `style_changed_during_job`, план публикуется, `plan.recheck` — в очередь.
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type JobError, PATTERN_SLUGS, type PatternSlug, type PlanIssue, type ProjectStyleBase, type ProjectStyleDoc, ProjectStyleDocSchema, type SemanticTimeline,
  SemanticTimelineSchema, type VisualPlanRevisionDoc, VisualPlanRevisionDocSchema, type VisualPlannerOutput, VisualPlannerOutputSchema, mapWords, semanticWithoutAgent,
} from "@ms/contracts";
import { canonicalJson } from "@ms/contracts/canonical";
import type { StorageStatus } from "@ms/core";
import { z } from "zod";
import { buildVisualPlannerTask, loadPrompt, oneLine } from "../agents/prompts.js";
import type { AgentRuntimeAdapter, Role } from "../agents/runtime.js";
import { type PlanBuildResult, type PlanningConfig, buildPlanItems } from "../analysis/plan-build.js";
import { planChecks } from "../analysis/plan-checks.js";
import { PLAN_FILE, publishPlanRevision, readFootage } from "../analysis/plan-ops.js";
import { PATTERN_FALLBACK, type PlannerInput, patternSummaryFromKb, plannerInput } from "../analysis/planner-input.js";
import { currentProjectStyle, planRecheckStyleKey, projectStyleFrom, saveProjectStyle } from "../analysis/project-style.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactStore, publicationsByJob } from "../artifacts/store.js";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/open.js";
import * as edls from "../db/repos/edls.js";
import * as footageRepo from "../db/repos/footage.js";
import * as jobs from "../db/repos/jobs.js";
import * as media from "../db/repos/media.js";
import * as plans from "../db/repos/plans.js";
import * as projects from "../db/repos/projects.js";
import * as semanticRepo from "../db/repos/semantic.js";
import * as styles from "../db/repos/styles.js";
import * as transcripts from "../db/repos/transcripts.js";
import { roughCutApprovalValid } from "../edit/approval-a.js";
import { RevisionConflictError } from "../edit/errors.js";
import { timelineFor } from "../edit/timeline-store.js";
import { currentTranscript } from "../edit/transcript-ops.js";
import { enqueue } from "../jobs/queue.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import type { KnowledgeAdapter } from "../knowledge/adapter.js";
import { sha256 } from "../scenes/hash.js";
import { FencedOutError, PublishCancelledError } from "../scenes/repo.js";
import { checkpointPath, readCheckpoint, stepInputHash, writeCheckpoint } from "./checkpoints.js";
import { flushAgentRuns } from "./record.js";
import { RunCtx, errText, isStorageError, toolless } from "./steps.js";

/**
 * `useAgent: false` — без Visual Planner: план без сцен, сцены добавляет человек (UI-тесты без LLM);
 * только пока в плане нет сцен (иначе отказ `plan_exists`). С агентом — разметка без агента не годится (`semantic_skipped`).
 */
export const PlanJobInputSchema = z.object({ projectId: z.string().min(1), useAgent: z.boolean().optional() }).strict();

export const PLAN_STAGES = ["prepare", "agent", "publish"] as const;
export type PlanStage = (typeof PLAN_STAGES)[number];

export interface PlanVisualDeps {
  root: string;
  config: AppConfig;
  storage: () => Promise<StorageStatus>;
  agents: AgentRuntimeAdapter;
  /** Описания паттернов из KB; нет — запасной словарь `PATTERN_FALLBACK`. */
  kb?: Pick<KnowledgeAdapter, "getVisualPatterns">;
  watchIntervalMs?: number;
  onStage?: (stage: PlanStage) => void | Promise<void>;
  log?: (line: string) => void;
  /** Системный промпт роли для хеша чекпоинта (по умолчанию `loadPrompt` — как у рантайма сервера). */
  systemPrompt?: (role: Role) => string;
}

export interface PlanStyleResult {
  style_id: string;
  revision: number;
  author: "agent" | "user";
  /** Ревизия стиля не создавалась: стиль пользователя или тот же стиль агента. */
  kept: boolean;
  /** Blocking-проблем стиля (контраст, неверные правки). */
  issues: number;
}

/** Итог задачи (`output_refs`). */
export interface PlanVisualResult {
  plan_id: string;
  revision: number;
  rel_path: string;
  /** Ревизия опубликована прошлой попыткой этой задачи (M3). */
  reused: boolean;
  counts: { items: number; skipped: number; rejected: number; blocking: number };
  style?: PlanStyleResult;
  inputs: VisualPlanRevisionDoc["inputs"];
  agent?: { status: "skipped" | "completed"; calls: number; cost_usd: number; retried: number; from_checkpoint: number };
  timings_ms?: Partial<Record<PlanStage, number>>;
}

/** Коды blocking-проблем плана, за которые отвечает агент (повод для переотправки). */
export const AGENT_FAULT_CODES = new Set(["face_overlap", "scene_overlap", "density", "key_term_outside"]);

class PlanFail extends Error {
  constructor(readonly error: JobError, readonly status: "failed" | "cancelled" | "blocked" = "failed") {
    super(error.message);
  }
}

/** `pln_<ULID задачи>`: id нового плана проекта. */
export function planIdFor(jobId: string): string {
  const m = /^job_([0-9A-Z]+)$/.exec(jobId);
  if (!m) throw new Error(`plan.visual: id задачи не в формате job_<ULID>: ${jobId}`);
  return `pln_${m[1]}`;
}

/** Ревизии плана и стиля, опубликованные задачей (M3). */
export function planPublications(db: Db, projectId: string, jobId: string): { plan?: { id: string; revision: number }; style?: { id: string; revision: number } } {
  const out: { plan?: { id: string; revision: number }; style?: { id: string; revision: number } } = {};
  const pre = `workspace/projects/${projectId}/`;
  for (const r of publicationsByJob(db, jobId)) {
    if (!r.dest_rel.startsWith(pre)) continue;
    const m = /^(plan|style)\/([A-Za-z0-9_]+)\/r([1-9][0-9]*)$/.exec(r.dest_rel.slice(pre.length));
    if (m) out[m[1] as "plan" | "style"] = { id: m[2]!, revision: Number(m[3]) };
  }
  return out;
}

/** Оценка ответа агента: сцены, проблемы и что из них по вине агента. */
interface Evaluated {
  build: PlanBuildResult;
  issues: PlanIssue[];
  faults: { what: string; code: string; message: string }[];
  decisions: number;
}

/** Перечень проблем для переотправки агенту. */
export function faultList(e: Pick<Evaluated, "faults">): string {
  return e.faults.map((f) => `- ${f.what}: ${f.code} — ${oneLine(f.message)}`).join("\n");
}

function counts(doc: VisualPlanRevisionDoc, rejected: number, skipped: number): PlanVisualResult["counts"] {
  return { items: doc.items.length, skipped, rejected, blocking: doc.issues.filter((x) => x.severity === "blocking").length };
}

const blockingOf = (issues: PlanIssue[]): number => issues.filter((x) => x.severity === "blocking").length;

export function planVisual(depsOf: (ctx: JobContext) => PlanVisualDeps): JobHandler {
  return async (ctx) => {
    const d = depsOf(ctx);
    const fail = (error: JobError, status: "failed" | "cancelled" | "blocked" = "failed"): HandlerResult => ({ status, error });
    const prep = (message: string) => fail({ code: "pipeline", stage: "prepare", message });
    const parsed = PlanJobInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return prep(`вход plan.visual не годится: ${parsed.error.message}`);
    const projectId = parsed.data.projectId;
    if (projectId !== ctx.job.project_id) return prep(`вход plan.visual: projectId ${projectId} не совпадает с проектом задачи ${ctx.job.project_id}`);
    const project = projects.get(ctx.db, projectId);
    if (!project) return prep(`проекта ${projectId} нет`);
    if (project.kind !== "video") return prep(`проект ${projectId} не видеопроект (${project.kind})`);

    const root = d.root;
    const cfg: PlanningConfig = d.config.planning;
    const paths = artifactPaths(root, projectId);
    const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
    const signal = ctx.signal;
    const timings: Partial<Record<PlanStage, number>> = {};
    let stage: PlanStage = "prepare";
    let t0 = Date.now();
    const enter = async (s: PlanStage, p: number) => {
      timings[stage] = (timings[stage] ?? 0) + (Date.now() - t0);
      stage = s;
      t0 = Date.now();
      ctx.progress(p, s);
      await d.onStage?.(s);
      signal.throwIfAborted();
    };
    const rc = new RunCtx({
      storage: d.storage, agents: d.agents, config: d.config, budgetUsd: d.config.analysis.maxCostUsd, budgetName: "анализа",
      permits: { agents: ctx.agents, renders: ctx.renders }, ...(d.watchIntervalMs ? { watchIntervalMs: d.watchIntervalMs } : {}), ...(d.log ? { log: d.log } : {}),
    }, signal, root, ctx.job.id, ctx.attempt, ctx.run.registry);

    try {
      // M3: ревизия плана этой задачи уже опубликована (попытка N упала после COMMIT)
      const pubs = planPublications(ctx.db, projectId, ctx.job.id);
      if (pubs.plan) {
        const rel = `${paths.planRev(pubs.plan.id, pubs.plan.revision)}/${PLAN_FILE}`;
        const doc = VisualPlanRevisionDocSchema.parse(JSON.parse(await readFile(join(root, rel), "utf8")));
        ctx.emit("plan_reused", `ревизия плана ${doc.plan_id} r${doc.revision} опубликована прошлой попыткой: агент не вызывается`);
        const opps = plans.opportunities(ctx.db, doc.plan_id, doc.revision);
        const st = styles.revision(ctx.db, doc.inputs.style.id, doc.inputs.style.revision);
        return done({
          plan_id: doc.plan_id, revision: doc.revision, rel_path: rel, reused: true, inputs: doc.inputs,
          counts: counts(doc, doc.skipped.length - opps.filter((x) => x.decision === "skip").length, opps.filter((x) => x.decision === "skip").length),
          ...(st ? {
            style: {
              style_id: st.style_id, revision: st.revision, author: st.author, kept: true,
              issues: blockingOf(projectStyleFrom(ProjectStyleDocSchema.parse(JSON.parse(await readFile(join(root, st.rel_path), "utf8"))).base).issues),
            },
          } : {}),
        });
      }

      // гейт A и входы — один снимок БД
      const snap = ctx.db.transaction(() => {
        if (!roughCutApprovalValid(ctx.db, projectId)) return { valid: false as const };
        const edl = edls.byProject(ctx.db, projectId);
        const edlRev = edl?.current_revision == null ? undefined : edls.revision(ctx.db, edl.id, edl.current_revision);
        return {
          valid: true as const, edl, edlRev, trRev: edl ? transcripts.get(ctx.db, edl.transcript_id)?.current_revision ?? null : null,
          sem: semanticRepo.latest(ctx.db, projectId), ftg: footageRepo.latest(ctx.db, projectId), plan: plans.byProject(ctx.db, projectId),
        };
      }).deferred();
      if (!snap.valid) {
        return fail({ code: "approval_required", message: `plan.visual: черновой монтаж проекта ${projectId} не утверждён (Approval A нет или устарело) — сначала утвердите монтаж` });
      }
      const { edl, edlRev, trRev, sem, ftg } = snap;
      if (!edl || !edlRev || trRev == null) throw new PlanFail({ code: "approval_required", message: `у проекта ${projectId} нет чернового монтажа` });
      const missing: string[] = [];
      if (!sem) missing.push("смысловой разметки нет — запустите semantic.analyze");
      else if (sem.edl_id !== edl.id || sem.edl_revision !== edlRev.revision || sem.transcript_id !== edl.transcript_id || sem.transcript_revision !== trRev) {
        missing.push(`semantic устарел: построен по EDL ${sem.edl_id} r${sem.edl_revision} и транскрипту ${sem.transcript_id} r${sem.transcript_revision}, ` +
          `текущие — EDL ${edl.id} r${edlRev.revision} и транскрипт r${trRev} — перезапустите semantic.analyze`);
      }
      if (!ftg) missing.push("анализа видеоряда нет — запустите footage.analyze");
      else if (ftg.media_id !== edl.media_id) missing.push(`анализ видеоряда ${ftg.id} сделан по другому исходнику — перезапустите footage.analyze`);
      if (missing.length > 0 || !sem || !ftg) return prep(`plan.visual: не хватает входов: ${missing.join("; ")}`);
      // ревью Task 33 I1: план без агента не стирает сцены готового плана
      if (parsed.data.useAgent === false && snap.plan?.current_revision != null && plans.scenePlans(ctx.db, snap.plan.id, snap.plan.current_revision).length > 0) {
        return fail({ code: "plan_exists", message: `plan.visual: в плане ${snap.plan.id} уже есть сцены — план без агента их бы стёр; правьте сцены вручную или постройте план с агентом` });
      }

      const status = await d.storage();
      if (!status.ok) throw new PlanFail({ code: "storage_unavailable", stage: "storage", message: `${status.reason}: ${status.detail}` });
      const tr = currentTranscript(ctx.db, root, edl.transcript_id, trRev);
      const tl = timelineFor(ctx.db, edl.id, edlRev.revision);
      const semDoc: SemanticTimeline = SemanticTimelineSchema.parse(JSON.parse(await readFile(join(root, sem.rel_path), "utf8")));
      if (parsed.data.useAgent !== false && semanticWithoutAgent(semDoc)) {
        return fail({ code: "semantic_skipped", message: "plan.visual: смысловая разметка построена без агента (пустая) — запустите смысловой анализ с агентом или стройте план без агента" });
      }
      const footage = readFootage(ctx.db, root, ftg.id);
      const style0 = currentProjectStyle(ctx.db, root, projectId);
      // M3: стиль опубликован прошлой попыткой — вход агента со стилем до него (как у той попытки: чекпоинт)
      const inputStyle = pubs.style ? styleDoc(pubs.style.id, pubs.style.revision - 1) : style0;
      const asset = media.byProject(ctx.db, projectId);
      const frame = asset ? { width: asset.probe.video.display_width, height: asset.probe.video.display_height } : { width: 1920, height: 1080 };
      const input = plannerInput(semDoc, footage, tl, tr.words, inputStyle ? { base: inputStyle.base, author: inputStyle.author } : undefined, {
        maxCoverage: cfg.maxCoverage, frame, patterns: await patterns(), faceOverlapMax: cfg.faceOverlapMax,
      });
      const wordMap = mapWords(tl, tr.words);
      const buildCtx = { words: tr.words, segments: tr.segments, tl, footage, cfg, wordMap, styleId: "sty_pending" };
      const evaluate = (o: VisualPlannerOutput): Evaluated => {
        const build = buildPlanItems(o, buildCtx);
        const issues = planChecks(build.items, { editedDurationUs: tl.duration_us, cfg, footage });
        const faults = [
          ...build.rejected.map((r) => ({ what: `возможность ${r.opp_id}`, code: r.code, message: r.message })),
          ...issues.filter((x) => x.severity === "blocking" && AGENT_FAULT_CODES.has(x.code))
            .map((x) => ({ what: x.item_id ? `сцена ${sceneOpp(build, x.item_id)}` : "план", code: x.code, message: x.message })),
        ];
        return { build, issues, faults, decisions: build.items.length + build.skipped.length };
      };
      d.log?.(`plan.visual ${projectId}: якорей ${input.anchors.length}, слов ${input.words.length}, EDL ${edl.id} r${edlRev.revision}`);

      let chosen: VisualPlannerOutput;
      let ev: Evaluated;
      let agentInfo: NonNullable<PlanVisualResult["agent"]> = { status: "skipped", calls: 0, cost_usd: 0, retried: 0, from_checkpoint: 0 };
      if (input.words.length === 0) {
        ctx.emit("nothing_to_plan", "после монтажа слов не осталось: планировать нечего");
        chosen = { style: inputStyle ? { ...inputStyle.base, rationale: inputStyle.rationale || "стиль проекта" } : { preset: "dark-premium", intensity: "balanced", depth: 1, rationale: "по умолчанию: речи нет" }, opportunities: [] };
        ev = evaluate(chosen);
      } else if (parsed.data.useAgent === false) {
        ctx.emit("agent_skipped", "агент Visual Planner не вызывался (useAgent: false): план без сцен — сцены добавляет человек");
        chosen = { style: inputStyle ? { ...inputStyle.base, rationale: inputStyle.rationale || "стиль проекта" } : { preset: "dark-premium", intensity: "balanced", depth: 1, rationale: "по умолчанию: план без агента" }, opportunities: [] };
        ev = evaluate(chosen);
      } else {
        await enter("agent", 0.1);
        const r = await runAgent(input, evaluate);
        chosen = r.output;
        ev = r.ev;
        agentInfo = { ...r.info, calls: rc.records.length, cost_usd: Math.round(rc.spent * 1e4) / 1e4 };
      }
      if (ev.faults.length > 0) {
        ctx.emit("plan_problems", `после проверки осталось проблем по вине агента: ${ev.faults.length} (${[...new Set(ev.faults.map((f) => f.code))].join(", ")}) — видны человеку`, { faults: ev.faults.slice(0, 50) });
      }

      await enter("publish", 0.9);
      // стиль проекта (перед планом: план ссылается на его ревизию)
      const style = await decideStyle(chosen.style, inputStyle, pubs.style);
      const items = ev.build.items.map((x) => ({ ...x, style_id: style.doc.style_id }));
      const oppAnchors = new Map(ev.build.opportunities.map((o) => [o.opp_id, o.anchor_ids]));
      const skipped = [
        ...ev.build.skipped,
        ...ev.build.rejected.map((r) => ({ anchor_ids: oppAnchors.get(r.opp_id) ?? [], reason: `отклонено проверкой (${r.code}): ${r.message}` })),
      ];
      const plan = plans.byProject(ctx.db, projectId);
      const cur = plan?.current_revision ?? null;
      const planId = plan?.id ?? planIdFor(ctx.job.id);
      const stRev = styles.revision(ctx.db, style.doc.style_id, style.doc.revision)!;
      const doc: VisualPlanRevisionDoc = VisualPlanRevisionDocSchema.parse({
        schema_version: 1, plan_id: planId, revision: (cur ?? 0) + 1, ...(cur !== null ? { parent_revision: cur } : {}),
        inputs: {
          edl: { id: edl.id, revision: edlRev.revision, hash: edlRev.hash }, transcript: { id: tr.transcript_id, revision: tr.revision },
          semantic_id: sem.id, footage_id: ftg.id, style: { id: stRev.style_id, revision: stRev.revision, hash: stRev.hash },
        },
        items, skipped, issues: planChecks(items, { editedDurationUs: tl.duration_us, cfg, footage }),
      });
      const store = new ArtifactStore({ root, db: ctx.db, guard: d.storage });
      await publishPlanRevision({ db: ctx.db, store, root }, projectId, doc, {
        fence, opportunities: uniqueOpps(ev.build.opportunities),
        check: (db) => {
          const now = plans.byProject(db, projectId)?.current_revision ?? null;
          return now === cur ? undefined : new RevisionConflictError(`план проекта ${projectId}`, cur ?? 0, now);
        },
        // EDL или стиль сменились за время планирования: план честно ссылается на свои ревизии, перепроверка — в очередь
        register: (db) => {
          const now = edls.get(db, edl.id)?.current_revision ?? null;
          if (now !== null && now !== edlRev.revision) {
            enqueue(db, { type: "plan.recheck", projectId, input: { projectId }, idempotencyKey: `plan.recheck:${edl.id}@r${now}` });
          }
          const st = styles.byProject(db, projectId);
          if (st?.current_revision != null && (st.id !== doc.inputs.style.id || st.current_revision !== doc.inputs.style.revision)) {
            enqueue(db, { type: "plan.recheck", projectId, input: { projectId }, idempotencyKey: planRecheckStyleKey(st.id, st.current_revision) });
          }
        },
      });
      const nowEdl = edls.get(ctx.db, edl.id)?.current_revision ?? null;
      if (nowEdl !== edlRev.revision) ctx.emit("edl_changed", `EDL ${edl.id} за время планирования стал r${nowEdl}: план построен по r${edlRev.revision}, перепроверка поставлена`);
      timings.publish = (timings.publish ?? 0) + (Date.now() - t0);
      const relPath = `${paths.planRev(planId, doc.revision)}/${PLAN_FILE}`;
      const res: PlanVisualResult = {
        plan_id: planId, revision: doc.revision, rel_path: relPath, reused: false, inputs: doc.inputs,
        counts: counts(doc, ev.build.rejected.length, ev.build.skipped.length),
        style: { style_id: style.doc.style_id, revision: style.doc.revision, author: style.doc.author, kept: style.kept, issues: blockingOf(projectStyleFrom(style.doc.base).issues) },
        agent: agentInfo, timings_ms: timings,
      };
      d.log?.(`plan.visual ${planId} r${doc.revision}: сцен ${res.counts.items}, пропусков ${res.counts.skipped}, отклонено ${res.counts.rejected}, blocking ${res.counts.blocking}, $${agentInfo.cost_usd}`);
      return done(res);
    } catch (e) {
      return await failed(e);
    } finally {
      // S17b: прогоны агентов — при любом исходе, в том числе неудачные
      flushAgentRuns(ctx, rc.records);
    }

    /** Описания паттернов: KB (первый абзац), иначе запасной словарь. */
    async function patterns(): Promise<{ slug: PatternSlug; summary: string }[]> {
      const out: { slug: PatternSlug; summary: string }[] = [];
      for (const slug of PATTERN_SLUGS) {
        let summary: string | undefined;
        if (d.kb) {
          try {
            summary = patternSummaryFromKb(await d.kb.getVisualPatterns(slug));
          } catch {
            summary = undefined;
          }
        }
        out.push({ slug, summary: summary ?? PATTERN_FALLBACK[slug] });
      }
      return out;
    }

    /**
     * Visual Planner: вызов → проверка кодом → (проблемы по вине агента — до `maxAutoFixes`
     * переотправок с перечнем) → лучший из всех ответов; отказ схемы — одна переотправка с ошибкой
     * на весь запуск. Чекпоинт задачи — выбранный ответ.
     */
    async function runAgent(input: PlannerInput, evaluate: (o: VisualPlannerOutput) => Evaluated): Promise<{
      output: VisualPlannerOutput; ev: Evaluated; info: NonNullable<PlanVisualResult["agent"]>;
    }> {
      const label = "Visual Planner";
      const role = "visual_planner" as const;
      const fixes = Math.max(0, Math.floor(d.config.scene.maxAutoFixes));
      let schemaRetries = fixes >= 1 ? 1 : 0;
      const info: NonNullable<PlanVisualResult["agent"]> = { status: "completed", calls: 0, cost_usd: 0, retried: 0, from_checkpoint: 0 };
      const make = (workdir: string, seq: number) => buildVisualPlannerTask({ ...input, workdir }, { ...rc.taskRun, seq });
      const promptSha = sha256((d.systemPrompt ?? loadPrompt)(role));
      const probe = make("", 1);
      const hash = stepInputHash(role, probe.model, { input: probe.input, system_prompt_sha256: promptSha });
      const saved = await readCheckpoint(checkpointPath(root, ctx.job.id, role), hash);
      const fromCp = saved === undefined ? undefined : VisualPlannerOutputSchema.safeParse(saved);
      if (fromCp?.success) {
        info.from_checkpoint = 1;
        ctx.emit("agent_checkpoint", `${label}: ответ из чекпоинта прошлой попытки — агент не вызывался`);
        return { output: fromCp.data, ev: evaluate(fromCp.data), info };
      }
      const fatal = (r: { stage: string; message: string }): never => {
        if (r.stage === "storage") throw new PlanFail({ code: "storage_unavailable", stage: "storage", message: r.message });
        if (r.stage === "orphaned") throw new PlanFail({ code: "stale_process", stage: "orphaned", message: r.message }, "blocked");
        if (r.stage === "cancelled" || signal.aborted) throw new DOMException(r.message, "AbortError");
        if (r.stage === "budget") throw new PlanFail({ code: "budget", stage: "budget", message: r.message });
        throw new PlanFail({ code: "pipeline", message: `${label}: ${r.message}` });
      };
      let seq = 0;
      /** Один вызов с дополнением задачи; отказ схемы — переотправка, пока не израсходована. */
      const call = async (extra: string) => {
        let why: string | undefined;
        for (;;) {
          const k = ++seq;
          const note = why;
          const r = await toolless(rc, role, "prepare", label, (workdir) => {
            const t = make(workdir, k);
            t.input += extra;
            if (note !== undefined) t.input += `\n\n# Прошлый ответ отклонён\n\n${oneLine(note).slice(0, 2000)}\n\nОтветь заново строго по схеме.`;
            return t;
          }, VisualPlannerOutputSchema);
          if (r.ok || r.kind !== "schema" || schemaRetries <= 0) return r;
          schemaRetries--;
          info.retried++;
          why = r.message;
          ctx.emit("agent_retry", `${label}: ответ не прошёл схему — переотправка (одна): ${r.message.slice(0, 500)}`);
        }
      };
      const first = await call("");
      if (!first.ok) fatal(first);
      const answers: { output: VisualPlannerOutput; ev: Evaluated }[] = [];
      const firstOut = (first as { output: VisualPlannerOutput }).output;
      answers.push({ output: firstOut, ev: evaluate(firstOut) });
      let best = 0;
      for (let round = 1; round <= fixes; round++) {
        const last = answers[answers.length - 1]!;
        if (last.ev.faults.length === 0) break;
        info.retried++;
        const list = faultList(last.ev);
        ctx.emit("agent_retry", `${label}: проблем по вине агента ${last.ev.faults.length} — переотправка ${round} из ${fixes} с перечнем`, { faults: last.ev.faults.slice(0, 50) });
        const r = await call(`\n\n# Прошлый ответ: проблемы проверки\n\n${list.slice(0, 6000)}\n\n` +
          "Ответь заново полностью (стиль и все возможности): исправь перечисленное — цитаты дословно по id слов, зона не на лице " +
          "(другая свободная зона, split_screen или skip; закрыть лицо — только с face_override_reason), сцены не пересекаются, " +
          "покрытие в пределе, ключевые слова внутри сцены. Остальное повтори как было.");
        if (!r.ok) {
          if (["storage", "orphaned", "cancelled"].includes(r.stage) || signal.aborted) fatal(r);
          ctx.emit("agent_retry_failed", `${label}: переотправка ${round} не удалась (${r.message.slice(0, 300)}) — остаётся лучший из полученных ответов`);
          break;
        }
        const next = { output: r.output, ev: evaluate(r.output) };
        answers.push(next);
        const b = answers[best]!;
        if (next.ev.faults.length < b.ev.faults.length || (next.ev.faults.length === b.ev.faults.length && next.ev.decisions >= b.ev.decisions)) {
          best = answers.length - 1;
        } else {
          ctx.emit("agent_retry_kept_first", `${label}: ответ ${answers.length} хуже (проблем ${next.ev.faults.length}, решений ${next.ev.decisions}) — остаётся ответ ${best + 1} (проблем ${b.ev.faults.length}, решений ${b.ev.decisions})`);
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
     * Стиль проекта для ревизии плана: пользователя — как есть; опубликованный этой задачей (M3) —
     * он; иначе — из ответа агента (blocking-проблемы — откат к палитре и шрифту пресета), тот же,
     * что текущий стиль агента, — без новой ревизии.
     */
    async function decideStyle(
      agent: VisualPlannerOutput["style"], current: ProjectStyleDoc | undefined, published: { id: string; revision: number } | undefined,
    ): Promise<{ doc: ProjectStyleDoc; kept: boolean }> {
      if (published) {
        const now = styles.byProject(ctx.db, projectId);
        if (now && (now.id !== published.id || now.current_revision !== published.revision)) {
          ctx.emit("style_changed_during_job", `стиль проекта сменился после публикации прошлой попыткой (${published.id} r${published.revision} → ` +
            `${now.id} r${now.current_revision ?? "—"}): план строится по опубликованному, перепроверка перенесёт его на текущий`);
        }
        return { doc: styleDoc(published.id, published.revision)!, kept: false };
      }
      if (current?.author === "user") {
        ctx.emit("style_kept", `стиль проекта задан пользователем (${current.style_id} r${current.revision}) — агент его не меняет`);
        return { doc: current, kept: true };
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
      if (current && canonicalJson(current.base) === canonicalJson(base)) return { doc: current, kept: true };
      const doc = await saveProjectStyle({ db: ctx.db, store: new ArtifactStore({ root, db: ctx.db, guard: d.storage }), root }, projectId, base, "agent", {
        rationale: agent.rationale, fence, ...(current ? { base_revision: current.revision } : {}),
      });
      return { doc, kept: false };
    }

    /** Документ ревизии стиля; ревизии нет (0 или не найдена) — `undefined`. */
    function styleDoc(id: string, revision: number): ProjectStyleDoc | undefined {
      const rev = revision > 0 ? styles.revision(ctx.db, id, revision) : undefined;
      return rev ? ProjectStyleDocSchema.parse(JSON.parse(readFileSync(join(root, rev.rel_path), "utf8"))) : undefined;
    }

    function done(r: PlanVisualResult): HandlerResult {
      ctx.progress(1, "done");
      return { status: "completed", outputRefs: r };
    }

    async function failed(e: unknown): Promise<HandlerResult> {
      return planFailure(e, { ctx, stage, storage: d.storage, what: "визуальный план" });
    }
  };
}

/** Возможность агента, из которой получилась сцена (для перечня проблем). */
function sceneOpp(b: PlanBuildResult, itemId: string): string {
  const item = b.items.find((x) => x.id === itemId);
  if (!item) return itemId;
  const opp = b.opportunities.find((o) => o.decision === "plan" && o.anchor_ids.join() === item.anchor_ids.join());
  return `${itemId} (слова ${item.start_word_id}–${item.end_word_id}${opp ? `, возможность ${opp.opp_id}` : ""})`;
}

/** id возможностей уникальны в индексе ревизии: повтор id агента — с суффиксом. */
function uniqueOpps(os: PlanBuildResult["opportunities"]): PlanBuildResult["opportunities"] {
  const seen = new Map<string, number>();
  return os.map((o) => {
    const n = (seen.get(o.opp_id) ?? 0) + 1;
    seen.set(o.opp_id, n);
    return n === 1 ? o : { ...o, opp_id: `${o.opp_id}-${n}` };
  });
}

/** Ошибка попытки → итог задачи (общая для `plan.visual` и `plan.recheck`). */
export async function planFailure(
  e: unknown, o: { ctx: JobContext; stage: string; storage: () => Promise<StorageStatus>; what: string },
): Promise<HandlerResult> {
  const { ctx, stage } = o;
  const fail = (error: JobError, status: "failed" | "cancelled" | "blocked" = "failed"): HandlerResult => ({ status, error });
  const msg = errText(e);
  if (e instanceof FencedOutError) return fail({ code: "fenced_out", stage: "fenced_out", message: msg });
  if (e instanceof PublishCancelledError) return fail({ code: "cancelled", stage: "cancelled", message: msg }, "cancelled");
  if (e instanceof PlanFail) return fail(e.error, e.status);
  if (ctx.signal.aborted || (e instanceof Error && e.name === "AbortError")) {
    if (jobs.get(ctx.db, ctx.job.id)?.cancel_requested === true) return fail({ code: "cancelled", stage: "cancelled", message: `${o.what}: отменено на этапе ${stage}` }, "cancelled");
    return fail({ code: "interrupted", stage: "interrupted", message: `попытка прервана на этапе ${stage}` });
  }
  if (isStorageError(e)) return fail({ code: "storage_unavailable", stage: "storage", message: msg });
  const now = await o.storage().catch(() => undefined);
  if (!now || !now.ok) return fail({ code: "storage_unavailable", stage: "storage", message: `${now ? `${now.reason}: ${now.detail}; ` : ""}${stage}: ${msg}` });
  if (stage === "publish") return fail({ code: "pipeline", stage: "publish", message: msg });
  return fail({ code: "pipeline", message: `${stage}: ${msg}` });
}

