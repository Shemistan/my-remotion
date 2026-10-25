// Задача `timeline.preview` (Task 42, ADR 0010): превью ревизии таймлайна той же композицией
// `ProjectTimeline`, что финал, — видео прокси (CFR на `timeline_fps`, кадр N = кадр N master)
// кусками EDL, звук `buildEditedAudio(прокси)`, сцены ревизии на весь кадр (прозрачные — через
// `overlayInputProps`); `renderTimelineRange` целиком, масштаб 0,5, CRF 23. Проверка: длительность
// видео = `duration_frames / fps` ± кадр. Публикация с fencing в `preview/<timeline>/r<N>/`
// (`preview.mp4`, `preview.json`): каталог ревизии `timeline/<id>/r<N>` уже опубликован документом и
// закрыт от записи, как у превью EDL. Ревизия иммутабельна — замка нет; опубликованное превью не
// строится второй раз (`reused`).
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { type JobError, type VideoTimelineDoc, outputSize } from "@ms/contracts";
import { safeMkdir } from "@ms/core";
import { type TimelineRenderResult, type TimelineSceneSpec, renderTimelineRange } from "@ms/render";
import { z } from "zod";
import { createJobDraft } from "../artifacts/job-draft.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactExistsError, ArtifactStore, isPublished } from "../artifacts/store.js";
import * as edls from "../db/repos/edls.js";
import * as jobs from "../db/repos/jobs.js";
import * as media from "../db/repos/media.js";
import * as versions from "../db/repos/versions.js";
import { timelineFor } from "../edit/timeline-store.js";
import type { HandlerResult, JobHandler } from "../jobs/types.js";
import { buildEditedAudio } from "../media/edited-audio.js";
import { FfmpegError } from "../media/ffmpeg.js";
import { checkSceneDir } from "../scenes/static-check.js";
import { FencedOutError, PublishCancelledError } from "../scenes/repo.js";
import { QUARANTINE, fsyncWrite, quarantineDir, setWritable } from "../scenes/store.js";
import { TimelineError, readTimelineDoc, timelineRow } from "../timeline/ops.js";
import { type Phase46Deps } from "./phase46-deps.js";
import { errText, isStorageError } from "./steps.js";

export type TimelinePreviewDeps = Phase46Deps;

export const TIMELINE_PREVIEW_FILE = "preview.mp4";
export const TIMELINE_PREVIEW_META = "preview.json";
/** Превью — половина кадра выхода 1080p, x264 CRF 23 veryfast, AAC 128 кбит/с. */
export const TIMELINE_PREVIEW = { scale: 0.5, crf: 23, audioBitrateKbps: 128, x264Preset: "veryfast" as const };

const InputSchema = z.object({ timelineId: z.string().min(1), revision: z.number().int().positive() }).strict();

/** Итог задачи (`output_refs`). */
export interface TimelinePreviewResult {
  timeline_id: string;
  revision: number;
  rel_path: string;
  reused: boolean;
  duration_frames?: number;
  /** Длительность видео файла, мс (ffprobe). */
  duration_ms?: number;
  width?: number;
  height?: number;
  scenes?: number;
  elapsed_ms?: number;
}

/** Подмены для тестов (реестр `handlers.ts` зовёт `timelinePreview` без них). */
export interface TimelinePreviewImpl {
  render?: typeof renderTimelineRange;
  editedAudio?: typeof buildEditedAudio;
}

class PreviewFail extends Error {
  constructor(readonly error: JobError, readonly status: "failed" | "cancelled" | "blocked" = "failed") {
    super(error.message);
  }
}

/** Таймаут рендера: не меньше 10 мин, иначе 250 мс на кадр (половинный размер, veryfast). */
export const previewTimeoutMs = (doc: Pick<VideoTimelineDoc, "duration_frames">): number => Math.max(600_000, doc.duration_frames * 250);

export function timelinePreviewWith(depsOf: () => TimelinePreviewDeps, impl: TimelinePreviewImpl = {}): JobHandler {
  return async (ctx) => {
    const fail = (error: JobError, status: "failed" | "cancelled" | "blocked" = "failed"): HandlerResult => ({ status, error });
    const prep = (message: string) => fail({ code: "pipeline", stage: "prepare", message });
    const parsed = InputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return prep(`вход timeline.preview не годится: ${parsed.error.message}`);
    const { timelineId, revision } = parsed.data;
    const t = timelineRow(ctx.db, timelineId);
    if (!t) return prep(`таймлайна ${timelineId} нет`);
    if (t.project_id !== ctx.job.project_id) return prep(`таймлайн ${timelineId} не из проекта задачи ${ctx.job.project_id}`);
    const { svc, options } = depsOf();
    const root = svc.root;
    const storage = svc.storageCheck;
    const destRel = artifactPaths(root, t.project_id).previewRev(timelineId, revision);
    const relPath = `${destRel}/${TIMELINE_PREVIEW_FILE}`;
    const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
    const { signal, run } = ctx;
    const started = Date.now();
    let stage = "prepare";
    let draftDir: string | undefined;
    let workdir: string | undefined;
    const done = (r: TimelinePreviewResult): HandlerResult => {
      ctx.progress(1, "done");
      return { status: "completed", outputRefs: r };
    };
    const reused = async (why: string): Promise<HandlerResult> => {
      ctx.emit("preview_reused", why);
      const meta = await readFile(join(root, destRel, TIMELINE_PREVIEW_META), "utf8").then((x) => JSON.parse(x) as Partial<TimelinePreviewResult>, () => ({}));
      return done({ ...meta, timeline_id: timelineId, revision, rel_path: relPath, reused: true });
    };

    try {
      if (isPublished(ctx.db, destRel)) return await reused(`превью таймлайна r${revision} уже опубликовано: не строится второй раз`);
      let doc: VideoTimelineDoc;
      try {
        doc = readTimelineDoc(ctx.db, root, timelineId, revision);
      } catch (e) {
        if (e instanceof TimelineError) throw new PreviewFail({ code: "pipeline", stage: "prepare", message: errText(e) });
        throw e;
      }
      const edl = edls.get(ctx.db, doc.inputs.edl.id);
      const asset = edl ? media.get(ctx.db, edl.media_id) : undefined;
      if (!edl || !asset) throw new PreviewFail({ code: "pipeline", stage: "prepare", message: `нет EDL ${doc.inputs.edl.id} или его исходника` });
      const proxyRow = media.derivatives(ctx.db, asset.id).find((x) => x.kind === "proxy");
      if (!proxyRow) throw new PreviewFail({ code: "pipeline", stage: "prepare", message: `у исходника ${asset.id} нет прокси` });
      const tl = timelineFor(ctx.db, edl.id, doc.inputs.edl.revision);
      const scenes: TimelineSceneSpec[] = [];
      const versionDirs: Record<string, string> = {};
      for (const c of doc.scenes) {
        const v = versions.get(ctx.db, c.version_id);
        if (!v || v.status !== "ready" || v.broken_reason !== null) throw new PreviewFail({ code: "version_failed", stage: "prepare", message: `версия ${c.version_id} сцены ${c.item_id} не готова или сломана` });
        const dir = join(root, v.path);
        const props = JSON.parse(await readFile(join(dir, "props.json"), "utf8")) as Record<string, unknown>;
        versionDirs[c.version_id] = dir;
        scenes.push({ clip_id: c.clip_id, key: c.version_id, props, start_frame: c.start_frame, duration_frames: c.duration_frames, transparent: c.placement.transparent, z: c.z });
      }
      const status = await storage();
      if (!status.ok) throw new PreviewFail({ code: "storage_unavailable", stage: "storage", message: `${status.reason}: ${status.detail}` });
      const proxy = join(root, proxyRow.rel_path);
      const tmpRoot = await safeMkdir(root, "run/tmp");
      workdir = await mkdtemp(join(tmpRoot, `${fence.jobId}-a${fence.attempt}-tlpreview-`));
      draftDir = (await createJobDraft(root, { runId: fence.jobId, attempt: fence.attempt })).dir;
      const cacheDir = await safeMkdir(root, "cache");

      let audio: { path: string } | undefined;
      if (asset.probe.audio) {
        stage = "render";
        ctx.progress(0.05, "render");
        const a = await (impl.editedAudio ?? buildEditedAudio)({ input: proxy, demuxer: "mov", tl, fadeUs: svc.config.roughcut.fadeUs, out: join(workdir, "edited-audio.wav"), run, signal });
        audio = { path: a.path };
      }
      stage = "render";
      ctx.progress(0.1, "render");
      const size = outputSize({ width: asset.probe.video.display_width, height: asset.probe.video.display_height }, "1080p");
      const out = join(draftDir, TIMELINE_PREVIEW_FILE);
      const release = await ctx.renders.acquire(signal);
      let r: TimelineRenderResult;
      try {
        r = await (impl.render ?? renderTimelineRange)({
          props: { ...size, fps: doc.fps, duration_frames: doc.duration_frames, video: { path: proxy, sequences: doc.video }, ...(audio ? { audio } : {}), scenes },
          versionDirs, cacheDir, check: options.check ?? checkSceneDir, stills: [],
          output: { path: out, codec: "h264", ...TIMELINE_PREVIEW },
          timeoutMs: previewTimeoutMs(doc), run,
        }, signal);
      } finally {
        release();
      }
      if (!r.ok) {
        const e = r.error!;
        if (e.stage === "orphaned") throw new PreviewFail({ code: "stale_process", stage: "orphaned", message: `рендер таймлайна: ${e.message}` }, "blocked");
        if (e.stage === "aborted") throw Object.assign(new Error(`рендер таймлайна прерван: ${e.message}`), { name: "AbortError" });
        throw new PreviewFail({ code: "pipeline", stage: "render", message: `рендер таймлайна: ${e.stage}: ${e.message}` });
      }
      stage = "check";
      ctx.progress(0.9, "check");
      const p = r.probe;
      const expectMs = (doc.duration_frames * 1000 * doc.fps.den) / doc.fps.num;
      const frameMs = (1000 * doc.fps.den) / doc.fps.num;
      if (!p || Math.abs(p.durationMs - expectMs) > frameMs + 1) {
        throw new PreviewFail({ code: "pipeline", stage: "probe", message: `длительность превью ${p?.durationMs ?? "—"} мс ≠ ${doc.duration_frames} кадров (${expectMs.toFixed(1)} мс) ± кадр` });
      }
      stage = "publish";
      ctx.progress(0.95, "publish");
      const result: TimelinePreviewResult = {
        timeline_id: timelineId, revision, rel_path: relPath, reused: false, duration_frames: doc.duration_frames, duration_ms: p.durationMs,
        width: p.width, height: p.height, scenes: scenes.length, elapsed_ms: Date.now() - started,
      };
      await fsyncWrite(join(draftDir, TIMELINE_PREVIEW_META), JSON.stringify({ ...result, fps: doc.fps, source: { proxy: proxyRow.rel_path, proxy_sha256: proxyRow.sha256 }, probe: p }, null, 2) + "\n");
      const store = new ArtifactStore({ root, db: ctx.db, guard: storage });
      try {
        await store.publish(draftDir, destRel, () => undefined, fence);
      } catch (e) {
        if (e instanceof ArtifactExistsError) {
          await dropDraft(draftDir);
          await dropWork();
          return await reused(`превью таймлайна r${revision} опубликовала другая задача`);
        }
        throw e;
      }
      await dropWork();
      ctx.emit("timeline_preview", `превью таймлайна ${timelineId} r${revision}: ${scenes.length} сцен, ${(p.durationMs / 1000).toFixed(1)} с, ${p.width}×${p.height} за ${((Date.now() - started) / 1000).toFixed(1)} с`);
      return done({ ...result, elapsed_ms: Date.now() - started });
    } catch (e) {
      return await failed(e);
    }

    async function dropWork(): Promise<void> {
      if (workdir) await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
    }

    async function failed(e: unknown): Promise<HandlerResult> {
      const msg = errText(e);
      const alive = (e instanceof FfmpegError && e.kind === "orphaned") || (e instanceof PreviewFail && e.error.code === "stale_process");
      if (alive) {
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
        if (jobs.get(ctx.db, ctx.job.id)?.cancel_requested === true) return fail({ code: "cancelled", stage: "cancelled", message: `превью таймлайна отменено на этапе ${stage}` }, "cancelled");
        return fail({ code: "interrupted", stage: "interrupted", message: `попытка прервана на этапе ${stage}` });
      }
      if (isStorageError(e)) return fail({ code: "storage_unavailable", stage: "storage", message: msg });
      const now = await storage().catch(() => undefined);
      if (!now || !now.ok) return fail({ code: "storage_unavailable", stage: "storage", message: `${now ? `${now.reason}: ${now.detail}; ` : ""}${stage}: ${msg}` });
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

export const timelinePreview: (depsOf: () => TimelinePreviewDeps) => JobHandler = (depsOf) => timelinePreviewWith(depsOf);
