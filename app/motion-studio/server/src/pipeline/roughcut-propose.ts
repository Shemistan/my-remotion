// Обработчик `roughcut.propose` (Task 28): черновой монтаж проекта. Шаги: вход → исходник,
// транскрипт (текущая ревизия) и waveform → детекторы-код (паузы, паразиты, повторы) → агент
// Rough Cut Editor (по умолчанию; без инструментов, вход — только id и текст слов и длины пауз;
// бюджет `analysis.maxCostUsd`; ответ не прошёл схему — одна переотправка) → проверка цитат и
// границы вырезок агента кодом → слияние → ревизия EDL с fencing → Approval A `stale`, если был.
//
// Один EDL на проект (ревью Task 27, M6): первый запуск создаёт `edl_<ULID задачи>` r1, повторный —
// новую ревизию того же EDL: решения пользователя и вырезки, по которым человек уже решил,
// сохраняются, отклонённое не воскресает (`carryOver`). Ничего не изменилось — `no_change`,
// ревизии нет. Агент — не обязателен: отказ, бюджет, невалидный ответ после переотправки → событие,
// предложения детекторов всё равно публикуются.
//
// Повтор после сбоя (ревью Task 24, M3): ревизия, опубликованная этой задачей
// (`artifact_publications.job_id`), — задача завершается по ней без детекторов и агента.
// Ответ агента — чекпоинт задачи по хешу первого входа (и после переотправки): повтор попытки не
// платит за него второй раз.
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  type EditDecision, type EdlRevisionDoc, EdlRevisionDocSchema, type JobError, type RoughCutAgentOutput, RoughCutAgentOutputSchema,
  acceptedCuts, buildTimeline,
} from "@ms/contracts";
import type { StorageStatus } from "@ms/core";
import { z } from "zod";
import { buildRoughCutTask, type RoughCutWord } from "../agents/prompts.js";
import type { AgentRuntimeAdapter } from "../agents/runtime.js";
import { createJobDraft } from "../artifacts/job-draft.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactStore } from "../artifacts/store.js";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/open.js";
import * as edls from "../db/repos/edls.js";
import * as jobs from "../db/repos/jobs.js";
import * as media from "../db/repos/media.js";
import * as projects from "../db/repos/projects.js";
import * as transcripts from "../db/repos/transcripts.js";
import { agentDecisionToCut } from "../edit/agent-cuts.js";
import { detectFillers } from "../edit/detect-fillers.js";
import { detectPauses } from "../edit/detect-pauses.js";
import { detectRepeats } from "../edit/detect-repeats.js";
import { EDL_FILE, currentEdl, edlContent, registerEdlRevision } from "../edit/edl-ops.js";
import { proposeOver } from "../edit/merge.js";
import { currentTranscript } from "../edit/transcript-ops.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import { WAVEFORM_BUCKET_MS } from "../media/waveform.js";
import { FencedOutError, PublishCancelledError } from "../scenes/repo.js";
import { QUARANTINE, fsyncWrite, setWritable } from "../scenes/store.js";
import { stepInputHash, writeCheckpoint } from "./checkpoints.js";
import { RunCtx, errText, isStorageError, toolless } from "./steps.js";

export const RoughcutProposeInputSchema = z.object({
  projectId: z.string().min(1),
  useAgent: z.boolean().optional(),
}).strict();
export type RoughcutProposeInput = z.infer<typeof RoughcutProposeInputSchema>;

export const ROUGHCUT_STAGES = ["prepare", "detect", "agent", "publish"] as const;
export type RoughcutStage = (typeof ROUGHCUT_STAGES)[number];

export interface RoughcutProposeDeps {
  root: string;
  config: AppConfig;
  storage: () => Promise<StorageStatus>;
  agents: AgentRuntimeAdapter;
  watchIntervalMs?: number;
  onStage?: (stage: RoughcutStage) => void | Promise<void>;
  log?: (line: string) => void;
}

/** Вырезка агента, отклонённая кодом. */
export interface RejectedAgentCut {
  start_word_id: string;
  end_word_id: string;
  quote: string;
  code: string;
}

/** Итог задачи (`output_refs`). */
export interface RoughcutProposeResult {
  edl_id: string;
  revision: number;
  rel_path: string;
  /** Ревизия опубликована прошлой попыткой этой задачи (M3). */
  reused: boolean;
  /** Повторный propose ничего не изменил: новой ревизии нет, `revision` — текущая. */
  no_change: boolean;
  decisions: { total: number; proposed: number; by_reason: Record<string, number> };
  detector?: { pause: number; filler: number; repeat: number };
  agent?: {
    status: "skipped" | "completed" | "failed" | "budget";
    message?: string;
    calls: number;
    cost_usd: number;
    decisions: number;
    accepted: number;
    rejected: RejectedAgentCut[];
    reviews: number;
    unknown_reviews: string[];
    retried: boolean;
  };
  /** Новые предложения, не добавленные: место уже решено человеком. */
  suppressed?: number;
  timings_ms?: Partial<Record<RoughcutStage, number>>;
}

class RoughcutFail extends Error {
  constructor(readonly error: JobError, readonly status: "failed" | "cancelled" | "blocked" = "failed") {
    super(error.message);
  }
}

/** `edl_<ULID задачи>`: первая ревизия EDL проекта. */
export function edlIdFor(jobId: string): string {
  const m = /^job_([0-9A-Z]+)$/.exec(jobId);
  if (!m) throw new Error(`roughcut.propose: id задачи не в формате job_<ULID>: ${jobId}`);
  return `edl_${m[1]}`;
}

/** Ревизия EDL, опубликованная задачей `jobId` (M3): `edits/<edl>/r<N>` из `artifact_publications`. */
export function publishedByJob(db: Db, projectId: string, jobId: string): { edlId: string; revision: number; destRel: string } | undefined {
  const rows = db.prepare("SELECT dest_rel FROM artifact_publications WHERE job_id = ? ORDER BY published_at DESC").all(jobId) as { dest_rel: string }[];
  for (const r of rows) {
    const m = new RegExp(`^workspace/projects/${projectId}/edits/([A-Za-z0-9_]+)/r([1-9][0-9]*)$`).exec(r.dest_rel);
    if (m) return { edlId: m[1]!, revision: Number(m[2]), destRel: r.dest_rel };
  }
  return undefined;
}

/** Те же решения (порядок не важен: правка пользователя дописывает в конец, propose сортирует) и поля. */
function sameContent(a: EdlRevisionDoc, b: EdlRevisionDoc): boolean {
  const byId = (d: EdlRevisionDoc): EdlRevisionDoc => ({ ...d, decisions: [...d.decisions].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)) });
  return edlContent(byId(a)) === edlContent(byId(b));
}

function summary(doc: EdlRevisionDoc): RoughcutProposeResult["decisions"] {
  const by: Record<string, number> = {};
  for (const d of doc.decisions) by[d.reason] = (by[d.reason] ?? 0) + 1;
  return { total: doc.decisions.length, proposed: doc.decisions.filter((d) => d.status === "proposed").length, by_reason: by };
}

/** Peaks waveform исходника (пары min/max Int8 на 10 мс); нет звука — пусто. */
async function readPeaks(root: string, relPath: string | undefined): Promise<Int8Array> {
  if (!relPath) return new Int8Array(0);
  const buf = await readFile(join(root, relPath));
  return new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function roughcutPropose(depsOf: (ctx: JobContext) => RoughcutProposeDeps): JobHandler {
  return async (ctx) => {
    const d = depsOf(ctx);
    const fail = (error: JobError, status: "failed" | "cancelled" | "blocked" = "failed"): HandlerResult => ({ status, error });
    const prep = (message: string) => fail({ code: "pipeline", stage: "prepare", message });
    const parsed = RoughcutProposeInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return prep(`вход roughcut.propose не годится: ${parsed.error.message}`);
    const input = parsed.data;
    if (input.projectId !== ctx.job.project_id) return prep(`вход roughcut.propose: projectId ${input.projectId} не совпадает с проектом задачи ${ctx.job.project_id}`);
    const project = projects.get(ctx.db, input.projectId);
    if (!project) return prep(`проекта ${input.projectId} нет`);
    if (project.kind !== "video") return prep(`проект ${input.projectId} не видеопроект (${project.kind})`);

    const root = d.root;
    const cfg = d.config.roughcut;
    const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
    const signal = ctx.signal;
    const timings: Partial<Record<RoughcutStage, number>> = {};
    let stage: RoughcutStage = "prepare";
    let t0 = Date.now();
    const enter = async (s: RoughcutStage, p: number) => {
      timings[stage] = (timings[stage] ?? 0) + (Date.now() - t0);
      stage = s;
      t0 = Date.now();
      ctx.progress(p, s);
      await d.onStage?.(s);
      signal.throwIfAborted();
    };
    let draftDir: string | undefined;
    const rc = new RunCtx({
      storage: d.storage, agents: d.agents, config: d.config, budgetUsd: d.config.analysis.maxCostUsd, budgetName: "анализа",
      permits: { agents: ctx.agents, renders: ctx.renders }, ...(d.watchIntervalMs ? { watchIntervalMs: d.watchIntervalMs } : {}), ...(d.log ? { log: d.log } : {}),
    }, signal, root, ctx.job.id, ctx.attempt, ctx.run.registry);

    try {
      // M3: ревизия этой задачи уже опубликована (попытка N упала после COMMIT)
      const prev = publishedByJob(ctx.db, input.projectId, ctx.job.id);
      if (prev) {
        const doc = currentEdl(ctx.db, root, prev.edlId, prev.revision);
        ctx.emit("edl_reused", `ревизия EDL r${prev.revision} опубликована прошлой попыткой: детекторы и агент не запускаются`);
        return done({ edl_id: prev.edlId, revision: prev.revision, rel_path: `${prev.destRel}/${EDL_FILE}`, reused: true, no_change: false, decisions: summary(doc) });
      }

      const asset = media.byProject(ctx.db, input.projectId);
      if (!asset) throw new RoughcutFail({ code: "pipeline", stage: "prepare", message: `у проекта ${input.projectId} нет исходника — сначала импорт` });
      const existing = edls.byProject(ctx.db, input.projectId);
      const transcriptId = existing?.transcript_id ?? transcripts.byProject(ctx.db, input.projectId)?.id;
      if (!transcriptId) throw new RoughcutFail({ code: "pipeline", stage: "prepare", message: `у проекта ${input.projectId} нет транскрипта — сначала распознавание речи` });
      const latest = transcripts.byProject(ctx.db, input.projectId);
      if (existing && latest && latest.id !== existing.transcript_id) {
        ctx.emit("transcript_mismatch", `черновой монтаж привязан к транскрипту ${existing.transcript_id}, а последний транскрипт проекта — ${latest.id}: вырезки считаются по транскрипту монтажа`);
      }
      const status = await d.storage();
      if (!status.ok) throw new RoughcutFail({ code: "storage_unavailable", stage: "storage", message: `${status.reason}: ${status.detail}` });
      const tr = currentTranscript(ctx.db, root, transcriptId);
      const base = existing && existing.current_revision !== null ? currentEdl(ctx.db, root, existing.id) : undefined;
      const edlId = existing?.id ?? edlIdFor(ctx.job.id);
      const revision = (base?.revision ?? 0) + 1;
      const fps = asset.probe.timeline_fps;
      const durationUs = asset.probe.duration_us;
      const words = tr.words;

      await enter("detect", 0.05);
      const wf = media.derivatives(ctx.db, asset.id).find((x) => x.kind === "waveform");
      const peaks = await readPeaks(root, wf?.rel_path);
      const bucketMs = typeof wf?.params.bucket_ms === "number" ? wf.params.bucket_ms : WAVEFORM_BUCKET_MS;
      const pauses = detectPauses(words, peaks, cfg, fps, { sourceDurationUs: durationUs, bucketMs, idPrefix: `pau_r${revision}_` });
      const fillers = detectFillers(words, cfg, fps, { sourceDurationUs: durationUs, idPrefix: `fil_r${revision}_` });
      const repeats = detectRepeats(words, fps, { idPrefix: `rep_r${revision}_` });
      const detector = [...pauses, ...fillers, ...repeats].sort((a, b) => a.source_start_us - b.source_start_us);
      d.log?.(`roughcut ${edlId}: ${words.length} слов; паузы ${pauses.length}, паразиты ${fillers.length}, повторы ${repeats.length}`);

      let agentOut: RoughCutAgentOutput = { decisions: [], reviews: [] };
      const agentCuts: EditDecision[] = [];
      const rejected: RejectedAgentCut[] = [];
      let agentInfo: NonNullable<RoughcutProposeResult["agent"]> = {
        status: "skipped", calls: 0, cost_usd: 0, decisions: 0, accepted: 0, rejected, reviews: 0, unknown_reviews: [], retried: false,
      };
      if (input.useAgent === false) {
        ctx.emit("agent_skipped", "агент Rough Cut Editor не вызывался (useAgent: false): только детекторы");
      } else if (words.length === 0) {
        ctx.emit("agent_skipped", "в транскрипте нет слов: агенту нечего предлагать");
      } else {
        await enter("agent", 0.1);
        const agentWords: RoughCutWord[] = words.map((w, i) => ({
          id: w.id, text: w.text, start_us: w.start_us, end_us: w.end_us,
          gap_after_us: Math.max(0, (words[i + 1]?.start_us ?? durationUs) - w.end_us),
        }));
        const taskInput = { segments: tr.segments, words: agentWords, detector };
        const label = "Rough Cut Editor";
        // чекпоинт — по хешу ПЕРВОГО входа (без текста ошибки переотправки): ответ, полученный и после
        // переотправки, следующая попытка находит по тому же хешу и агента не зовёт (ревью Task 28, M3)
        const first = buildRoughCutTask({ ...taskInput, workdir: "" }, rc.taskRun);
        const cpHash = stepInputHash("rough_cut_editor", first.model, first.input);
        let r = await toolless(rc, "rough_cut_editor", "prepare", label, (workdir) => buildRoughCutTask({ ...taskInput, workdir }, rc.taskRun), RoughCutAgentOutputSchema, { jobId: ctx.job.id, save: false });
        if (r.ok && r.reused) ctx.emit("agent_checkpoint", `${label}: ответ из чекпоинта прошлой попытки — агент не вызывался`);
        if (!r.ok && r.kind === "schema") {
          // одна переотправка: ответ не прошёл схему
          agentInfo.retried = true;
          ctx.emit("agent_retry", `${label}: ответ не прошёл схему — переотправка (одна): ${r.message.slice(0, 500)}`);
          const why = r.message;
          r = await toolless(rc, "rough_cut_editor", "prepare", label, (workdir) => {
            const t = buildRoughCutTask({ ...taskInput, workdir }, { ...rc.taskRun, seq: 2 });
            t.input += `\n\n# Прошлый ответ отклонён\n\n${why.slice(0, 2000)}\n\nОтветь заново строго по схеме: только поля decisions и reviews.`;
            return t;
          }, RoughCutAgentOutputSchema);
        }
        if (r.ok && !r.reused) {
          try {
            await writeCheckpoint(root, ctx.job.id, "rough_cut_editor", { input_hash: cpHash, output: r.output });
          } catch (e) {
            ctx.emit("checkpoint_failed", `${label}: чекпоинт не записан: ${errText(e)}`);
          }
        }
        agentInfo = { ...agentInfo, calls: rc.records.length, cost_usd: Math.round(rc.spent * 1e4) / 1e4 };
        if (r.ok) {
          agentOut = r.output;
          agentInfo.status = "completed";
          agentInfo.decisions = agentOut.decisions.length;
          agentInfo.reviews = agentOut.reviews.length;
          agentOut.decisions.forEach((x, k) => {
            const cut = agentDecisionToCut(x, words, cfg, fps, { id: `agt_r${revision}_${k + 1}`, sourceDurationUs: durationUs });
            if ("rejected" in cut) {
              rejected.push({ start_word_id: x.start_word_id, end_word_id: x.end_word_id, quote: x.quote, code: cut.rejected });
              ctx.emit("agent_cut_rejected", `вырезка агента ${x.start_word_id}…${x.end_word_id} отклонена: ${cut.rejected}`, { ...x, code: cut.rejected });
            } else {
              agentCuts.push(cut);
            }
          });
          agentInfo.accepted = agentCuts.length;
        } else if (r.stage === "storage") {
          throw new RoughcutFail({ code: "storage_unavailable", stage: "storage", message: r.message });
        } else if (r.stage === "orphaned") {
          throw new RoughcutFail({ code: "stale_process", stage: "orphaned", message: r.message }, "blocked");
        } else if (r.stage === "cancelled" || signal.aborted) {
          throw new DOMException(r.message, "AbortError");
        } else if (r.stage === "budget") {
          agentInfo = { ...agentInfo, status: "budget", message: r.message };
          ctx.emit("budget", `${r.message}: предложены только вырезки детекторов`);
        } else {
          agentInfo = { ...agentInfo, status: "failed", message: r.message };
          ctx.emit("agent_failed", `${r.message}: предложены только вырезки детекторов`);
        }
      }

      // кандидаты в решённом человеком месте подавляются до слияния (ревью Task 28, M5)
      const { decisions, suppressed, unknownReviews: unknown } = proposeOver(base?.decisions ?? [], detector, agentOut, agentCuts, { words, fps });
      if (unknown.length > 0) ctx.emit("agent_unknown_reviews", `вердикты агента по несуществующим вырезкам пропущены: ${unknown.join(", ")}`);
      agentInfo.unknown_reviews = unknown;
      if (suppressed.length > 0) ctx.emit("proposals_suppressed", `${suppressed.length} новых предложений не добавлено: место уже решено человеком`);
      const doc = EdlRevisionDocSchema.parse({
        schema_version: 1, edl_id: edlId, revision, ...(base ? { parent_revision: base.revision } : {}),
        media_id: asset.id, media_sha256: asset.sha256, transcript_id: transcriptId, timeline_fps: fps, decisions,
      });
      const detectorCounts = { pause: pauses.length, filler: fillers.length, repeat: repeats.length };
      if (base && sameContent(doc, base)) {
        ctx.emit("no_change", `черновой монтаж не изменился: остаётся r${base.revision}`);
        const row = edls.revision(ctx.db, edlId, base.revision)!;
        return done({
          edl_id: edlId, revision: base.revision, rel_path: row.rel_path, reused: false, no_change: true, decisions: summary(base),
          detector: detectorCounts, agent: agentInfo, suppressed: suppressed.length, timings_ms: timings,
        });
      }

      await enter("publish", 0.9);
      const timeline = buildTimeline(durationUs, acceptedCuts(doc), fps);
      const destRel = artifactPaths(root, input.projectId).edlRev(edlId, revision);
      draftDir = (await createJobDraft(root, { runId: fence.jobId, attempt: fence.attempt })).dir;
      await fsyncWrite(join(draftDir, EDL_FILE), JSON.stringify(doc, null, 2) + "\n");
      await fsyncWrite(join(draftDir, "roughcut.json"), JSON.stringify({ detector: detectorCounts, agent: agentInfo, suppressed: suppressed.map((x) => x.id) }, null, 2) + "\n");
      const store = new ArtifactStore({ root, db: ctx.db, guard: d.storage });
      await store.publish(draftDir, destRel, (db, files) => {
        const f = files.find((x) => x.path === EDL_FILE);
        if (!f) throw new Error(`публикация без ${EDL_FILE}`);
        const cur = edls.get(db, edlId);
        if (!cur) edls.create(db, { id: edlId, project_id: input.projectId, media_id: asset.id, transcript_id: transcriptId });
        else if (cur.current_revision !== (base?.revision ?? null)) {
          throw new Error(`revision_conflict: EDL ${edlId} — предложение от r${base?.revision ?? "—"}, текущая r${cur.current_revision ?? "—"}`);
        }
        registerEdlRevision(db, { projectId: input.projectId, doc, relPath: `${destRel}/${EDL_FILE}`, sha256: f.sha256, timeline });
      }, fence);
      timings.publish = (timings.publish ?? 0) + (Date.now() - t0);
      d.log?.(`roughcut ${edlId}: r${revision}, решений ${doc.decisions.length} (предложено ${summary(doc).proposed}), агент ${agentInfo.status} $${agentInfo.cost_usd}`);
      return done({
        edl_id: edlId, revision, rel_path: `${destRel}/${EDL_FILE}`, reused: false, no_change: false, decisions: summary(doc),
        detector: detectorCounts, agent: agentInfo, suppressed: suppressed.length, timings_ms: timings,
      });
    } catch (e) {
      return await failed(e);
    }

    function done(r: RoughcutProposeResult): HandlerResult {
      ctx.progress(1, "done");
      return { status: "completed", outputRefs: r };
    }

    async function failed(e: unknown): Promise<HandlerResult> {
      const msg = errText(e);
      const cancelled = () => jobs.get(ctx.db, ctx.job.id)?.cancel_requested === true;
      if (e instanceof FencedOutError) return fail({ code: "fenced_out", stage: "fenced_out", message: msg });
      if (e instanceof PublishCancelledError) return fail({ code: "cancelled", stage: "cancelled", message: msg }, "cancelled");
      if (draftDir && existsSync(draftDir) && !existsSync(join(draftDir, QUARANTINE))) {
        await setWritable(draftDir).catch(() => undefined);
        await rm(draftDir, { recursive: true, force: true }).catch(() => undefined);
      }
      if (e instanceof RoughcutFail) return fail(e.error, e.status);
      if (signal.aborted || (e instanceof Error && e.name === "AbortError")) {
        if (cancelled()) return fail({ code: "cancelled", stage: "cancelled", message: `черновой монтаж отменён на этапе ${stage}` }, "cancelled");
        return fail({ code: "interrupted", stage: "interrupted", message: `попытка прервана на этапе ${stage}` });
      }
      if (isStorageError(e)) return fail({ code: "storage_unavailable", stage: "storage", message: msg });
      const now = await d.storage().catch(() => undefined);
      if (!now || !now.ok) return fail({ code: "storage_unavailable", stage: "storage", message: `${now ? `${now.reason}: ${now.detail}; ` : ""}${stage}: ${msg}` });
      if (stage === "publish") return fail({ code: "pipeline", stage: "publish", message: msg });
      return fail({ code: "pipeline", message: `${stage}: ${msg}` });
    }
  };
}
