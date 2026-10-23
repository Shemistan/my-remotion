// Обработчик `asr.transcribe` (Task 26): audio16k исходника → CLI-воркер ASR ai-platform →
// проверенные слова с таймкодами → ревизия транскрипта `r1` (`author: "asr"`) с сегментами.
// Шаги: вход → исходник проекта со звуком → доступность ASR (python, воркер с закреплённым
// sha256, модель) → silencedetect по audio16k → разрезы → семафор `heavy` (1) → воркер →
// контракт вывода → публикация `transcript/<trn>/r1/` с fencing → индекс в БД.
//
// Повтор после сбоя (ревью Task 24, M3): id транскрипта выводится из id задачи
// (`trn_<ULID задачи>`), ревизия и строки БД пишутся одной транзакцией публикации — попытка N+1
// находит опубликованную попыткой N ревизию и завершает задачу по ней, воркер не запускает и
// `r2` не создаёт.
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { type JobError, type TranscriptRevisionDoc, TranscriptRevisionDocSchema } from "@ms/contracts";
import { type StorageStatus, safeMkdir, spawnTracked } from "@ms/core";
import { z } from "zod";
import { createJobDraft } from "../artifacts/job-draft.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactStore } from "../artifacts/store.js";
import { ASR_MODELS, type AsrConfig } from "../config.js";
import * as jobs from "../db/repos/jobs.js";
import * as media from "../db/repos/media.js";
import * as projects from "../db/repos/projects.js";
import * as transcripts from "../db/repos/transcripts.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import { AsrAdapter, AsrInputError, AsrRunError, HOTWORDS_PROMPT_BUDGET, MAX_OUTPUT_BYTES, checkHotwords, checkLanguage, fitHotwords, workerPath } from "../media/asr-adapter.js";
import { type AsrCapabilityDeps, AI_PLATFORM_PORT, asrCapability, defaultCapabilityDeps } from "../media/asr-capability.js";
import { AsrContractError, toTranscriptWords, trimToDuration } from "../media/asr-contract.js";
import { MAX_CHUNK_S, chooseSplits, detectSilences } from "../media/asr-splits.js";
import { wavDurationS } from "../media/audio.js";
import { FfmpegError } from "../media/ffmpeg.js";
import { SEGMENT_DEFAULTS, type SegmentOptions, buildSegments } from "../media/segments.js";
import { sha256File } from "../scenes/hash.js";
import { FencedOutError, PublishCancelledError } from "../scenes/repo.js";
import { QUARANTINE, fsyncWrite, quarantineDir, setWritable } from "../scenes/store.js";
import { errText, isStorageError } from "./steps.js";

export const AsrTranscribeInputSchema = z.object({
  projectId: z.string().min(1),
  mediaId: z.string().min(1),
  language: z.string().optional(),
  model: z.enum(ASR_MODELS).optional(),
  hotwords: z.array(z.string().max(256)).max(200).optional(),
}).strict();
export type AsrTranscribeInput = z.infer<typeof AsrTranscribeInputSchema>;

export const ASR_STAGES = ["prepare", "silence", "heavy_wait", "transcribe", "publish"] as const;
export type AsrStage = (typeof ASR_STAGES)[number];

export interface AsrTranscribeDeps {
  root: string;
  asr: AsrConfig;
  storage: () => Promise<StorageStatus>;
  segments?: SegmentOptions;
  /** Кусок звука для воркера, с (290). */
  maxChunkS?: number;
  /** Подмены для тестов: проверки доступности, занятость порта, запуск процесса, пауза SIGTERM→SIGKILL. */
  capability?: Partial<AsrCapabilityDeps>;
  portBusy?: AsrCapabilityDeps["portBusy"];
  spawn?: typeof spawnTracked;
  killGraceMs?: number;
  /** Предел words.json, байт (64 МиБ). */
  maxOutputBytes?: number;
  onStage?: (stage: AsrStage) => void | Promise<void>;
  log?: (line: string) => void;
}

/** Итог задачи (`output_refs`). */
export interface AsrTranscribeResult {
  transcript_id: string;
  revision: number;
  rel_path: string;
  words: number;
  segments: number;
  /** Ревизия опубликована прошлой попыткой этой задачи (M3) — воркер не запускался. */
  reused: boolean;
  model?: string;
  splits?: number[];
  audio_s?: number;
  elapsed_s?: number;
  /** Время воркера / длительность звука. */
  rtf?: number;
  ai_platform_commit?: string;
  timings_ms?: Partial<Record<AsrStage, number>>;
}

/** Ожидаемый отказ с кодом задачи. */
class AsrFail extends Error {
  constructor(readonly error: JobError, readonly status: "failed" | "cancelled" | "blocked" = "failed") {
    super(error.message);
  }
}

/** `trn_<ULID задачи>`: попытки одной задачи пишут один и тот же транскрипт. */
export function transcriptIdFor(jobId: string): string {
  const m = /^job_([0-9A-Z]+)$/.exec(jobId);
  if (!m) throw new Error(`asr.transcribe: id задачи не в формате job_<ULID>: ${jobId}`);
  return `trn_${m[1]}`;
}

const DOC_FILE = "transcript.json";
const RAW_FILE = "asr-worker.json";

/**
 * Рабочие каталоги `run/tmp/<job>-a<N>-asr-*` прежних попыток задачи (kill -9: их процессы уже
 * разобраны восстановлением). Только своей задачи и только попыток раньше `attempt`.
 */
async function dropStaleWorkdirs(tmpRoot: string, jobId: string, attempt: number): Promise<void> {
  if (!existsSync(tmpRoot)) return;
  const re = new RegExp(`^${jobId}-a(\\d+)-asr-`);
  for (const name of await readdir(tmpRoot)) {
    const m = re.exec(name);
    if (m && Number(m[1]) < attempt) await rm(join(tmpRoot, name), { recursive: true, force: true }).catch(() => undefined);
  }
}

async function dropDir(dir: string | undefined): Promise<void> {
  if (!dir || !existsSync(dir) || existsSync(join(dir, QUARANTINE))) return;
  await setWritable(dir).catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
}

export function asrTranscribe(depsOf: (ctx: JobContext) => AsrTranscribeDeps): JobHandler {
  return async (ctx) => {
    const d = depsOf(ctx);
    const fail = (error: JobError, status: "failed" | "cancelled" | "blocked" = "failed"): HandlerResult => ({ status, error });
    const prep = (message: string) => fail({ code: "pipeline", stage: "prepare", message });
    const parsed = AsrTranscribeInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return prep(`вход asr.transcribe не годится: ${parsed.error.message}`);
    const input = parsed.data;
    if (input.projectId !== ctx.job.project_id) return prep(`вход asr.transcribe: projectId ${input.projectId} не совпадает с проектом задачи ${ctx.job.project_id}`);
    let language: string;
    let hotwords: string[];
    try {
      language = checkLanguage(input.language ?? d.asr.language);
      hotwords = checkHotwords(input.hotwords ?? []);
    } catch (e) {
      return prep(errText(e));
    }
    const fit = fitHotwords(hotwords);
    if (fit.dropped.length > 0) {
      ctx.emit("hotwords_truncated", `hotwords не помещаются в окно промпта whisper (~${HOTWORDS_PROMPT_BUDGET} токенов): отброшены последние ${fit.dropped.length} из ${hotwords.length}`, { kept: fit.kept, dropped: fit.dropped });
      hotwords = fit.kept;
    }
    const project = projects.get(ctx.db, input.projectId);
    if (!project) return prep(`проекта ${input.projectId} нет`);
    if (project.kind !== "video") return prep(`проект ${input.projectId} не видеопроект (${project.kind})`);
    const asset = media.get(ctx.db, input.mediaId);
    if (!asset) return prep(`исходника ${input.mediaId} нет`);
    if (asset.project_id !== input.projectId) return prep(`исходник ${input.mediaId} не из проекта ${input.projectId}`);

    const root = d.root;
    const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
    const trnId = transcriptIdFor(ctx.job.id);
    const destRel = artifactPaths(root, input.projectId).transcriptRev(trnId, 1);
    const model = input.model ?? d.asr.model;
    const signal = ctx.signal;
    const timings: Partial<Record<AsrStage, number>> = {};
    let stage: AsrStage = "prepare";
    let t0 = Date.now();
    const enter = async (s: AsrStage, p: number) => {
      timings[stage] = (timings[stage] ?? 0) + (Date.now() - t0);
      stage = s;
      t0 = Date.now();
      ctx.progress(p, s);
      await d.onStage?.(s);
      signal.throwIfAborted();
    };
    let draftDir: string | undefined;
    let workdir: string | undefined;

    try {
      // M3: ревизия этой задачи уже опубликована (попытка N упала после COMMIT) — завершаемся по ней
      const existing = transcripts.get(ctx.db, trnId);
      if (existing?.current_revision) {
        const rev = transcripts.revision(ctx.db, trnId, existing.current_revision)!;
        ctx.emit("transcript_reused", `ревизия r${rev.revision} опубликована прошлой попыткой: воркер не запускается`);
        await dropStaleWorkdirs(join(root, "run/tmp"), fence.jobId, fence.attempt).catch(() => undefined);
        return done({
          transcript_id: trnId, revision: rev.revision, rel_path: rev.rel_path, reused: true,
          words: transcripts.words(ctx.db, trnId, rev.revision).length,
          segments: ctx.db.prepare("SELECT COUNT(*) FROM transcript_segments WHERE transcript_id = ? AND revision = ?").pluck().get(trnId, rev.revision) as number,
        });
      }

      if (!asset.probe.audio) throw new AsrFail({ code: "no_audio", message: `no_audio: у исходника «${asset.original_name}» нет звуковой дорожки — расшифровывать нечего` });
      const audioRow = media.derivatives(ctx.db, asset.id).find((x) => x.kind === "audio16k");
      if (!audioRow) throw new AsrFail({ code: "no_audio", message: `no_audio: у исходника ${asset.id} нет audio16k (импорт без звука)` });

      const status = await d.storage();
      if (!status.ok) throw new AsrFail({ code: "storage_unavailable", stage: "storage", message: `${status.reason}: ${status.detail}` });

      const capDeps: AsrCapabilityDeps = { ...defaultCapabilityDeps, ...d.capability, ...(d.portBusy ? { portBusy: d.portBusy } : {}) };
      const cap = await asrCapability(d.asr, capDeps, { model });
      if (!cap.available) {
        const code = cap.reason === "asr_contract_changed" ? "asr_contract_changed" : "asr_unavailable";
        throw new AsrFail({ code, message: `${code}: ${cap.reason}: ${cap.detail}` });
      }

      const audio = join(root, audioRow.rel_path);
      if ((await sha256File(audio, { signal })) !== audioRow.sha256) throw new Error(`audio16k ${audioRow.rel_path} не совпадает с sha256 в БД`);
      const audioS = await wavDurationS(audio);
      if (Math.abs(audioS * 1e6 - asset.probe.duration_us) > 100_000) {
        const longer = audioS * 1e6 > asset.probe.duration_us;
        ctx.emit("audio_duration_mismatch", `звук ${audioS.toFixed(2)} с ${longer ? "длиннее" : "короче"} видео ${(asset.probe.duration_us / 1e6).toFixed(2)} с: таймкоды слов — по звуку от начала файла${longer ? ", слова за концом видео будут обрезаны" : ""}`, {
          audio_s: Math.round(audioS * 1000) / 1000, video_s: asset.probe.duration_us / 1e6,
        });
      }
      draftDir = (await createJobDraft(root, { runId: fence.jobId, attempt: fence.attempt })).dir;
      const tmpRoot = await safeMkdir(root, "run/tmp");
      await dropStaleWorkdirs(tmpRoot, fence.jobId, fence.attempt);
      workdir = await mkdtemp(join(tmpRoot, `${fence.jobId}-a${fence.attempt}-asr-`));

      await enter("silence", 0.03);
      const silences = await detectSilences(audio, { run: ctx.run, signal });
      const splits = chooseSplits(silences, audioS, d.maxChunkS ?? MAX_CHUNK_S);
      d.log?.(`asr ${trnId}: звук ${audioS.toFixed(1)} с, тишин ${silences.length}, кусков ${splits.length + 1}`);

      await enter("heavy_wait", 0.06);
      const release = await ctx.heavy.acquire(signal);
      let result;
      try {
        await enter("transcribe", 0.08);
        // воркер мог смениться за время ожидания heavy: сверка sha256 прямо перед запуском (m7)
        const shaNow = await capDeps.sha256File(workerPath(d.asr));
        if (shaNow !== cap.workerSha256) {
          throw new AsrFail({ code: "asr_contract_changed", message: `asr_contract_changed: sha256 ${workerPath(d.asr)} перед запуском = ${shaNow}, при проверке было ${cap.workerSha256}` });
        }
        if (cap.gpuContention) {
          ctx.emit("gpu_contention", `порт ai-platform ${AI_PLATFORM_PORT} занят: её модели могут занимать GPU — ASR может идти медленнее`);
        }
        const adapter = new AsrAdapter(d.asr, {
          ...(d.spawn ? { spawn: d.spawn } : {}), ...(d.killGraceMs !== undefined ? { killGraceMs: d.killGraceMs } : {}),
          ...(d.maxOutputBytes !== undefined ? { maxOutputBytes: d.maxOutputBytes } : {}),
        });
        result = await adapter.transcribe({
          audio16k: audio, audioDurationS: audioS, language, hotwords, splits, model, workdir, tmpdir: workdir,
          run: ctx.run, signal, onProgress: (p, st) => ctx.progress(0.08 + 0.84 * (p / 100), st || "transcribe"),
        });
      } finally {
        release();
      }

      const trimmed = trimToDuration(toTranscriptWords(result.output), asset.probe.duration_us);
      if (trimmed.dropped > 0 || trimmed.clamped > 0) {
        ctx.emit("words_trimmed", `слова за концом видео (${(asset.probe.duration_us / 1e6).toFixed(2)} с): отброшено ${trimmed.dropped}, обрезано ${trimmed.clamped}`, { dropped: trimmed.dropped, clamped: trimmed.clamped });
      }
      const words = trimmed.words;
      if (words.length === 0) {
        throw new AsrFail({ code: "pipeline", message: `речь не распознана: воркер вернул 0 слов на ${audioS.toFixed(1)} с звука` });
      }
      const segments = buildSegments(words, d.segments ?? SEGMENT_DEFAULTS);
      const doc: TranscriptRevisionDoc = TranscriptRevisionDocSchema.parse({
        schema_version: 1, transcript_id: trnId, revision: 1, media_sha256: asset.sha256, language, author: "asr",
        asr: { model, worker_sha256: cap.workerSha256, ai_platform_commit: cap.commit, elapsed_s: result.output.elapsed_s },
        words, segments, removed_word_ids: [],
      });

      await enter("publish", 0.94);
      await copyFile(result.outPath, join(draftDir, RAW_FILE));
      await fsyncWrite(join(draftDir, DOC_FILE), JSON.stringify(doc, null, 2) + "\n");
      const store = new ArtifactStore({ root, db: ctx.db, guard: d.storage });
      await store.publish(draftDir, destRel, (db, files) => {
        const f = files.find((x) => x.path === DOC_FILE);
        if (!f) throw new Error(`публикация без ${DOC_FILE}`);
        transcripts.create(db, { id: trnId, project_id: input.projectId, media_id: asset.id, language });
        transcripts.insertRevision(db, { doc, rel_path: `${destRel}/${DOC_FILE}`, sha256: f.sha256 });
      }, fence);
      timings.publish = (timings.publish ?? 0) + (Date.now() - t0);
      await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
      const elapsedS = result.elapsedMs / 1000;
      d.log?.(`asr ${trnId}: ${words.length} слов, ${segments.length} сегментов за ${elapsedS.toFixed(1)} с (×${(elapsedS / audioS).toFixed(2)} реального времени)`);
      return done({
        transcript_id: trnId, revision: 1, rel_path: `${destRel}/${DOC_FILE}`, words: words.length, segments: segments.length, reused: false,
        model, splits, audio_s: Math.round(audioS * 1000) / 1000, elapsed_s: Math.round(elapsedS * 10) / 10,
        rtf: Math.round((elapsedS / audioS) * 1000) / 1000, ai_platform_commit: cap.commit, timings_ms: timings,
      });
    } catch (e) {
      return await failed(e);
    }

    function done(r: AsrTranscribeResult): HandlerResult {
      ctx.progress(1, "done");
      return { status: "completed", outputRefs: r };
    }

    async function failed(e: unknown): Promise<HandlerResult> {
      const msg = errText(e);
      const cancelled = () => jobs.get(ctx.db, ctx.job.id)?.cancel_requested === true;
      const dropWork = () => (workdir ? rm(workdir, { recursive: true, force: true }).catch(() => undefined) : undefined);
      // процессы живы — draft и рабочий каталог не трогаем, draft в карантин (ADR 0007, rulings п. 13)
      if ((e instanceof AsrRunError && e.kind === "orphaned") || (e instanceof FfmpegError && e.kind === "orphaned")) {
        if (draftDir && existsSync(draftDir)) await quarantineDir(draftDir, `stale_process: ${stage}: ${msg}`).catch(() => undefined);
        return fail({ code: "stale_process", stage: "orphaned", message: `${stage}: ${msg}` }, "blocked");
      }
      if (e instanceof AsrContractError) {
        // вывод воркера — в журнал задачи (начало) и в карантин draft (целиком)
        ctx.emit("asr_output_rejected", msg, { head: e.head });
        const raw = workdir ? join(workdir, "words.json") : undefined;
        if (draftDir && existsSync(draftDir)) {
          // сверх предела (m5) — только начало в событии, файл не копируется
          const size = raw ? await stat(raw).then((x) => x.size, () => -1) : -1;
          if (raw && size >= 0 && size <= (d.maxOutputBytes ?? MAX_OUTPUT_BYTES)) await copyFile(raw, join(draftDir, RAW_FILE)).catch(() => undefined);
          await quarantineDir(draftDir, `asr_contract_violation: ${msg}`).catch(() => undefined);
        }
        await dropWork();
        return fail({ code: "asr_contract_violation", message: msg });
      }
      await dropWork();
      if (e instanceof FencedOutError) return fail({ code: "fenced_out", stage: "fenced_out", message: msg });
      if (e instanceof PublishCancelledError) return fail({ code: "cancelled", stage: "cancelled", message: msg }, "cancelled");
      await dropDir(draftDir).catch(() => undefined);
      if (e instanceof AsrFail) return fail(e.error, e.status);
      if (e instanceof AsrInputError) return fail({ code: "pipeline", stage: "prepare", message: msg });
      if (signal.aborted || (e instanceof AsrRunError && e.kind === "aborted") || (e instanceof FfmpegError && e.kind === "aborted")) {
        if (cancelled()) return fail({ code: "cancelled", stage: "cancelled", message: `ASR отменён на этапе ${stage}` }, "cancelled");
        return fail({ code: "interrupted", stage: "interrupted", message: `попытка прервана на этапе ${stage}` });
      }
      if (isStorageError(e)) return fail({ code: "storage_unavailable", stage: "storage", message: msg });
      const now = await d.storage().catch(() => undefined);
      if (!now || !now.ok) return fail({ code: "storage_unavailable", stage: "storage", message: `${now ? `${now.reason}: ${now.detail}; ` : ""}${stage}: ${msg}` });
      if (e instanceof AsrRunError) {
        // ASR установлен, но воркер упал / завис / не уложился — не «ASR не установлен» (m4)
        ctx.emit("asr_worker_failed", msg, { kind: e.kind, stderr_tail: e.stderrTail.slice(-2000) });
        return fail({ code: "asr_failed", stage: "transcribe", message: `asr_failed (${e.kind}): ${msg}` });
      }
      if (stage === "publish") return fail({ code: "pipeline", stage: "publish", message: msg });
      return fail({ code: "pipeline", message: `${stage}: ${msg}` });
    }
  };
}

/** Документ ревизии из хранилища (e2e, API Task 29). */
export async function readTranscriptDoc(root: string, relPath: string): Promise<TranscriptRevisionDoc> {
  return TranscriptRevisionDocSchema.parse(JSON.parse(await readFile(join(root, relPath), "utf8")));
}
