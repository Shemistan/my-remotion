// Обработчик `footage.analyze` (Task 30): анализ видеоряда исходника. Шаги: вход → прокси
// (время прокси = время исходника) → смены сцен `scdet` → шоты → ключевые кадры (≤ 120 на ролик,
// PNG 640 px в draft) → детектор Apple Vision `vision-detect` (лица, руки, люди; нет бинарника или
// сбой — режим `llm_only` с пометкой) → Footage Analyst (по умолчанию; инструмент только Read, cwd —
// рабочий каталог порции с её кадрами, батчи по 24 кадра, бюджет `analysis.maxCostUsd`, одна
// переотправка при отказе схемы) → `mergeFootage` → `analysis/footage/<id>/{footage.json,
// detections.json, frames/}` с fencing. От Approval A не зависит (V3): анализирует source.
//
// Повтор после сбоя (ревью Task 24, M3): id анализа — `ftg_<ULID задачи>`; опубликован прошлой
// попыткой — задача завершается по нему без ffmpeg, Vision и агента. Ответы агента по порциям —
// чекпоинт задачи (хеш всего входа агента → ответы по хешам порций): повтор не платит второй раз.
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type FootageAgentOutput, FootageAgentOutputSchema, type FootageAnalysis, FootageAnalysisSchema, type JobError } from "@ms/contracts";
import type { StorageStatus } from "@ms/core";
import { z } from "zod";
import { type FootageTaskShot, buildFootageTask, footageChecklist, footageDetectionsJson } from "../agents/prompts.js";
import type { AgentRuntimeAdapter } from "../agents/runtime.js";
import { type ShotInput, mergeFootage } from "../analysis/footage-merge.js";
import { MAX_KEYFRAMES_TOTAL, budgetKeyframes, extractKeyframes, frameDurationUs, sampleKeyframes, thin } from "../analysis/keyframes.js";
import { detectCuts, shotsFromCuts } from "../analysis/shots.js";
import { DEFAULT_VISION_BIN, VisionError, type VisionFrame, runVisionDetect, visionAvailable } from "../analysis/vision.js";
import { createJobDraft } from "../artifacts/job-draft.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactStore, isPublished } from "../artifacts/store.js";
import type { AppConfig } from "../config.js";
import * as footageRepo from "../db/repos/footage.js";
import * as jobs from "../db/repos/jobs.js";
import * as media from "../db/repos/media.js";
import * as projects from "../db/repos/projects.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import { FfmpegError, ffmpegFailureKind } from "../media/ffmpeg.js";
import { FencedOutError, PublishCancelledError } from "../scenes/repo.js";
import { QUARANTINE, fsyncWrite, quarantineDir, setWritable } from "../scenes/store.js";
import { canonicalJson } from "../jobs/queue.js";
import { sha256 } from "../scenes/hash.js";
import { checkpointPath, readCheckpoint, stepInputHash, writeCheckpoint } from "./checkpoints.js";
import { flushAgentRuns } from "./record.js";
import { RunCtx, errText, isStorageError, toolless } from "./steps.js";

export const FootageAnalyzeInputSchema = z.object({
  projectId: z.string().min(1),
  mediaId: z.string().min(1),
  useAgent: z.boolean().optional(),
}).strict();
export type FootageAnalyzeInput = z.infer<typeof FootageAnalyzeInputSchema>;

export const FOOTAGE_STAGES = ["prepare", "shots", "keyframes", "vision", "agent", "publish"] as const;
export type FootageStage = (typeof FOOTAGE_STAGES)[number];

/** Кадров в одном вызове Footage Analyst (шотов в порции не больше — `FOOTAGE_AGENT_LIMITS.shots`). */
export const AGENT_BATCH_FRAMES = 24;
export const FOOTAGE_FILE = "footage.json";
export const DETECTIONS_FILE = "detections.json";

export interface FootageAnalyzeDeps {
  root: string;
  config: AppConfig;
  storage: () => Promise<StorageStatus>;
  agents: AgentRuntimeAdapter;
  /** Путь `vision-detect` (по умолчанию `tools/vision-detect/bin/vision-detect`). */
  visionBin?: string;
  /** Таймаут одного запуска vision-detect, мс (тесты). */
  visionTimeoutMs?: number;
  /** Кадров в порции агента (по умолчанию `AGENT_BATCH_FRAMES`; тесты — несколько порций на коротком ролике). */
  agentBatchFrames?: number;
  watchIntervalMs?: number;
  onStage?: (stage: FootageStage) => void | Promise<void>;
  log?: (line: string) => void;
}

/** Итог задачи (`output_refs`). */
export interface FootageAnalyzeResult {
  footage_id: string;
  rel_path: string;
  mode: FootageAnalysis["mode"];
  /** Анализ опубликован прошлой попыткой этой задачи (M3). */
  reused: boolean;
  shots: number;
  keyframes: number;
  faces?: { shots_with_face: number; min_ratio: number };
  vision?: { status: "ok" | "unavailable" | "failed"; message?: string };
  agent?: {
    status: "skipped" | "completed" | "partial" | "failed" | "budget";
    message?: string;
    calls: number;
    batches: number;
    cost_usd: number;
    retried: number;
    from_checkpoint: number;
    dropped_objects: number;
    permission_denials: number;
  };
  timings_ms?: Partial<Record<FootageStage, number>>;
}

class FootageFail extends Error {
  constructor(readonly error: JobError, readonly status: "failed" | "cancelled" | "blocked" = "failed") {
    super(error.message);
  }
}

/** `ftg_<ULID задачи>`: id анализа задачи (M3). */
export function footageIdFor(jobId: string): string {
  const m = /^job_([0-9A-Z]+)$/.exec(jobId);
  if (!m) throw new Error(`footage.analyze: id задачи не в формате job_<ULID>: ${jobId}`);
  return `ftg_${m[1]}`;
}

interface Batch {
  shots: FootageTaskShot[];
}

/** Порции для агента: шоты подряд, ≤ `max` кадров; шот с большим числом кадров — свои ≤ `max` кадров. */
export function agentBatches(shots: readonly FootageTaskShot[], max = AGENT_BATCH_FRAMES): Batch[] {
  const out: Batch[] = [];
  let cur: FootageTaskShot[] = [];
  let n = 0;
  for (const s0 of shots) {
    if (s0.frames.length === 0) continue;
    let s = s0;
    if (s.frames.length > max) {
      const idx = thin(s.frames.map((_, k) => k), max);
      s = { ...s, frames: idx.map((k) => s0.frames[k]!), ...(s0.detections ? { detections: idx.map((k) => s0.detections![k]!) } : {}) };
    }
    if (n + s.frames.length > max && cur.length > 0) {
      out.push({ shots: cur });
      cur = [];
      n = 0;
    }
    cur.push(s);
    n += s.frames.length;
  }
  if (cur.length > 0) out.push({ shots: cur });
  return out;
}

export function footageAnalyze(depsOf: (ctx: JobContext) => FootageAnalyzeDeps): JobHandler {
  return async (ctx) => {
    const d = depsOf(ctx);
    const fail = (error: JobError, status: "failed" | "cancelled" | "blocked" = "failed"): HandlerResult => ({ status, error });
    const prep = (message: string) => fail({ code: "pipeline", stage: "prepare", message });
    const parsed = FootageAnalyzeInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return prep(`вход footage.analyze не годится: ${parsed.error.message}`);
    const input = parsed.data;
    if (input.projectId !== ctx.job.project_id) return prep(`вход footage.analyze: projectId ${input.projectId} не совпадает с проектом задачи ${ctx.job.project_id}`);
    const project = projects.get(ctx.db, input.projectId);
    if (!project) return prep(`проекта ${input.projectId} нет`);
    if (project.kind !== "video") return prep(`проект ${input.projectId} не видеопроект (${project.kind})`);
    let footageId: string;
    try {
      footageId = footageIdFor(ctx.job.id);
    } catch (e) {
      return prep(errText(e));
    }

    const root = d.root;
    const destRel = artifactPaths(root, input.projectId).footage(footageId);
    const relPath = `${destRel}/${FOOTAGE_FILE}`;
    const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
    const signal = ctx.signal;
    const run = ctx.run;
    const timings: Partial<Record<FootageStage, number>> = {};
    let stage: FootageStage = "prepare";
    let t0 = Date.now();
    const enter = async (s: FootageStage, p: number) => {
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
    }, signal, root, ctx.job.id, ctx.attempt, run.registry);

    try {
      // M3: анализ этой задачи уже опубликован (попытка N упала после COMMIT)
      if (isPublished(ctx.db, destRel)) {
        const row = footageRepo.get(ctx.db, footageId);
        const doc = FootageAnalysisSchema.parse(JSON.parse(await readFile(join(root, relPath), "utf8")));
        ctx.emit("footage_reused", `анализ ${footageId} опубликован прошлой попыткой: ffmpeg, Vision и агент не запускаются`);
        return done({ footage_id: footageId, rel_path: relPath, mode: row?.mode ?? doc.mode, reused: true, shots: doc.shots.length, keyframes: doc.shots.reduce((a, s) => a + s.keyframes.length, 0) });
      }
      const asset = media.get(ctx.db, input.mediaId);
      if (!asset || asset.project_id !== input.projectId) throw new FootageFail({ code: "pipeline", stage: "prepare", message: `исходника ${input.mediaId} нет в проекте ${input.projectId}` });
      const proxyRow = media.derivatives(ctx.db, asset.id).find((x) => x.kind === "proxy");
      if (!proxyRow) throw new FootageFail({ code: "pipeline", stage: "prepare", message: `у исходника ${asset.id} нет прокси — сначала импорт` });
      const status = await d.storage();
      if (!status.ok) throw new FootageFail({ code: "storage_unavailable", stage: "storage", message: `${status.reason}: ${status.detail}` });
      const proxy = join(root, proxyRow.rel_path);
      const durationUs = asset.probe.duration_us;
      // m4: длительность 0/NaN — шотов и кадров не будет, а анализ «пустого» ролика ничего не значит
      if (!Number.isFinite(durationUs) || durationUs <= 0) {
        throw new FootageFail({ code: "media_invalid", message: `у исходника ${asset.id} длительность ${durationUs} µs — не видео для анализа; переимпортируйте файл` });
      }
      // I2: длительность кадра прокси (fps прокси = timeline_fps): момент кадра — не в последнем кадре шота
      const frameUs = frameDurationUs(asset.probe.timeline_fps);
      draftDir = (await createJobDraft(root, { runId: fence.jobId, attempt: fence.attempt })).dir;

      // шоты и кадры: ffmpeg под семафором renders
      await enter("shots", 0.03);
      const shotInputs: ShotInput[] = [];
      let keyframeCount = 0;
      const release = await ctx.renders.acquire(signal);
      try {
        const cuts = await detectCuts(proxy, { run, signal });
        const shots = shotsFromCuts(cuts, durationUs);
        ctx.emit("shots", `смен сцен ${cuts.length}, шотов ${shots.length}`, { cuts_us: cuts });
        await enter("keyframes", 0.15);
        const per = budgetKeyframes(shots.map((s) => sampleKeyframes(s, undefined, undefined, frameUs)), MAX_KEYFRAMES_TOTAL);
        const all = per.flat();
        let k = 0;
        for (const [i, s] of shots.entries()) {
          const frames = await extractKeyframes(proxy, per[i]!, draftDir, {
            run, signal, onFrame: () => ctx.progress(0.15 + 0.2 * (++k / Math.max(1, all.length)), "keyframes"),
          });
          const missing = per[i]!.length - frames.length;
          if (missing > 0) ctx.emit("keyframes_missing", `${s.id}: ffmpeg не выдал ${missing} кадров (момент за последним кадром прокси)`);
          shotInputs.push({ ...s, keyframes: frames });
        }
        keyframeCount = shotInputs.reduce((a, s) => a + s.keyframes.length, 0);
        if (all.length < shots.reduce((a, s) => a + sampleKeyframes(s, undefined, undefined, frameUs).length, 0)) {
          ctx.emit("keyframes_limited", `кадров на ролик не больше ${MAX_KEYFRAMES_TOTAL}: взято ${all.length}`);
        }
      } finally {
        release();
      }

      // детектор
      await enter("vision", 0.35);
      const bin = d.visionBin ?? DEFAULT_VISION_BIN;
      let vision: Record<string, VisionFrame[]> | undefined;
      let visionInfo: NonNullable<FootageAnalyzeResult["vision"]>;
      if (keyframeCount === 0) {
        visionInfo = { status: "ok", message: "кадров нет" };
        vision = Object.fromEntries(shotInputs.map((s) => [s.id, []]));
      } else if (!(await visionAvailable(bin))) {
        visionInfo = { status: "unavailable", message: "vision-detect не собран (npm run build:vision): режим llm_only, низкая уверенность зон" };
        ctx.emit("vision_unavailable", visionInfo.message!);
      } else {
        const paths = shotInputs.flatMap((s) => s.keyframes.map((f) => join(draftDir!, f.path)));
        try {
          const frames = await runVisionDetect(bin, paths, { run, signal, ...(d.visionTimeoutMs ? { timeoutMs: d.visionTimeoutMs } : {}) });
          const byPath = new Map(frames.map((f) => [f.path, f]));
          vision = Object.fromEntries(shotInputs.map((s) => [s.id, s.keyframes.map((f) => ({ ...byPath.get(join(draftDir!, f.path))!, path: f.path }))]));
          const unread = frames.filter((f) => f.error !== undefined);
          visionInfo = unread.length > 0 ? { status: "ok", message: `кадров не прочитано: ${unread.length} из ${frames.length}` } : { status: "ok" };
          if (unread.length > 0) ctx.emit("vision_frame_errors", `детектор не прочитал ${unread.length} из ${frames.length} кадров: ${unread[0]!.error}`, { count: unread.length });
        } catch (e) {
          if (e instanceof VisionError && e.kind === "orphaned") throw new FootageFail({ code: "stale_process", stage: "orphaned", message: `vision: ${e.message}` }, "blocked");
          if (signal.aborted || (e instanceof VisionError && e.kind === "aborted")) throw new DOMException(errText(e), "AbortError");
          if (isStorageError(e)) throw e;
          visionInfo = { status: "failed", message: errText(e) };
          ctx.emit("vision_failed", `детектор не отработал — режим llm_only: ${errText(e)}`);
        }
      }
      if (vision) await fsyncWrite(join(draftDir, DETECTIONS_FILE), JSON.stringify({ coords: "доли кадра, начало слева сверху", shots: vision }, null, 2) + "\n");

      // агент
      const taskShots: FootageTaskShot[] = shotInputs.map((s) => ({ shot_id: s.id, frames: s.keyframes, ...(vision ? { detections: vision[s.id] } : {}) }));
      const batches = agentBatches(taskShots, d.agentBatchFrames ?? AGENT_BATCH_FRAMES);
      const sentUs: Record<string, number[]> = {};
      for (const b of batches) for (const s of b.shots) sentUs[s.shot_id] = s.frames.map((f) => f.us);
      let agentOut: FootageAgentOutput | undefined;
      let agentInfo: NonNullable<FootageAnalyzeResult["agent"]> = {
        status: "skipped", calls: 0, batches: batches.length, cost_usd: 0, retried: 0, from_checkpoint: 0, dropped_objects: 0, permission_denials: 0,
      };
      if (input.useAgent === false) {
        ctx.emit("agent_skipped", "агент Footage Analyst не вызывался (useAgent: false): только детектор");
      } else if (batches.length === 0) {
        ctx.emit("agent_skipped", "кадров нет: агенту нечего смотреть");
      } else {
        await enter("agent", 0.45);
        const r = await runAgent(batches);
        agentOut = r.out;
        agentInfo = { ...r.info, calls: rc.records.length, cost_usd: Math.round(rc.spent * 1e4) / 1e4 };
      }

      // слияние
      const shotsOut = mergeFootage(shotInputs, vision, agentOut, {
        faceMargin: d.config.planning.faceMargin, windowUs: d.config.analysis.occupancyWindowUs, sentUs,
      });
      if (agentOut) {
        // m2: ответ уже отфильтрован по шотам порций (runAgent): считаются только объекты своих шотов
        const dropped = agentOut.shots.reduce((a, s) => a + s.objects.filter((o) => !(sentUs[s.shot_id] ?? []).includes(o.frame_us)).length, 0);
        agentInfo.dropped_objects = dropped;
        if (dropped > 0) ctx.emit("agent_objects_dropped", `${dropped} объектов агента отброшено: frame_us не из отправленных кадров`);
      }
      const mode: FootageAnalysis["mode"] = !vision ? "llm_only" : agentOut ? "vision+llm" : "vision";
      const doc: FootageAnalysis = FootageAnalysisSchema.parse({ schema_version: 1, id: footageId, media_sha256: asset.sha256, mode, shots: shotsOut });
      const withFace = doc.shots.filter((s) => s.face.union !== undefined);
      const faces = { shots_with_face: withFace.length, min_ratio: withFace.length ? Math.min(...withFace.map((s) => s.face.detected_ratio)) : 0 };

      await enter("publish", 0.95);
      await fsyncWrite(join(draftDir, FOOTAGE_FILE), JSON.stringify(doc, null, 2) + "\n");
      const store = new ArtifactStore({ root, db: ctx.db, guard: d.storage });
      await store.publish(draftDir, destRel, (db, files) => {
        const f = files.find((x) => x.path === FOOTAGE_FILE);
        if (!f) throw new Error(`публикация без ${FOOTAGE_FILE}`);
        footageRepo.insert(db, { id: footageId, project_id: input.projectId, media_id: asset.id, mode, rel_path: relPath, sha256: f.sha256 });
      }, fence);
      timings.publish = (timings.publish ?? 0) + (Date.now() - t0);
      d.log?.(`footage ${footageId}: ${mode}, шотов ${doc.shots.length}, кадров ${keyframeCount}, агент ${agentInfo.status} $${agentInfo.cost_usd}`);
      return done({
        footage_id: footageId, rel_path: relPath, mode, reused: false, shots: doc.shots.length, keyframes: keyframeCount, faces, vision: visionInfo, agent: agentInfo, timings_ms: timings,
      });
    } catch (e) {
      return await failed(e);
    } finally {
      // S17b: прогоны агентов — при любом исходе, в том числе неудачные
      flushAgentRuns(ctx, rc.records);
    }

    /**
     * Footage Analyst по порциям. Отказ схемы — одна переотправка порции; другой отказ, бюджет —
     * остальные порции не зовутся, анализ публикуется по детектору (и тем порциям, что прошли).
     */
    async function runAgent(batches: Batch[]): Promise<{ out?: FootageAgentOutput; info: NonNullable<FootageAnalyzeResult["agent"]> }> {
      const label = "Footage Analyst";
      const info: NonNullable<FootageAnalyzeResult["agent"]> = {
        status: "completed", calls: 0, batches: batches.length, cost_usd: 0, retried: 0, from_checkpoint: 0, dropped_objects: 0, permission_denials: 0,
      };
      const firstOf = (b: Batch) => buildFootageTask({ shots: b.shots, workdir: "" }, rc.taskRun);
      const hashes = batches.map((b) => {
        const t = firstOf(b);
        return stepInputHash("footage_analyst", t.model, t.input);
      });
      // чекпоинт задачи: хеш всего входа → ответы по хешам порций (частичный прогресс тоже)
      const allHash = sha256(canonicalJson(hashes));
      const saved = await readCheckpoint(checkpointPath(root, ctx.job.id, "footage_analyst"), allHash);
      const answers: Record<string, FootageAgentOutput> = {};
      if (saved && typeof saved === "object") {
        for (const [h, v] of Object.entries(saved as Record<string, unknown>)) {
          const p = FootageAgentOutputSchema.safeParse(v);
          if (p.success) answers[h] = p.data;
        }
      }
      const shots: FootageAgentOutput["shots"] = [];
      /**
       * m1: из ответа порции — только её шоты, по одному на id (первый); чужие и повторы — событие.
       * Иначе агент порции 2 мог бы переписать шот порции 1 или подставить шот, кадров которого не видел.
       */
      const own = (b: Batch, out: FootageAgentOutput, k: number): FootageAgentOutput["shots"] => {
        const ids = new Set(b.shots.map((x) => x.shot_id));
        const seen = new Set<string>();
        const kept: FootageAgentOutput["shots"] = [];
        const extra: string[] = [];
        for (const sh of out.shots) {
          if (!ids.has(sh.shot_id) || seen.has(sh.shot_id)) {
            extra.push(sh.shot_id);
            continue;
          }
          seen.add(sh.shot_id);
          kept.push(sh);
        }
        if (extra.length > 0) ctx.emit("agent_unknown_shots", `${label}, порция ${k + 1}: шоты вне порции или повторы пропущены: ${[...new Set(extra)].join(", ")}`);
        return kept;
      };
      for (const [k, b] of batches.entries()) {
        const h = hashes[k]!;
        if (answers[h]) {
          info.from_checkpoint++;
          shots.push(...own(b, answers[h]!, k));
          continue;
        }
        ctx.progress(0.45 + 0.45 * (k / batches.length), "agent");
        const populate = async (dir: string) => {
          await mkdir(join(dir, "frames"));
          for (const s of b.shots) for (const f of s.frames) await copyFile(join(draftDir!, f.path), join(dir, f.path));
          await writeFile(join(dir, DETECTIONS_FILE), footageDetectionsJson(b));
          await writeFile(join(dir, "checklist.md"), footageChecklist(b));
        };
        const before = rc.records.length;
        let r = await toolless(rc, "footage_analyst", "prepare", label, (workdir) => buildFootageTask({ shots: b.shots, workdir }, { ...rc.taskRun, seq: 2 * k + 1 }), FootageAgentOutputSchema, undefined, populate);
        if (!r.ok && r.kind === "schema") {
          info.retried++;
          ctx.emit("agent_retry", `${label}, порция ${k + 1}: ответ не прошёл схему — переотправка (одна): ${r.message.slice(0, 500)}`);
          const why = r.message;
          r = await toolless(rc, "footage_analyst", "prepare", label, (workdir) => {
            const t = buildFootageTask({ shots: b.shots, workdir }, { ...rc.taskRun, seq: 2 * k + 2 });
            t.input += `\n\n# Прошлый ответ отклонён\n\n${why.slice(0, 2000)}\n\nОтветь заново строго по схеме: только поле shots.`;
            return t;
          }, FootageAgentOutputSchema, undefined, populate);
        }
        for (const rec of rc.records.slice(before)) {
          if (rec.permissionDenials.length > 0) {
            info.permission_denials += rec.permissionDenials.length;
            ctx.emit("agent_permission_denied", `${label}: отказано в доступе ${rec.permissionDenials.length} раз (чтение вне рабочего каталога?)`, { denials: rec.permissionDenials.slice(0, 10) });
          }
        }
        if (r.ok) {
          answers[h] = r.output;
          shots.push(...own(b, r.output, k));
          try {
            await writeCheckpoint(root, ctx.job.id, "footage_analyst", { input_hash: allHash, output: answers });
          } catch (e) {
            ctx.emit("checkpoint_failed", `${label}: чекпоинт не записан: ${errText(e)}`);
          }
          continue;
        }
        if (r.stage === "storage") throw new FootageFail({ code: "storage_unavailable", stage: "storage", message: r.message });
        if (r.stage === "orphaned") throw new FootageFail({ code: "stale_process", stage: "orphaned", message: r.message }, "blocked");
        if (r.stage === "cancelled" || signal.aborted) throw new DOMException(r.message, "AbortError");
        const got = Object.keys(answers).length > 0;
        if (r.stage === "budget") {
          ctx.emit("budget", `${r.message}: ${got ? "часть шотов" : "шоты"} — только по детектору`);
          return { ...(shots.length ? { out: { shots } } : {}), info: { ...info, status: "budget", message: r.message } };
        }
        ctx.emit("agent_failed", `${r.message}: ${got ? "часть шотов" : "шоты"} — только по детектору`);
        return { ...(shots.length ? { out: { shots } } : {}), info: { ...info, status: shots.length ? "partial" : "failed", message: r.message } };
      }
      return { out: { shots }, info };
    }

    function done(r: FootageAnalyzeResult): HandlerResult {
      ctx.progress(1, "done");
      return { status: "completed", outputRefs: r };
    }

    async function failed(e: unknown): Promise<HandlerResult> {
      const msg = errText(e);
      const cancelled = () => jobs.get(ctx.db, ctx.job.id)?.cancel_requested === true;
      if ((e instanceof FfmpegError && e.kind === "orphaned") || (e instanceof FootageFail && e.error.code === "stale_process")) {
        // процесс жив — draft в карантин (ADR 0007, rulings п. 13)
        if (draftDir && existsSync(draftDir)) await quarantineDir(draftDir, `stale_process: ${stage}: ${msg}`).catch(() => undefined);
        return e instanceof FootageFail ? fail(e.error, e.status) : fail({ code: "stale_process", stage: "orphaned", message: `${stage}: ${msg}` }, "blocked");
      }
      if (e instanceof FencedOutError) return fail({ code: "fenced_out", stage: "fenced_out", message: msg });
      if (e instanceof PublishCancelledError) return fail({ code: "cancelled", stage: "cancelled", message: msg }, "cancelled");
      if (draftDir && existsSync(draftDir) && !existsSync(join(draftDir, QUARANTINE))) {
        await setWritable(draftDir).catch(() => undefined);
        await rm(draftDir, { recursive: true, force: true }).catch(() => undefined);
      }
      if (e instanceof FootageFail) return fail(e.error, e.status);
      if (signal.aborted || (e instanceof FfmpegError && e.kind === "aborted") || (e instanceof Error && e.name === "AbortError")) {
        if (cancelled()) return fail({ code: "cancelled", stage: "cancelled", message: `анализ видеоряда отменён на этапе ${stage}` }, "cancelled");
        return fail({ code: "interrupted", stage: "interrupted", message: `попытка прервана на этапе ${stage}` });
      }
      if (isStorageError(e)) return fail({ code: "storage_unavailable", stage: "storage", message: msg });
      const now = await d.storage().catch(() => undefined);
      if (!now || !now.ok) return fail({ code: "storage_unavailable", stage: "storage", message: `${now ? `${now.reason}: ${now.detail}; ` : ""}${stage}: ${msg}` });
      if (e instanceof FfmpegError && ffmpegFailureKind(msg) === "low_space") return fail({ code: "low_space", message: `low_space: ${msg}` });
      if (stage === "publish") return fail({ code: "pipeline", stage: "publish", message: msg });
      return fail({ code: "pipeline", message: `${stage}: ${msg}` });
    }
  };
}
