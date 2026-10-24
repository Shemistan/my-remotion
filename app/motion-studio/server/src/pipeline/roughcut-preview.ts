// Обработчик `roughcut.preview` (Task 28): превью ревизии EDL — склейка оставленных клипов из
// CFR-прокси. Ревизия EDL иммутабельна, поэтому замок ресурса не нужен. Шаги: вход → таймлайн
// ревизии (`timeline_clips`) → куски по `PREVIEW_CHUNK_CLIPS` клипов (`-filter_complex_script` из
// файла во временном каталоге; вход — прокси через `-protocol_whitelist file` и `file:`; звук
// куска — PCM) → склейка кусков concat-демуксером (видео без перекодирования, звук → AAC) →
// проверки: длительность видео и звука = `timeline.duration_us` ± кадр; синхронность звука по 5
// словам (`syncCheck`) ≤ кадра → публикация `preview/<edl>/r<N>/` (`preview.mp4`, `preview.json`)
// с fencing.
//
// Превью ревизии одно: опубликованное (этой или другой задачей, в том числе прошлой попыткой —
// ревью Task 24, M3) не строится второй раз — задача завершается по нему (`reused: true`).
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EditedTimeline, JobError } from "@ms/contracts";
import { type StorageStatus, safeMkdir } from "@ms/core";
import { z } from "zod";
import { createJobDraft } from "../artifacts/job-draft.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactExistsError, ArtifactStore, isPublished } from "../artifacts/store.js";
import type { RoughcutConfig } from "../config.js";
import * as edls from "../db/repos/edls.js";
import * as jobs from "../db/repos/jobs.js";
import * as media from "../db/repos/media.js";
import * as transcripts from "../db/repos/transcripts.js";
import { EditError } from "../edit/errors.js";
import { PREVIEW_CHUNK_CLIPS, type PreviewChunk, buildPreviewFilter, previewChunks } from "../edit/preview-filter.js";
import { type SyncSample, syncCheck, wavPcm } from "../edit/sync-probe.js";
import { timelineFor } from "../edit/timeline-store.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import { FfmpegError, ffmpegFailureKind, runFfmpeg, runTool } from "../media/ffmpeg.js";
import { FencedOutError, PublishCancelledError } from "../scenes/repo.js";
import { QUARANTINE, fsyncWrite, quarantineDir, setWritable } from "../scenes/store.js";
import { errText, isStorageError } from "./steps.js";

export const RoughcutPreviewInputSchema = z.object({
  edlId: z.string().min(1),
  revision: z.number().int().positive().optional(),
}).strict();
export type RoughcutPreviewInput = z.infer<typeof RoughcutPreviewInputSchema>;

export const PREVIEW_STAGES = ["prepare", "render", "concat", "check", "publish"] as const;
export type PreviewStage = (typeof PREVIEW_STAGES)[number];

/** Частота звука превью (как у прокси). */
export const PREVIEW_SAMPLE_RATE = 48_000;
export const PREVIEW_FILE = "preview.mp4";
export const PREVIEW_META = "preview.json";
/** Корреляция ниже — замер синхронности ненадёжен (тишина, шум) и в отказ не идёт. */
export const SYNC_MIN_CORR = 0.5;

export interface RoughcutPreviewDeps {
  root: string;
  roughcut: Pick<RoughcutConfig, "fadeUs">;
  storage: () => Promise<StorageStatus>;
  /** Клипов в куске (по умолчанию `PREVIEW_CHUNK_CLIPS`). */
  chunkClips?: number;
  /** Слов в проверке синхронности (5); 0 — без проверки. */
  syncWords?: number;
  onStage?: (stage: PreviewStage) => void | Promise<void>;
  log?: (line: string) => void;
}

export interface RoughcutPreviewResult {
  edl_id: string;
  revision: number;
  rel_path: string;
  /** Превью уже было опубликовано — не строилось (M3, повтор). */
  reused: boolean;
  timeline_duration_us?: number;
  duration_us?: { video: number; audio?: number };
  clips?: number;
  chunks?: number;
  sync?: SyncSample[];
  elapsed_ms?: number;
  timings_ms?: Partial<Record<PreviewStage, number>>;
}

class PreviewFail extends Error {
  constructor(readonly error: JobError, readonly status: "failed" | "cancelled" | "blocked" = "failed") {
    super(error.message);
  }
}

/** Аргументы ffmpeg куска: точный `-ss`/`-t` входа, граф из файла, видео H.264, звук PCM. */
export function chunkArgs(proxy: string, script: string, out: string, chunk: PreviewChunk, fpsRate: string, gop: number, audio: boolean): string[] {
  return [
    "-protocol_whitelist", "file", "-ss", (chunk.seekUs / 1e6).toFixed(6), "-t", (chunk.readUs / 1e6).toFixed(6), "-f", "mov", "-i", `file:${proxy}`,
    "-filter_complex_script", script,
    "-map", "[v]", ...(audio ? ["-map", "[a]"] : []),
    "-fps_mode", "cfr", "-r", fpsRate,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-g", String(gop), "-pix_fmt", "yuv420p",
    ...(audio ? ["-c:a", "pcm_s16le", "-ar", String(PREVIEW_SAMPLE_RATE)] : []),
    "-map_metadata", "-1", "-n", out,
  ];
}

/** Склейка кусков: видео копируется, звук — AAC 128k. */
export function concatArgs(list: string, out: string, audio: boolean): string[] {
  return [
    "-protocol_whitelist", "file", "-f", "concat", "-safe", "1", "-i", `file:${list}`,
    "-map", "0:v:0", ...(audio ? ["-map", "0:a:0"] : []),
    "-c:v", "copy", ...(audio ? ["-c:a", "aac", "-b:a", "128k", "-ar", String(PREVIEW_SAMPLE_RATE)] : []),
    "-movflags", "+faststart", "-map_metadata", "-1", "-n", out,
  ];
}

/** Длительности потоков файла по ffprobe, µs. */
export async function streamDurations(path: string, o: { run?: JobContext["run"]; signal?: AbortSignal } = {}): Promise<{ video?: number; audio?: number }> {
  const r = await runTool("ffprobe", ["-v", "error", "-protocol_whitelist", "file", "-show_entries", "stream=codec_type,duration", "-of", "json", `file:${path}`], o);
  if (r.code !== 0) throw new Error(`ffprobe превью: код ${r.code}: ${r.stderrTail.slice(-500)}`);
  const j = JSON.parse(r.stdout) as { streams?: { codec_type?: string; duration?: string }[] };
  const out: { video?: number; audio?: number } = {};
  for (const s of j.streams ?? []) {
    const us = Math.round(Number(s.duration) * 1e6);
    if (!Number.isFinite(us)) continue;
    if (s.codec_type === "video" && out.video === undefined) out.video = us;
    if (s.codec_type === "audio" && out.audio === undefined) out.audio = us;
  }
  return out;
}

const frameUs = (tl: EditedTimeline) => (1e6 * tl.fps.den) / tl.fps.num;

export function roughcutPreview(depsOf: (ctx: JobContext) => RoughcutPreviewDeps): JobHandler {
  return async (ctx) => {
    const d = depsOf(ctx);
    const fail = (error: JobError, status: "failed" | "cancelled" | "blocked" = "failed"): HandlerResult => ({ status, error });
    const prep = (message: string) => fail({ code: "pipeline", stage: "prepare", message });
    const parsed = RoughcutPreviewInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return prep(`вход roughcut.preview не годится: ${parsed.error.message}`);
    const input = parsed.data;
    const edl = edls.get(ctx.db, input.edlId);
    if (!edl || edl.current_revision === null) return prep(`EDL ${input.edlId} нет`);
    if (edl.project_id !== ctx.job.project_id) return prep(`EDL ${input.edlId} не из проекта задачи ${ctx.job.project_id}`);
    const revision = input.revision ?? edl.current_revision;
    let tl: EditedTimeline;
    try {
      tl = timelineFor(ctx.db, edl.id, revision);
    } catch (e) {
      if (e instanceof EditError) return prep(errText(e));
      throw e;
    }
    const root = d.root;
    const destRel = artifactPaths(root, edl.project_id).previewRev(edl.id, revision);
    const relPath = `${destRel}/${PREVIEW_FILE}`;
    const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
    const signal = ctx.signal;
    const run = ctx.run;
    const started = Date.now();
    const timings: Partial<Record<PreviewStage, number>> = {};
    let stage: PreviewStage = "prepare";
    let t0 = Date.now();
    const enter = async (s: PreviewStage, p: number) => {
      timings[stage] = (timings[stage] ?? 0) + (Date.now() - t0);
      stage = s;
      t0 = Date.now();
      ctx.progress(p, s);
      await d.onStage?.(s);
      signal.throwIfAborted();
    };
    const reused = async (why: string): Promise<HandlerResult> => {
      ctx.emit("preview_reused", why);
      const meta = await readFile(join(root, destRel, PREVIEW_META), "utf8").then((x) => JSON.parse(x) as Partial<RoughcutPreviewResult>, () => ({}));
      return done({ ...meta, edl_id: edl.id, revision, rel_path: relPath, reused: true });
    };
    let draftDir: string | undefined;
    let workdir: string | undefined;

    try {
      if (isPublished(ctx.db, destRel)) return await reused(`превью r${revision} уже опубликовано: не строится второй раз`);
      const asset = media.get(ctx.db, edl.media_id);
      if (!asset) throw new PreviewFail({ code: "pipeline", stage: "prepare", message: `исходника ${edl.media_id} нет` });
      const proxyRow = media.derivatives(ctx.db, asset.id).find((x) => x.kind === "proxy");
      if (!proxyRow) throw new PreviewFail({ code: "pipeline", stage: "prepare", message: `у исходника ${asset.id} нет прокси` });
      const status = await d.storage();
      if (!status.ok) throw new PreviewFail({ code: "storage_unavailable", stage: "storage", message: `${status.reason}: ${status.detail}` });
      const proxy = join(root, proxyRow.rel_path);
      const audio = asset.probe.audio !== undefined;
      const chunks = previewChunks(tl.clips, tl.fps, PREVIEW_SAMPLE_RATE, d.chunkClips ?? PREVIEW_CHUNK_CLIPS);
      if (chunks.length === 0) throw new PreviewFail({ code: "pipeline", stage: "prepare", message: `в таймлайне r${revision} нет ни одного клипа от кадра: всё вырезано` });
      const tmpRoot = await safeMkdir(root, "run/tmp");
      await dropStale(tmpRoot, fence.jobId, fence.attempt);
      workdir = await mkdtemp(join(tmpRoot, `${fence.jobId}-a${fence.attempt}-preview-`));
      draftDir = (await createJobDraft(root, { runId: fence.jobId, attempt: fence.attempt })).dir;
      const rate = `${tl.fps.num}/${tl.fps.den}`;
      const gop = Math.max(1, Math.round((2 * tl.fps.num) / tl.fps.den));
      const totalFrames = chunks.reduce((s, c) => s + c.frames, 0);
      // звук прокси бывает короче видео (запись звука оборвалась раньше): хвост — тишиной
      const audioEndUs = audio ? (await streamDurations(proxy, { run, signal })).audio : undefined;

      await enter("render", 0.02);
      const release = await ctx.renders.acquire(signal);
      try {
        let doneFrames = 0;
        const names: string[] = [];
        for (const [k, c] of chunks.entries()) {
          const name = `chunk_${String(k).padStart(4, "0")}.mov`;
          const script = join(workdir, `chunk_${String(k).padStart(4, "0")}.filter`);
          await writeFile(script, buildPreviewFilter(c.clips, tl.fps, PREVIEW_SAMPLE_RATE, d.roughcut.fadeUs, {
            frameOffset: c.frameOffset, sampleOffset: c.sampleOffset, audio, ...(audioEndUs !== undefined ? { audioEndUs } : {}),
          }));
          const chunkUs = Math.round((c.frames * 1e6 * tl.fps.den) / tl.fps.num);
          await runFfmpeg(chunkArgs(proxy, script, join(workdir, name), c, rate, gop, audio), {
            run, signal, durationUs: chunkUs,
            onProgress: (p) => ctx.progress(0.02 + 0.8 * ((doneFrames + p * c.frames) / totalFrames), "render"),
          });
          doneFrames += c.frames;
          names.push(name);
        }
        await enter("concat", 0.83);
        const list = join(workdir, "chunks.ffconcat");
        await writeFile(list, ["ffconcat version 1.0", ...names.map((n) => `file '${n}'`)].join("\n") + "\n");
        await runFfmpeg(concatArgs(list, join(draftDir, PREVIEW_FILE), audio), { run, signal, durationUs: tl.duration_us, onProgress: (p) => ctx.progress(0.83 + 0.07 * p, "concat") });
      } finally {
        release();
      }

      await enter("check", 0.9);
      const preview = join(draftDir, PREVIEW_FILE);
      const dur = await streamDurations(preview, { run, signal });
      const tol = frameUs(tl) + 1;
      const bad = (x: number | undefined) => x === undefined || Math.abs(x - tl.duration_us) > tol;
      if (bad(dur.video) || (audio && bad(dur.audio))) {
        throw new PreviewFail({ code: "pipeline", stage: "probe", message: `длительность превью не равна таймлайну ± кадр: видео ${dur.video ?? "—"} µs, звук ${dur.audio ?? "—"} µs, таймлайн ${tl.duration_us} µs` });
      }
      let sync: SyncSample[] | undefined;
      const syncN = d.syncWords ?? 5;
      const audioRow = media.derivatives(ctx.db, asset.id).find((x) => x.kind === "audio16k");
      const t = transcripts.get(ctx.db, edl.transcript_id);
      if (audio && syncN > 0 && audioRow && t?.current_revision) {
        const words = transcripts.words(ctx.db, t.id, t.current_revision).map((w) => ({ id: w.word_id, start_us: w.start_us, end_us: w.end_us }));
        const wav16 = join(workdir, "preview16k.wav");
        await runFfmpeg(["-protocol_whitelist", "file", "-f", "mov", "-i", `file:${preview}`, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-n", wav16], { run, signal });
        const src = await wavPcm(join(root, audioRow.rel_path));
        const prev = await wavPcm(wav16);
        try {
          sync = await syncCheck(src, prev, tl, words, syncN);
        } finally {
          await src.close();
          await prev.close();
        }
        ctx.emit("sync_check", `синхронность звука превью по ${sync.length} словам: ${sync.map((s) => `${s.word_id} ${(s.offset_us / 1000).toFixed(1)} мс`).join(", ")}`, { sync });
        const off = sync.filter((s) => s.corr >= SYNC_MIN_CORR && Math.abs(s.offset_us) > frameUs(tl));
        if (off.length > 0) {
          throw new PreviewFail({ code: "pipeline", stage: "probe", message: `звук превью смещён больше чем на кадр: ${off.map((s) => `${s.word_id} ${(s.offset_us / 1000).toFixed(1)} мс`).join(", ")}` });
        }
      }

      await enter("publish", 0.96);
      const result: RoughcutPreviewResult = {
        edl_id: edl.id, revision, rel_path: relPath, reused: false, timeline_duration_us: tl.duration_us,
        duration_us: { video: dur.video!, ...(dur.audio !== undefined ? { audio: dur.audio } : {}) },
        clips: chunks.reduce((s, c) => s + c.clips.length, 0), chunks: chunks.length, ...(sync ? { sync } : {}), elapsed_ms: Date.now() - started,
      };
      await fsyncWrite(join(draftDir, PREVIEW_META), JSON.stringify({ ...result, source: { proxy: proxyRow.rel_path, proxy_sha256: proxyRow.sha256 }, fps: tl.fps }, null, 2) + "\n");
      const store = new ArtifactStore({ root, db: ctx.db, guard: d.storage });
      try {
        await store.publish(draftDir, destRel, () => undefined, fence);
      } catch (e) {
        // параллельная задача успела опубликовать то же превью: оно и есть результат
        if (e instanceof ArtifactExistsError) {
          await dropDraft(draftDir);
          await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
          return await reused(`превью r${revision} опубликовала другая задача`);
        }
        throw e;
      }
      timings.publish = (timings.publish ?? 0) + (Date.now() - t0);
      await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
      d.log?.(`preview ${edl.id} r${revision}: ${result.clips} клипов, ${chunks.length} кусков, ${(tl.duration_us / 1e6).toFixed(1)} с за ${((Date.now() - started) / 1000).toFixed(1)} с`);
      return done({ ...result, elapsed_ms: Date.now() - started, timings_ms: timings });
    } catch (e) {
      return await failed(e);
    }

    function done(r: RoughcutPreviewResult): HandlerResult {
      ctx.progress(1, "done");
      return { status: "completed", outputRefs: r };
    }

    async function failed(e: unknown): Promise<HandlerResult> {
      const msg = errText(e);
      const cancelled = () => jobs.get(ctx.db, ctx.job.id)?.cancel_requested === true;
      const dropWork = () => (workdir ? rm(workdir, { recursive: true, force: true }).catch(() => undefined) : undefined);
      if (e instanceof FfmpegError && e.kind === "orphaned") {
        // процесс жив — draft в карантин, рабочий каталог не трогаем (ADR 0007, rulings п. 13)
        if (draftDir && existsSync(draftDir)) await quarantineDir(draftDir, `stale_process: ${stage}: ${msg}`).catch(() => undefined);
        return fail({ code: "stale_process", stage: "orphaned", message: `${stage}: ${msg}` }, "blocked");
      }
      await dropWork();
      if (e instanceof FencedOutError) return fail({ code: "fenced_out", stage: "fenced_out", message: msg });
      if (e instanceof PublishCancelledError) return fail({ code: "cancelled", stage: "cancelled", message: msg }, "cancelled");
      await dropDraft(draftDir);
      if (e instanceof PreviewFail) return fail(e.error, e.status);
      if (signal.aborted || (e instanceof FfmpegError && e.kind === "aborted") || (e instanceof Error && e.name === "AbortError")) {
        if (cancelled()) return fail({ code: "cancelled", stage: "cancelled", message: `превью отменено на этапе ${stage}` }, "cancelled");
        return fail({ code: "interrupted", stage: "interrupted", message: `попытка прервана на этапе ${stage}` });
      }
      if (isStorageError(e)) return fail({ code: "storage_unavailable", stage: "storage", message: msg });
      const now = await d.storage().catch(() => undefined);
      if (!now || !now.ok) return fail({ code: "storage_unavailable", stage: "storage", message: `${now ? `${now.reason}: ${now.detail}; ` : ""}${stage}: ${msg}` });
      if (e instanceof FfmpegError && ffmpegFailureKind(msg) === "low_space") return fail({ code: "low_space", message: `low_space: ${msg}` });
      if (stage === "publish") return fail({ code: "pipeline", stage: "publish", message: msg });
      return fail({ code: "pipeline", stage: "render", message: `${stage}: ${msg}` });
    }
  };
}

async function dropDraft(dir: string | undefined): Promise<void> {
  if (!dir || !existsSync(dir) || existsSync(join(dir, QUARANTINE))) return;
  await setWritable(dir).catch(() => undefined);
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/** Рабочие каталоги превью прежних попыток этой задачи. */
async function dropStale(tmpRoot: string, jobId: string, attempt: number): Promise<void> {
  if (!existsSync(tmpRoot)) return;
  const re = new RegExp(`^${jobId}-a(\\d+)-preview-`);
  for (const name of await readdir(tmpRoot)) {
    const m = re.exec(name);
    if (m && Number(m[1]) < attempt) await rm(join(tmpRoot, name), { recursive: true, force: true }).catch(() => undefined);
  }
}
