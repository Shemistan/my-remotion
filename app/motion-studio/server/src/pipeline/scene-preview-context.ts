// Задача `scene.preview_context` (Task 38-39): превью версии видеосцены поверх исходника с
// полями `video.contextPadFrames` до и после — как сцена встанет в ролик. Окно `[start − pad,
// end + pad)` кадров таймлайна (`timeline_fps` EDL ревизии плана), композиция `ProjectTimeline`
// из одной сцены (тот же движок, что у финала, ADR 0010): исходник — CFR-прокси (кадр N прокси =
// кадр N master), звук — `buildEditedAudio(прокси)`, `renderTimelineRange` в масштабе 0,5.
// Публикация — `context/<scene>/<version>@r<план>-p<поля>/preview.mp4` + `preview.json`
// (иммутабельно; ключ — версия, ревизия плана, поля: ревью I2).
//
// Замка нет (читает иммутабельное): повтор и параллельная задача не падают на существующем
// каталоге — опубликованное превью и есть результат (`reused: true`). Окно — по текущей ревизии
// плана (сцена там принята), иначе по ревизии генерации (`plan_outdated: true`). Размещение
// (overlay/fullscreen, прозрачность) — из генерации, создавшей версию (у правки — предка), а не
// последней задачи генерации сцены (ревью I3). Устарело ли опубликованное — `contextPreviewState`.
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { type EditedTimeline, type JobError, clipsToSequences, timelineFrames, videoSceneFrames } from "@ms/contracts";
import { safeMkdir } from "@ms/core";
import { renderTimelineRange } from "@ms/render";
import { z } from "zod";
import { currentProjectStyle } from "../analysis/project-style.js";
import { createJobDraft } from "../artifacts/job-draft.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactExistsError, ArtifactStore, isPublished } from "../artifacts/store.js";
import * as edls from "../db/repos/edls.js";
import * as jobs from "../db/repos/jobs.js";
import * as media from "../db/repos/media.js";
import * as scenes from "../db/repos/scenes.js";
import * as versions from "../db/repos/versions.js";
import { timelineFor } from "../edit/timeline-store.js";
import type { HandlerResult, JobHandler } from "../jobs/types.js";
import { buildEditedAudio } from "../media/edited-audio.js";
import { FfmpegError } from "../media/ffmpeg.js";
import { FencedOutError, PublishCancelledError } from "../scenes/repo.js";
import { checkSceneDir } from "../scenes/static-check.js";
import { QUARANTINE, fsyncWrite, quarantineDir, setWritable } from "../scenes/store.js";
import type { Phase46Deps } from "./phase46-deps.js";
import { CONTEXT_PREVIEW_FILE, CONTEXT_PREVIEW_META, previewPlanItem } from "../video-scenes/context-preview.js";
import { videoItemFingerprint } from "../video-scenes/fingerprint.js";
import { versionVideoContext, versionVideoFingerprint } from "../video-scenes/origin.js";
import { errText, isStorageError } from "./steps.js";

export interface ScenePreviewContextDeps extends Phase46Deps {
  /** Подмены тестов: рендер диапазона и дорожка звука. */
  renderRange?: typeof renderTimelineRange;
  editedAudio?: typeof buildEditedAudio;
}

export const ScenePreviewContextInputSchema = z.object({
  sceneId: z.string().min(1),
  /** Версия сцены; по умолчанию — утверждённая (C), иначе текущая. */
  versionId: z.string().min(1).optional(),
  /** Поля до и после сцены, кадров; по умолчанию `video.contextPadFrames`. */
  padFrames: z.number().int().min(0).max(600).optional(),
}).strict();
export type ScenePreviewContextInput = z.infer<typeof ScenePreviewContextInputSchema>;

export { CONTEXT_PREVIEW_FILE, CONTEXT_PREVIEW_META, contextPreviewState } from "../video-scenes/context-preview.js";
/** Масштаб превью к кадру сцены (половина, как превью версии). */
export const CONTEXT_PREVIEW_SCALE = 0.5;
const RENDER_TIMEOUT_MS = 20 * 60_000;

export interface ScenePreviewContextResult {
  scene_id: string;
  version_id: string;
  version_number: number;
  item_id: string;
  plan: { id: string; revision: number };
  edl: { id: string; revision: number };
  /** Кадры таймлайна `[первый, последний]` превью и окно сцены `[start, end)`. */
  range: [number, number];
  scene_frames: { start: number; end: number };
  pad_frames: number;
  rel_path: string;
  reused: boolean;
  /** Окно — по ревизии генерации: сцены нет среди принятых в текущей ревизии плана. */
  plan_outdated?: boolean;
  duration_ms?: number;
  width?: number;
  height?: number;
  warnings?: string[];
  elapsed_ms?: number;
}

class Fail extends Error {
  constructor(readonly error: JobError, readonly status: "failed" | "blocked" = "failed") {
    super(error.message);
  }
}
/** Начало кадра `f` таймлайна, µs. */
const frameUs = (f: number, fps: { num: number; den: number }): number => Math.round((f * 1e6 * fps.den) / fps.num);
const prep = (message: string) => new Fail({ code: "pipeline", stage: "prepare", message });

export function scenePreviewContext(depsOf: () => ScenePreviewContextDeps): JobHandler {
  return async (ctx) => {
    const d = depsOf();
    const root = d.svc.root;
    const storage = d.svc.storageCheck;
    const fail = (error: JobError, status: "failed" | "cancelled" | "blocked" = "failed"): HandlerResult => ({ status, error });
    const parsed = ScenePreviewContextInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return fail({ code: "pipeline", stage: "prepare", message: `вход scene.preview_context не годится: ${parsed.error.message}` });
    const input = parsed.data;
    const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
    const signal = ctx.signal;
    const started = Date.now();
    let stage = "prepare";
    let draftDir: string | undefined;
    let workdir: string | undefined;
    const done = (r: ScenePreviewContextResult): HandlerResult => {
      ctx.progress(1, "done");
      return { status: "completed", outputRefs: r };
    };

    try {
      const scene = scenes.get(ctx.db, input.sceneId);
      if (!scene) throw prep(`сцены нет: ${input.sceneId}`);
      if (scene.project_id !== ctx.job.project_id) throw prep(`сцена ${scene.id} не из проекта задачи ${ctx.job.project_id}`);
      const versionId = input.versionId ?? scene.approved_version_id ?? scene.current_version_id ?? undefined;
      const ver = versionId ? versions.get(ctx.db, versionId) : undefined;
      if (!ver || ver.scene_id !== scene.id) throw prep(`версии ${versionId ?? "—"} нет у сцены ${scene.id}`);
      if (ver.status !== "ready" || ver.broken_reason) throw prep(`версия v${ver.number} не готова: ${ver.broken_reason ?? ver.status}`);
      // контекст генерации, создавшей версию (у правки — предка): размещение версии, не последней генерации
      const vctx = versionVideoContext(ctx.db, ver.id);
      if (!vctx) throw prep(`версия v${ver.number} сцены ${scene.id} — не видеосцена (нет входа video у её генерации)`);
      const at = previewPlanItem(ctx.db, root, vctx);
      if (!at) throw prep(`сцены ${vctx.item_id} нет в плане ${vctx.plan_id}`);
      const { doc, item, current } = at;
      const edlRef = { id: doc.inputs.edl.id, revision: doc.inputs.edl.revision };
      const tl: EditedTimeline = timelineFor(ctx.db, edlRef.id, edlRef.revision);
      const total = timelineFrames(tl);
      const pad = input.padFrames ?? d.svc.config.video.contextPadFrames;
      const sceneFrames = { start: item.frames.start, end: item.frames.start + videoSceneFrames(item) };
      const range: [number, number] = [Math.max(0, sceneFrames.start - pad), Math.min(total, sceneFrames.end + pad) - 1];
      if (sceneFrames.end > total) throw prep(`сцена ${item.id} кончается на кадре ${sceneFrames.end}, а ролик — на ${total}`);
      const destRel = artifactPaths(root, scene.project_id).contextPreview(scene.id, ver.id, doc.revision, pad);
      const relPath = `${destRel}/${CONTEXT_PREVIEW_FILE}`;
      const base: ScenePreviewContextResult = {
        scene_id: scene.id, version_id: ver.id, version_number: ver.number, item_id: item.id, plan: { id: doc.plan_id, revision: doc.revision }, edl: edlRef,
        range, scene_frames: sceneFrames, pad_frames: pad, rel_path: relPath, reused: false, ...(current ? {} : { plan_outdated: true }),
      };
      const reused = async (why: string): Promise<HandlerResult> => {
        ctx.emit("preview_reused", why);
        const meta = await readFile(join(root, destRel, CONTEXT_PREVIEW_META), "utf8").then((x) => JSON.parse(x) as Partial<ScenePreviewContextResult>, () => ({}));
        return done({ ...base, ...meta, rel_path: relPath, reused: true } as ScenePreviewContextResult);
      };
      if (isPublished(ctx.db, destRel)) return await reused(`превью версии v${ver.number} по плану r${doc.revision} уже опубликовано`);

      const warnings: string[] = [];
      if (!current) warnings.push(`сцены ${item.id} нет среди принятых в текущем плане — окно по ревизии генерации r${doc.revision}`);
      const style = currentProjectStyle(ctx.db, root, scene.project_id);
      const made = versionVideoFingerprint(ctx.db, ver.id);
      if (current && style && made !== undefined && made !== videoItemFingerprint(item, { id: style.style_id, revision: style.revision })) {
        warnings.push(`версия v${ver.number} сделана не по текущей сцене плана r${doc.revision} — размещение по её генерации, окно по плану; перегенерируйте сцену`);
      }
      if (ver.settings.duration_frames !== videoSceneFrames(item)) warnings.push(`версия длиной ${ver.settings.duration_frames} кадров, а сцена плана — ${videoSceneFrames(item)}: в превью — по плану`);
      if (ver.settings.fps.num * tl.fps.den !== tl.fps.num * ver.settings.fps.den) throw prep(`fps версии ${ver.settings.fps.num}/${ver.settings.fps.den} ≠ fps таймлайна ${tl.fps.num}/${tl.fps.den}`);
      const edl = edls.get(ctx.db, edlRef.id);
      const asset = edl ? media.get(ctx.db, edl.media_id) : undefined;
      if (!asset) throw prep(`исходника EDL ${edlRef.id} нет`);
      const proxyRow = media.derivatives(ctx.db, asset.id).find((x) => x.kind === "proxy");
      if (!proxyRow) throw prep(`у исходника ${asset.id} нет прокси`);
      const st = await storage();
      if (!st.ok) throw new Fail({ code: "storage_unavailable", stage: "storage", message: `${st.reason}: ${st.detail}` });
      const proxy = join(root, proxyRow.rel_path);
      const props = JSON.parse(await readFile(join(root, ver.path, "props.json"), "utf8")) as Record<string, unknown>;

      const tmpRoot = await safeMkdir(root, "run/tmp");
      await dropStale(tmpRoot, fence.jobId, fence.attempt);
      workdir = await mkdtemp(join(tmpRoot, `${fence.jobId}-a${fence.attempt}-ctx-`));
      draftDir = (await createJobDraft(root, { runId: fence.jobId, attempt: fence.attempt })).dir;
      const run = ctx.run;

      stage = "audio";
      ctx.progress(0.05, stage);
      const audio = asset.probe.audio !== undefined
        ? await (d.editedAudio ?? buildEditedAudio)({
          input: proxy, tl, fadeUs: d.svc.config.roughcut.fadeUs, out: join(workdir, "edited-audio.wav"), run, signal,
          // звук только окна превью: проход 1 читает участок прокси, а не весь ролик
          window: { startUs: frameUs(range[0], tl.fps), endUs: frameUs(range[1] + 1, tl.fps) },
        })
        : undefined;

      stage = "render";
      ctx.progress(0.15, stage);
      signal.throwIfAborted();
      const release = await ctx.renders.acquire(signal);
      let r: Awaited<ReturnType<typeof renderTimelineRange>>;
      try {
        r = await (d.renderRange ?? renderTimelineRange)({
          props: {
            width: ver.settings.width, height: ver.settings.height, fps: tl.fps, duration_frames: total,
            video: { path: proxy, sequences: clipsToSequences(tl) },
            ...(audio ? { audio: { path: audio.path } } : {}),
            scenes: [{ clip_id: `clip_${item.id}`, key: "S0", props, start_frame: sceneFrames.start, duration_frames: sceneFrames.end - sceneFrames.start, transparent: vctx.placement.transparent, z: vctx.placement.transparent ? 1 : 0 }],
          },
          versionDirs: { S0: join(root, ver.path) },
          cacheDir: await safeMkdir(root, "cache"),
          check: checkSceneDir,
          range,
          stills: [],
          output: { path: join(draftDir, CONTEXT_PREVIEW_FILE), codec: "h264", crf: 23, scale: CONTEXT_PREVIEW_SCALE, audioBitrateKbps: 128, x264Preset: "veryfast" },
          timeoutMs: RENDER_TIMEOUT_MS,
          run,
        }, signal);
      } finally {
        release();
      }
      if (!r.ok) {
        const e = r.error!;
        if (e.stage === "orphaned") throw new Fail({ code: "stale_process", stage: "orphaned", message: e.message }, "blocked");
        if (e.stage === "aborted") throw Object.assign(new Error(e.message), { name: "AbortError" });
        throw new Fail({ code: "pipeline", stage: "render", message: `${e.stage}: ${e.message}` });
      }

      stage = "check";
      ctx.progress(0.9, stage);
      const frames = range[1] - range[0] + 1;
      const wantMs = (frames * 1000 * tl.fps.den) / tl.fps.num;
      const frameMs = (1000 * tl.fps.den) / tl.fps.num;
      const p = r.probe!;
      if (Math.abs(p.durationMs - wantMs) > frameMs + 1) {
        throw new Fail({ code: "pipeline", stage: "probe", message: `длительность превью ${p.durationMs} мс ≠ ${frames} кадров (${wantMs.toFixed(1)} мс) ± кадр` });
      }

      stage = "publish";
      ctx.progress(0.96, stage);
      const result: ScenePreviewContextResult = { ...base, duration_ms: p.durationMs, width: p.width, height: p.height, ...(warnings.length > 0 ? { warnings } : {}), elapsed_ms: Date.now() - started };
      await fsyncWrite(join(draftDir, CONTEXT_PREVIEW_META), JSON.stringify({ ...result, source: { proxy: proxyRow.rel_path, proxy_sha256: proxyRow.sha256 }, fps: tl.fps, scale: CONTEXT_PREVIEW_SCALE }, null, 2) + "\n");
      const store = new ArtifactStore({ root, db: ctx.db, guard: storage });
      try {
        await store.publish(draftDir, destRel, () => undefined, fence);
      } catch (e) {
        // параллельная задача успела опубликовать превью той же версии: оно и есть результат
        if (e instanceof ArtifactExistsError) {
          await dropDraft(draftDir);
          draftDir = undefined;
          await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
          return await reused(`превью версии v${ver.number} опубликовала другая задача`);
        }
        throw e;
      }
      await rm(workdir, { recursive: true, force: true }).catch(() => undefined);
      for (const w of warnings) ctx.emit("warning", w);
      return done(result);
    } catch (e) {
      const msg = errText(e);
      const dropWork = () => (workdir ? rm(workdir, { recursive: true, force: true }).catch(() => undefined) : undefined);
      const orphaned = (e instanceof FfmpegError && e.kind === "orphaned") || (e instanceof Fail && e.error.code === "stale_process");
      if (orphaned) {
        // процесс жив — draft в карантин, рабочий каталог не трогаем (ADR 0007, rulings п. 13)
        if (draftDir && existsSync(draftDir)) await quarantineDir(draftDir, `stale_process: ${stage}: ${msg}`).catch(() => undefined);
        return fail({ code: "stale_process", stage: "orphaned", message: `${stage}: ${msg}` }, "blocked");
      }
      await dropWork();
      if (e instanceof FencedOutError) return fail({ code: "fenced_out", stage: "fenced_out", message: msg });
      if (e instanceof PublishCancelledError) return fail({ code: "cancelled", stage: "cancelled", message: msg }, "cancelled");
      await dropDraft(draftDir);
      if (e instanceof Fail) return fail(e.error, e.status);
      if (signal.aborted || (e instanceof FfmpegError && e.kind === "aborted") || (e instanceof Error && e.name === "AbortError")) {
        if (jobs.get(ctx.db, ctx.job.id)?.cancel_requested) return fail({ code: "cancelled", stage: "cancelled", message: `превью отменено на этапе ${stage}` }, "cancelled");
        return fail({ code: "interrupted", stage: "interrupted", message: `попытка прервана на этапе ${stage}` });
      }
      if (isStorageError(e)) return fail({ code: "storage_unavailable", stage: "storage", message: msg });
      const now = await storage().catch(() => undefined);
      if (!now || !now.ok) return fail({ code: "storage_unavailable", stage: "storage", message: `${now ? `${now.reason}: ${now.detail}; ` : ""}${stage}: ${msg}` });
      return fail({ code: "pipeline", stage: stage === "publish" ? "publish" : "render", message: `${stage}: ${msg}` });
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
  const re = new RegExp(`^${jobId}-a(\\d+)-ctx-`);
  for (const name of await readdir(tmpRoot)) {
    const m = re.exec(name);
    if (m && Number(m[1]) < attempt) await rm(join(tmpRoot, name), { recursive: true, force: true }).catch(() => undefined);
  }
}
