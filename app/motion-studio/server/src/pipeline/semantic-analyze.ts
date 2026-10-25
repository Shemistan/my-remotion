// Обработчик `semantic.analyze` (Task 31): смысловая разметка смонтированной речи. Шаги: вход →
// гейт Approval A (нет валидного — `failed approval_required`, агент не зовётся) → текущая ревизия
// EDL проекта и его транскрипта → оставленные слова (`semanticInput`) → окна (до 6000 слов —
// одно; длиннее — по 3000 с перекрытием 300) → Semantic Director на окно (без инструментов,
// бюджет `analysis.maxCostUsd`) → проверка кодом (`validateSemantic`) → объединение окон
// (`mergeWindows`) → `analysis/semantic/<id>/semantic.json` с fencing.
//
// Переотправка — одна на окно и только если `scene.maxAutoFixes ≥ 1`: при отказе схемы — с текстом
// ошибки, при отклонённых кодом предложениях — с их перечнем. Второй ответ заменяет первый целиком;
// оставшиеся отклонённые — в `semantic.json.rejected` и событии `semantic_rejected`. Отказ агента
// (не схема) или бюджет — задача падает. `useAgent: false` — пустая разметка без агента с отметкой
// `agent: "skipped"` (UI-тесты без LLM, Task 33; план с агентом по ней не строится). Ответы окон — чекпоинт задачи
// (хеш всего входа → ответы по хешам окон): повтор не платит за готовые окна.
//
// Повтор после сбоя (ревью Task 24, M3): id — `sem_<ULID задачи>`; опубликован прошлой попыткой —
// задача завершается по нему без агента.
//
// Ревью Task 31: из двух ответов окна берётся лучший — меньше отклонённого, при равенстве больше
// принятого (m5); хеш чекпоинта включает модель и sha256 системного промпта роли (m6); гейт A и
// ревизии EDL и транскрипта читаются одной транзакцией, при публикации сверяются с текущими —
// изменились: события `edl_changed`/`transcript_changed` и `stale_on_publish: true` в итоге (m4).
// Разметка всё равно публикуется со ссылками на ревизии, по которым построена; потребители
// (`plan.visual`, UI) берут её только при равенстве ссылок текущим ревизиям и валидном A.
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  type JobError, type SemanticAgentOutput, SemanticAgentOutputSchema, type SemanticRejected, type SemanticTimeline, SemanticTimelineSchema, type TranscriptWord, mapWords,
} from "@ms/contracts";
import type { StorageStatus } from "@ms/core";
import { z } from "zod";
import { buildSemanticTask, loadPrompt } from "../agents/prompts.js";
import type { AgentRuntimeAdapter, Role } from "../agents/runtime.js";
import { type SemanticInput, semanticInput } from "../analysis/semantic-input.js";
import { validateSemantic } from "../analysis/semantic-validate.js";
import { type Span, WINDOW_DEFAULTS, type WindowOptions, mergeWindows, windowSpans } from "../analysis/semantic-windows.js";
import { createJobDraft } from "../artifacts/job-draft.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactStore, isPublished } from "../artifacts/store.js";
import type { AppConfig } from "../config.js";
import * as edls from "../db/repos/edls.js";
import * as jobs from "../db/repos/jobs.js";
import * as projects from "../db/repos/projects.js";
import * as semanticRepo from "../db/repos/semantic.js";
import * as transcripts from "../db/repos/transcripts.js";
import { roughCutApprovalValid } from "../edit/approval-a.js";
import { timelineFor } from "../edit/timeline-store.js";
import { currentTranscript } from "../edit/transcript-ops.js";
import { canonicalJson } from "../jobs/queue.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import { sha256 } from "../scenes/hash.js";
import { FencedOutError, PublishCancelledError } from "../scenes/repo.js";
import { QUARANTINE, fsyncWrite, setWritable } from "../scenes/store.js";
import { checkpointPath, readCheckpoint, stepInputHash, writeCheckpoint } from "./checkpoints.js";
import { recordAgentRuns } from "./record.js";
import { RunCtx, errText, isStorageError, toolless } from "./steps.js";

/** `useAgent: false` — без Semantic Director: пустая разметка (UI-тесты без LLM). */
export const SemanticAnalyzeInputSchema = z.object({ projectId: z.string().min(1), useAgent: z.boolean().optional() }).strict();
export type SemanticAnalyzeInput = z.infer<typeof SemanticAnalyzeInputSchema>;

export const SEMANTIC_STAGES = ["prepare", "agent", "publish"] as const;
export type SemanticStage = (typeof SEMANTIC_STAGES)[number];

export const SEMANTIC_FILE = "semantic.json";

export interface SemanticAnalyzeDeps {
  root: string;
  config: AppConfig;
  storage: () => Promise<StorageStatus>;
  agents: AgentRuntimeAdapter;
  /** Параметры окон (по умолчанию `WINDOW_DEFAULTS`; тесты — маленькие окна). */
  windows?: WindowOptions;
  watchIntervalMs?: number;
  onStage?: (stage: SemanticStage) => void | Promise<void>;
  log?: (line: string) => void;
  /** Системный промпт роли для хеша чекпоинта (m6; по умолчанию `loadPrompt` — как у рантайма сервера). */
  systemPrompt?: (role: Role) => string;
}

/** Итог задачи (`output_refs`). */
export interface SemanticAnalyzeResult {
  semantic_id: string;
  rel_path: string;
  /** Разметка опубликована прошлой попыткой этой задачи (M3). */
  reused: boolean;
  transcript_ref: { id: string; revision: number };
  edl_ref: { id: string; revision: number };
  /**
   * К моменту публикации текущая ревизия EDL или транскрипта уже другая (m4): разметка честно
   * ссылается на ревизии, по которым построена, но потребителю не годится.
   */
  stale_on_publish: boolean;
  words?: { kept: number; removed: number };
  windows?: number;
  counts: { chapters: number; anchors: number; numbers: number; entities: number; causal: number; disputed: number; rejected: number };
  agent?: {
    status: "skipped" | "completed";
    calls: number;
    cost_usd: number;
    retried: number;
    from_checkpoint: number;
    merge_dropped: { causal: number; boundaries: number; anchors: number };
  };
  timings_ms?: Partial<Record<SemanticStage, number>>;
}

class SemanticFail extends Error {
  constructor(readonly error: JobError, readonly status: "failed" | "cancelled" | "blocked" = "failed") {
    super(error.message);
  }
}

/** `sem_<ULID задачи>`: id разметки задачи (M3). */
export function semanticIdFor(jobId: string): string {
  const m = /^job_([0-9A-Z]+)$/.exec(jobId);
  if (!m) throw new Error(`semantic.analyze: id задачи не в формате job_<ULID>: ${jobId}`);
  return `sem_${m[1]}`;
}

const EMPTY: SemanticAgentOutput = { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] };

function counts(t: SemanticAgentOutput, rejected: number): SemanticAnalyzeResult["counts"] {
  return { chapters: t.chapters.length, anchors: t.anchors.length, numbers: t.numbers.length, entities: t.entities.length, causal: t.causal.length, disputed: t.disputed.length, rejected };
}

/** Принятых предложений в ответе (для выбора лучшего из двух ответов окна, m5). */
function accepted(t: SemanticAgentOutput): number {
  return t.chapters.length + t.anchors.length + t.numbers.length + t.entities.length + t.causal.length + t.disputed.length;
}

/** Перечень отклонённого для переотправки агенту. */
export function rejectedList(rs: SemanticRejected[]): string {
  return rs.map((r) => `- ${r.kind}${r.id ? ` ${r.id}` : ""}: ${r.code}${r.detail ? ` — ${r.detail}` : ""}`).join("\n");
}

export function semanticAnalyze(depsOf: (ctx: JobContext) => SemanticAnalyzeDeps): JobHandler {
  return async (ctx) => {
    const d = depsOf(ctx);
    const fail = (error: JobError, status: "failed" | "cancelled" | "blocked" = "failed"): HandlerResult => ({ status, error });
    const prep = (message: string) => fail({ code: "pipeline", stage: "prepare", message });
    const parsed = SemanticAnalyzeInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return prep(`вход semantic.analyze не годится: ${parsed.error.message}`);
    const input = parsed.data;
    if (input.projectId !== ctx.job.project_id) return prep(`вход semantic.analyze: projectId ${input.projectId} не совпадает с проектом задачи ${ctx.job.project_id}`);
    const project = projects.get(ctx.db, input.projectId);
    if (!project) return prep(`проекта ${input.projectId} нет`);
    if (project.kind !== "video") return prep(`проект ${input.projectId} не видеопроект (${project.kind})`);
    let semanticId: string;
    try {
      semanticId = semanticIdFor(ctx.job.id);
    } catch (e) {
      return prep(errText(e));
    }

    const root = d.root;
    const destRel = artifactPaths(root, input.projectId).semantic(semanticId);
    const relPath = `${destRel}/${SEMANTIC_FILE}`;
    const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
    const signal = ctx.signal;
    const timings: Partial<Record<SemanticStage, number>> = {};
    let stage: SemanticStage = "prepare";
    let t0 = Date.now();
    const enter = async (s: SemanticStage, p: number) => {
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
      // M3: разметка этой задачи уже опубликована (попытка N упала после COMMIT)
      if (isPublished(ctx.db, destRel)) {
        const doc = SemanticTimelineSchema.parse(JSON.parse(await readFile(join(root, relPath), "utf8")));
        ctx.emit("semantic_reused", `разметка ${semanticId} опубликована прошлой попыткой: агент не вызывается`);
        return done({
          semantic_id: semanticId, rel_path: relPath, reused: true, transcript_ref: doc.transcript_ref, edl_ref: doc.edl_ref,
          stale_on_publish: staleRefs(doc.transcript_ref, doc.edl_ref, false), counts: counts(doc, doc.rejected?.length ?? 0),
        });
      }

      // гейт: Approval A текущей ревизии EDL; гейт и ревизии EDL и транскрипта — один снимок БД (m4)
      const snap = ctx.db.transaction(() => {
        if (!roughCutApprovalValid(ctx.db, input.projectId)) return { valid: false as const };
        const e = edls.byProject(ctx.db, input.projectId);
        return { valid: true as const, edl: e, trRev: e ? transcripts.get(ctx.db, e.transcript_id)?.current_revision ?? null : null };
      }).deferred();
      if (!snap.valid) {
        return fail({ code: "approval_required", message: `semantic.analyze: черновой монтаж проекта ${input.projectId} не утверждён (Approval A нет или устарело) — сначала утвердите монтаж` });
      }
      const edl = snap.edl;
      if (!edl || edl.current_revision === null) throw new SemanticFail({ code: "approval_required", message: `у проекта ${input.projectId} нет чернового монтажа` });
      const edlRev = edl.current_revision;
      const status = await d.storage();
      if (!status.ok) throw new SemanticFail({ code: "storage_unavailable", stage: "storage", message: `${status.reason}: ${status.detail}` });
      const tr = currentTranscript(ctx.db, root, edl.transcript_id, snap.trRev ?? undefined);
      const tl = timelineFor(ctx.db, edl.id, edlRev);
      const wordMap = mapWords(tl, tr.words);
      const inp = semanticInput(tr.words, tr.segments, tl);
      const transcriptRef = { id: tr.transcript_id, revision: tr.revision };
      const edlRef = { id: edl.id, revision: edlRev };
      d.log?.(`semantic ${semanticId}: слов ${inp.words.length} (вырезано ${inp.removed}), EDL ${edl.id} r${edlRev}`);

      let timeline: SemanticAgentOutput = EMPTY;
      let rejected: SemanticRejected[] = [];
      let spans: Span[] = [];
      let skipped = false;
      let agentInfo: NonNullable<SemanticAnalyzeResult["agent"]> = {
        status: "skipped", calls: 0, cost_usd: 0, retried: 0, from_checkpoint: 0, merge_dropped: { causal: 0, boundaries: 0, anchors: 0 },
      };
      if (inp.words.length === 0) {
        ctx.emit("nothing_to_analyze", tr.words.length === 0 ? "в транскрипте нет слов: размечать нечего" : "черновой монтаж вырезал все слова: размечать нечего");
      } else if (input.useAgent === false) {
        skipped = true;
        ctx.emit("agent_skipped", "агент Semantic Director не вызывался (useAgent: false): разметка пустая, план по ней агент не строит");
      } else {
        await enter("agent", 0.1);
        spans = windowSpans(inp.words.length, d.windows ?? WINDOW_DEFAULTS);
        if (spans.length > 1) ctx.emit("windows", `слов ${inp.words.length}: окон ${spans.length} (перекрытие ${(d.windows ?? WINDOW_DEFAULTS).overlap})`, { spans });
        const r = await runAgent(inp, spans, tr.words, wordMap);
        agentInfo = { ...r.info, calls: rc.records.length, cost_usd: Math.round(rc.spent * 1e4) / 1e4 };
        const merged = mergeWindows(r.parts, spans, inp.words);
        agentInfo.merge_dropped = merged.dropped;
        if (merged.dropped.causal + merged.dropped.boundaries + merged.dropped.anchors > 0) {
          ctx.emit("windows_merged", `объединение окон: отброшено связей ${merged.dropped.causal} (якорь в чужом отрезке окна), границ глав ${merged.dropped.boundaries} (почти совпали в перекрытии), ` +
            `якорей ${merged.dropped.anchors} (почти-дубли на стыке)`);
        }
        // контроль объединения: итог проходит ту же проверку по всему транскрипту
        const final = validateSemantic(merged.timeline, tr.words, wordMap);
        if (final.rejected.length > 0) ctx.emit("semantic_merge_rejected", `после объединения окон отклонено ${final.rejected.length}`, { rejected: final.rejected.slice(0, 50) });
        timeline = final.timeline;
        rejected = [...r.rejected, ...merged.rejected, ...final.rejected.map((x) => ({ ...x, detail: `после объединения окон: ${x.detail ?? ""}` }))];
      }
      if (rejected.length > 0) {
        ctx.emit("semantic_rejected", `отклонено кодом после переотправки: ${rejected.length} (${[...new Set(rejected.map((x) => x.code))].join(", ")})`, { rejected: rejected.slice(0, 100) });
      }

      const doc: SemanticTimeline = SemanticTimelineSchema.parse({
        schema_version: 1, id: semanticId, transcript_ref: transcriptRef, edl_ref: edlRef, ...timeline, rejected,
        ...(skipped ? { agent: "skipped" } : {}),
      });
      await enter("publish", 0.95);
      // EDL или транскрипт сменились за время анализа: разметка честно ссылается на ревизии, по
      // которым построена, итог помечен `stale_on_publish` (m4)
      const staleOnPublish = staleRefs(transcriptRef, edlRef, true);
      draftDir = (await createJobDraft(root, { runId: fence.jobId, attempt: fence.attempt })).dir;
      await fsyncWrite(join(draftDir, SEMANTIC_FILE), JSON.stringify(doc, null, 2) + "\n");
      const store = new ArtifactStore({ root, db: ctx.db, guard: d.storage });
      await store.publish(draftDir, destRel, (db, files) => {
        const f = files.find((x) => x.path === SEMANTIC_FILE);
        if (!f) throw new Error(`публикация без ${SEMANTIC_FILE}`);
        semanticRepo.insert(db, {
          id: semanticId, project_id: input.projectId, transcript_id: transcriptRef.id, transcript_revision: transcriptRef.revision,
          edl_id: edlRef.id, edl_revision: edlRef.revision, rel_path: relPath, sha256: f.sha256,
          chapters: doc.chapters.map((c) => ({ chapter_id: c.id, title: c.title, start_word_id: c.start_word_id, end_word_id: c.end_word_id })),
        });
      }, fence);
      timings.publish = (timings.publish ?? 0) + (Date.now() - t0);
      const res: SemanticAnalyzeResult = {
        semantic_id: semanticId, rel_path: relPath, reused: false, transcript_ref: transcriptRef, edl_ref: edlRef, stale_on_publish: staleOnPublish,
        words: { kept: inp.words.length, removed: inp.removed }, windows: spans.length, counts: counts(doc, rejected.length), agent: agentInfo, timings_ms: timings,
      };
      recordAgentRuns(ctx.db, ctx.job.id, ctx.attempt, rc.records);
      d.log?.(`semantic ${semanticId}: глав ${res.counts.chapters}, якорей ${res.counts.anchors}, чисел ${res.counts.numbers}, отклонено ${res.counts.rejected}, $${agentInfo.cost_usd}`);
      return done(res);
    } catch (e) {
      return await failed(e);
    }

    /**
     * Semantic Director по окнам. Окно: вызов → (отказ схемы — переотправка с ошибкой) → проверка →
     * (отклонённые — переотправка с перечнем, если переотправки ещё не было) → ответ окна.
     */
    async function runAgent(
      inp: SemanticInput, spans: Span[], all: TranscriptWord[], wordMap: ReturnType<typeof mapWords>,
    ): Promise<{ parts: SemanticAgentOutput[]; rejected: SemanticRejected[]; info: NonNullable<SemanticAnalyzeResult["agent"]> }> {
      const label = "Semantic Director";
      const allowFix = d.config.scene.maxAutoFixes >= 1;
      const info: NonNullable<SemanticAnalyzeResult["agent"]> = {
        status: "completed", calls: 0, cost_usd: 0, retried: 0, from_checkpoint: 0, merge_dropped: { causal: 0, boundaries: 0, anchors: 0 },
      };
      const pos = new Map(all.map((w, i) => [w.id, i]));
      const windows = spans.map((s, k) => {
        const words = inp.words.slice(s.start, s.end);
        const ids = new Set(words.map((w) => w.id));
        const segments = inp.segments.map((g) => ({ id: g.id, word_ids: g.word_ids.filter((x) => ids.has(x)) })).filter((g) => g.word_ids.length > 0);
        // слова транскрипта окна вместе с вырезанными между оставленными (проверка anchor_in_cut)
        const full = all.slice(pos.get(words[0]!.id)!, pos.get(words.at(-1)!.id)! + 1);
        return { words, segments, full, window: { index: k + 1, total: spans.length } };
      });
      const make = (k: number, workdir: string, seq: number) => buildSemanticTask({ ...windows[k]!, workdir }, { ...rc.taskRun, seq });
      // хеш окна: модель, вход и sha256 системного промпта роли — смена промпта не берёт старые ответы (m6)
      const promptSha = sha256((d.systemPrompt ?? loadPrompt)("semantic_director"));
      const hashes = windows.map((_, k) => {
        const t = make(k, "", 1);
        return stepInputHash("semantic_director", t.model, { input: t.input, system_prompt_sha256: promptSha });
      });
      const allHash = sha256(canonicalJson(hashes));
      const saved = await readCheckpoint(checkpointPath(root, ctx.job.id, "semantic_director"), allHash);
      const answers: Record<string, SemanticAgentOutput> = {};
      if (saved && typeof saved === "object") {
        for (const [h, v] of Object.entries(saved as Record<string, unknown>)) {
          const p = SemanticAgentOutputSchema.safeParse(v);
          if (p.success) answers[h] = p.data;
        }
      }
      const parts: SemanticAgentOutput[] = [];
      const rejected: SemanticRejected[] = [];
      const tag = (rs: SemanticRejected[], k: number) => (spans.length > 1 ? rs.map((x) => ({ ...x, window: k + 1 })) : rs);
      /** Отказ вызова: хранилище, orphaned, отмена — как у задачи; бюджет и прочее — задача падает. */
      const fatal = (r: { stage: string; message: string }): never => {
        if (r.stage === "storage") throw new SemanticFail({ code: "storage_unavailable", stage: "storage", message: r.message });
        if (r.stage === "orphaned") throw new SemanticFail({ code: "stale_process", stage: "orphaned", message: r.message }, "blocked");
        if (r.stage === "cancelled" || signal.aborted) throw new DOMException(r.message, "AbortError");
        if (r.stage === "budget") throw new SemanticFail({ code: "budget", stage: "budget", message: r.message });
        throw new SemanticFail({ code: "pipeline", message: `${label}: ${r.message}` });
      };
      for (const [k, w] of windows.entries()) {
        const h = hashes[k]!;
        const where = spans.length > 1 ? `, окно ${k + 1}/${spans.length}` : "";
        const check = (o: SemanticAgentOutput) => validateSemantic(o, w.full, wordMap);
        if (answers[h]) {
          info.from_checkpoint++;
          ctx.emit("agent_checkpoint", `${label}${where}: ответ из чекпоинта прошлой попытки — агент не вызывался`);
          const v = check(answers[h]!);
          parts.push(v.timeline);
          rejected.push(...tag(v.rejected, k));
          continue;
        }
        ctx.progress(0.1 + 0.8 * (k / windows.length), "agent");
        let retried = false;
        let r = await toolless(rc, "semantic_director", "prepare", label, (workdir) => make(k, workdir, 2 * k + 1), SemanticAgentOutputSchema);
        if (!r.ok && r.kind === "schema" && allowFix) {
          retried = true;
          info.retried++;
          ctx.emit("agent_retry", `${label}${where}: ответ не прошёл схему — переотправка (одна): ${r.message.slice(0, 500)}`);
          const why = r.message;
          r = await toolless(rc, "semantic_director", "prepare", label, (workdir) => {
            const t = make(k, workdir, 2 * k + 2);
            t.input += `\n\n# Прошлый ответ отклонён\n\n${why.slice(0, 2000)}\n\nОтветь заново строго по схеме.`;
            return t;
          }, SemanticAgentOutputSchema);
        }
        if (!r.ok) fatal(r);
        let chosen = (r as { output: SemanticAgentOutput }).output;
        let v = check(chosen);
        if (v.rejected.length > 0 && !retried && allowFix) {
          info.retried++;
          const list = rejectedList(v.rejected);
          ctx.emit("agent_retry", `${label}${where}: отклонено кодом ${v.rejected.length} — переотправка (одна) с перечнем`, { rejected: v.rejected.slice(0, 50) });
          const r2 = await toolless(rc, "semantic_director", "prepare", label, (workdir) => {
            const t = make(k, workdir, 2 * k + 2);
            t.input += `\n\n# Прошлый ответ: отклонено кодом\n\n${list.slice(0, 6000)}\n\n` +
              "Ответь заново полностью (все разделы): исправь отклонённое по контракту доказательств (id слов из задачи, цитата — дословно эти слова подряд), принятое повтори как было. Что не можешь подтвердить цитатой — убери.";
            return t;
          }, SemanticAgentOutputSchema);
          if (r2.ok) {
            // лучший из двух (m5): меньше отклонённого, при равенстве — больше принятого (дальше — второй)
            const v2 = check(r2.output);
            if (v2.rejected.length < v.rejected.length || (v2.rejected.length === v.rejected.length && accepted(v2.timeline) >= accepted(v.timeline))) {
              chosen = r2.output;
              v = v2;
            } else {
              ctx.emit("agent_retry_kept_first", `${label}${where}: второй ответ хуже (отклонено ${v2.rejected.length}, принято ${accepted(v2.timeline)}) — остаётся первый (отклонено ${v.rejected.length}, принято ${accepted(v.timeline)})`);
            }
          } else if (["storage", "orphaned", "cancelled"].includes(r2.stage) || signal.aborted) {
            fatal(r2);
          } else {
            ctx.emit("agent_retry_failed", `${label}${where}: переотправка не удалась (${r2.message.slice(0, 300)}) — остаётся первый ответ`);
          }
        }
        answers[h] = chosen;
        try {
          await writeCheckpoint(root, ctx.job.id, "semantic_director", { input_hash: allHash, output: answers });
        } catch (e) {
          ctx.emit("checkpoint_failed", `${label}: чекпоинт не записан: ${errText(e)}`);
        }
        parts.push(v.timeline);
        rejected.push(...tag(v.rejected, k));
      }
      return { parts, rejected, info };
    }

    /** Ревизии, по которым построена разметка, уже не текущие (m4); `emit` — события об этом. */
    function staleRefs(tRef: { id: string; revision: number }, eRef: { id: string; revision: number }, emit: boolean): boolean {
      const eNow = edls.get(ctx.db, eRef.id)?.current_revision ?? null;
      const tNow = transcripts.get(ctx.db, tRef.id)?.current_revision ?? null;
      if (emit && eNow !== eRef.revision) ctx.emit("edl_changed", `EDL ${eRef.id} за время анализа стал r${eNow}: разметка построена по r${eRef.revision}`);
      if (emit && tNow !== tRef.revision) ctx.emit("transcript_changed", `транскрипт ${tRef.id} за время анализа стал r${tNow}: разметка построена по r${tRef.revision}`);
      return eNow !== eRef.revision || tNow !== tRef.revision;
    }

    function done(r: SemanticAnalyzeResult): HandlerResult {
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
      if (e instanceof SemanticFail) return fail(e.error, e.status);
      if (signal.aborted || (e instanceof Error && e.name === "AbortError")) {
        if (cancelled()) return fail({ code: "cancelled", stage: "cancelled", message: `смысловой анализ отменён на этапе ${stage}` }, "cancelled");
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
