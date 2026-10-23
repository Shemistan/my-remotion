// Обработчик `media.import` (Task 25): исходное видео проекта → копия в хранилище, прокси,
// audio16k, waveform, миниатюры. Оригинал пользователя только читается (sha256 до/после);
// выходы ffmpeg — только в draft попытки (`assertOutsideSource`). Публикация двумя
// каталогами с fencing: сначала `proxy/<med>/` (производные + manifest.json), затем
// `source/<med>/` (копия оригинала) — в транзакции последней строки `media_assets`,
// `media_derivatives` и настройки проекта. Пока нет строки в БД, `source/` проекта пуст.
//
// Повтор после сбоя (ревью Task 24, M3): id исходника выводится из id задачи (`med_<ULID задачи>`),
// поэтому попытка N+1 находит то, что опубликовала попытка N: прокси этой задачи в
// `artifact_publications` — не пересчитывается и не публикуется второй раз; исходник уже в
// `media_assets` — задача завершается по нему.
import { existsSync, renameSync } from "node:fs";
import { lstat, mkdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  type AspectRatioSchema, type DerivativeKind, type JobError, type MediaAsset, type MediaManifest, MediaManifestSchema, type ProbeSummary,
  type Settings, defaultSettings,
} from "@ms/contracts";
import { type StorageStatus, safeMkdir } from "@ms/core";
import { z } from "zod";
import { createJobDraft } from "../artifacts/job-draft.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactStore, publicationOf } from "../artifacts/store.js";
import type { AppConfig } from "../config.js";
import * as jobs from "../db/repos/jobs.js";
import * as media from "../db/repos/media.js";
import * as projects from "../db/repos/projects.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import { extractAudio16k } from "../media/audio.js";
import { FfmpegError, ffmpegFailureKind, runFfmpeg } from "../media/ffmpeg.js";
import { type ImportFile, assertOutsideSource, isInside, resolveImportFile, videoExt } from "../media/guards.js";
import { copyOriginal } from "../media/import.js";
import { MediaInvalidError, demuxerFor, probeMedia } from "../media/probe.js";
import { proxyArgs } from "../media/proxy.js";
import { checkImportSpace, estimateImportBytes, gib } from "../media/space.js";
import { THUMB_HEIGHT, countThumbs, thumbsArgs } from "../media/thumbs.js";
import { writeWaveform } from "../media/waveform.js";
import { sha256File } from "../scenes/hash.js";
import { FencedOutError, PublishCancelledError } from "../scenes/repo.js";
import { QUARANTINE, fsyncWrite, quarantineDir, setWritable } from "../scenes/store.js";
import { errText, isStorageError } from "./steps.js";

export const MediaImportInputSchema = z.discriminatedUnion("method", [
  z.object({ projectId: z.string().min(1), method: z.literal("path"), path: z.string().min(1) }).strict(),
  z.object({ projectId: z.string().min(1), method: z.literal("upload"), uploadPath: z.string().min(1), originalName: z.string().min(1) }).strict(),
]);
export type MediaImportInput = z.infer<typeof MediaImportInputSchema>;

export const IMPORT_STAGES = ["hash", "space", "copy", "probe", "proxy", "audio16k", "waveform", "thumbs", "publish"] as const;
export type ImportStage = (typeof IMPORT_STAGES)[number];

export interface MediaImportDeps {
  root: string;
  media: AppConfig["media"];
  storage: () => Promise<StorageStatus>;
  /** Порог свободного места StorageGuard (`MS_MIN_FREE_GB`), байт. */
  minFreeBytes: number;
  /** Начало этапа (тесты прерывают попытку на нужном этапе). */
  onStage?: (stage: ImportStage) => void | Promise<void>;
  log?: (line: string) => void;
}

/** Итог задачи (`output_refs`). */
export interface MediaImportResult {
  media_id: string;
  deduplicated: boolean;
  sha256: string;
  rel_path: string;
  cloned?: boolean;
  proxy_reused?: boolean;
  proxy_bytes?: number;
  timings_ms?: Partial<Record<ImportStage, number>>;
}

/** Ожидаемый отказ с кодом задачи. */
class ImportFail extends Error {
  constructor(readonly error: JobError, readonly status: "failed" | "cancelled" | "blocked" = "failed") {
    super(error.message);
  }
}

const DRAFTS_REL = "workspace/drafts";

/** `med_<ULID задачи>`: попытки одной задачи пишут один и тот же исходник. */
export function mediaIdFor(jobId: string): string {
  const m = /^job_([0-9A-Z]+)$/.exec(jobId);
  if (!m) throw new Error(`media.import: id задачи не в формате job_<ULID>: ${jobId}`);
  return `med_${m[1]}`;
}

const ASPECTS: { ratio: z.infer<typeof AspectRatioSchema>; w: number; h: number }[] = [
  { ratio: "16:9", w: 1920, h: 1080 },
  { ratio: "9:16", w: 1080, h: 1920 },
  { ratio: "1:1", w: 1080, h: 1080 },
];

/**
 * Настройки проекта после первого импорта: fps = timeline_fps, формат кадра — ближайший к display_*;
 * `duration_frames` пересчитан под новый fps с сохранением длительности в секундах (ревью M12).
 */
export function settingsFromProbe(base: Settings | null, probe: ProbeSummary): Settings {
  const r = Math.log(probe.video.display_width / probe.video.display_height);
  const a = ASPECTS.reduce((best, x) => (Math.abs(Math.log(x.w / x.h) - r) < Math.abs(Math.log(best.w / best.h) - r) ? x : best));
  const b = base ?? defaultSettings();
  const fps = probe.timeline_fps;
  const seconds = (b.duration_frames * b.fps.den) / b.fps.num;
  const frames = Math.max(1, Math.round((seconds * fps.num) / fps.den));
  return { ...b, fps, duration_frames: frames, aspect_ratio: a.ratio, width: a.w, height: a.h };
}

/** Путь загрузки (Task 29): регулярный файл прямо в `workspace/drafts/…` хранилища, по realpath. */
async function resolveUploadPath(root: string, uploadPath: string, originalName: string): Promise<ImportFile> {
  if (!videoExt(originalName)) throw new MediaInvalidError(`расширение не видео: ${originalName}`);
  let real: string;
  try {
    real = await realpath(uploadPath);
  } catch {
    throw new MediaInvalidError(`загруженный файл не найден: ${uploadPath}`);
  }
  if (!isInside(real, await realpath(join(root, DRAFTS_REL)))) throw new MediaInvalidError(`загруженный файл вне ${DRAFTS_REL}: ${uploadPath}`);
  const st = await lstat(real);
  if (!st.isFile()) throw new MediaInvalidError(`загрузка — не обычный файл: ${uploadPath}`);
  return { path: real, dev: st.dev, ino: st.ino, size: st.size };
}

/**
 * После копии (ревью M2): путь всё ещё ведёт к тому же файлу (realpath заново, dev/ino из lstat),
 * иначе исходник подменили во время импорта — `MediaInvalidError`.
 */
async function assertSameFile(requested: string, f: ImportFile): Promise<void> {
  const again = await realpath(requested).catch(() => undefined);
  const st = again === undefined ? undefined : await lstat(again).catch(() => undefined);
  if (again !== f.path || !st || st.dev !== f.dev || st.ino !== f.ino) {
    throw new MediaInvalidError(`исходник подменён во время импорта (путь ${requested} ведёт к другому файлу)`);
  }
}

/** Снимает read-only и удаляет каталог draft, если он не в карантине. */
async function dropDraft(dir: string): Promise<void> {
  if (!existsSync(dir) || existsSync(join(dir, QUARANTINE))) return;
  await setWritable(dir).catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
}

export function mediaImport(depsOf: (ctx: JobContext) => MediaImportDeps): JobHandler {
  return async (ctx) => {
    const d = depsOf(ctx);
    const fail = (error: JobError, status: "failed" | "cancelled" | "blocked" = "failed"): HandlerResult => ({ status, error });
    const parsed = MediaImportInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return fail({ code: "pipeline", stage: "prepare", message: `вход media.import не годится: ${parsed.error.message}` });
    const input = parsed.data;
    if (input.projectId !== ctx.job.project_id) {
      return fail({ code: "pipeline", stage: "prepare", message: `вход media.import: projectId ${input.projectId} не совпадает с проектом задачи ${ctx.job.project_id}` });
    }
    const project = projects.get(ctx.db, input.projectId);
    if (!project) return fail({ code: "pipeline", stage: "prepare", message: `проекта ${input.projectId} нет` });
    if (project.kind !== "video") return fail({ code: "pipeline", stage: "prepare", message: `проект ${input.projectId} не видеопроект (${project.kind})` });

    const root = d.root;
    const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
    const medId = mediaIdFor(ctx.job.id);
    const P = artifactPaths(root, input.projectId);
    const srcRel = P.source(medId);
    const pxRel = P.proxy(medId);
    const draftsDir = join(root, DRAFTS_REL);
    const srcDraft = join(draftsDir, `${fence.jobId}-src-a${fence.attempt}`);
    const pubDraft = join(draftsDir, `${fence.jobId}-a${fence.attempt}`);
    const timings: Partial<Record<ImportStage, number>> = {};
    let stage: ImportStage = "hash";
    let t0 = Date.now();
    const enter = async (s: ImportStage, p: number) => {
      timings[stage] = (timings[stage] ?? 0) + (Date.now() - t0);
      stage = s;
      t0 = Date.now();
      ctx.progress(p, s);
      await d.onStage?.(s);
      ctx.signal.throwIfAborted();
    };
    const run = ctx.run;
    const signal = ctx.signal;

    try {
      // Ревью I3: исходник этой задачи уже в БД (попытка N закоммитила media_assets и упала до
      // finish) — завершаемся по нему, не трогая путь пользователя (файла может уже не быть).
      const existing = media.byProject(ctx.db, input.projectId);
      if (existing && media.createdByJob(ctx.db, existing.id) === ctx.job.id) {
        return done({ media_id: existing.id, deduplicated: false, sha256: existing.sha256, rel_path: existing.rel_path, cloned: existing.import.cloned });
      }

      const status = await d.storage();
      if (!status.ok) throw new ImportFail({ code: "storage_unavailable", stage: "storage", message: `${status.reason}: ${status.detail}` });

      const file = input.method === "path"
        ? await resolveImportFile(input.path, d.media.importRoots, { forbidden: [root] })
        : await resolveUploadPath(root, input.uploadPath, input.originalName);
      const src = file.path;
      const requested = input.method === "path" ? input.path : input.uploadPath;
      const originalName = input.method === "path" ? basename(src) : basename(input.originalName);
      const ext = videoExt(originalName)!;
      /** Прогресс чтения `passes` полных проходов по исходнику в доле [from, from + span]. */
      const readBytes = (from: number, span: number, passes: number) => {
        let n = 0;
        const total = Math.max(1, passes * file.size);
        return (k: number) => {
          n += k;
          ctx.progress(from + span * Math.min(1, n / total), stage);
        };
      };

      // Один исходник на проект: тот же файл — существующий ассет, другой — media_exists.
      if (existing) {
        await enter("hash", 0.02);
        const sha = await sha256File(src, { signal, onBytes: readBytes(0.02, 0.9, 1) });
        if (sha !== existing.sha256) {
          throw new ImportFail({
            code: "media_exists",
            message: `media_exists: в проекте уже есть исходник «${existing.original_name}» (${existing.id}); один исходник на проект — создайте новый проект для другого видео`,
          });
        }
        const by = media.createdByJob(ctx.db, existing.id);
        return done({ media_id: existing.id, deduplicated: by !== ctx.job.id, sha256: existing.sha256, rel_path: existing.rel_path });
      }

      // Место: до копии — под копию и запас (длительность ещё неизвестна: probe идёт по копии,
      // ревью M1), после probe — полная оценка с прокси и audio16k.
      await enter("space", 0.03);
      const srcStat = await stat(src);
      const sameVolume = srcStat.dev === (await stat(root)).dev;
      const reused = publicationOf(ctx.db, pxRel);
      if (reused && reused.job_id !== ctx.job.id) throw new Error(`media.import: ${pxRel} опубликован другой задачей (${reused.job_id})`);
      const checkSpace = (durationUs: number, free: number) => {
        const est = estimateImportBytes({ sizeBytes: srcStat.size, durationUs, sameVolume });
        const space = checkImportSpace(est, free, d.minFreeBytes);
        if (!space.ok) {
          throw new ImportFail({
            code: "low_space",
            message: `low_space: для импорта нужно свободно ${gib(space.needBytes)} (оценка ${gib(est)} + порог ${gib(d.minFreeBytes)}), на томе хранилища ${gib(free)}`,
          });
        }
      };
      checkSpace(0, status.freeBytes);

      await enter("copy", 0.04);
      await safeMkdir(root, DRAFTS_REL);
      await mkdir(srcDraft); // без recursive: существующий — ошибка
      // три полных чтения: хеш источника до, копия (у клона — хеш копии), хеш источника после
      const copied = await copyOriginal(src, srcDraft, { ext, signal, onBytes: readBytes(0.04, 0.08, 3) });
      await assertSameFile(requested, file);
      ctx.emit("media_copied", `оригинал скопирован${copied.cloned ? " (APFS-клон)" : ""}`, { sha256: copied.sha256, cloned: copied.cloned });
      const original = copied.path;

      // probe — по копии в хранилище (ревью M1): исходник пользователя после хешей не читается
      await enter("probe", 0.12);
      const probe = await probeMedia(original, { run, signal });
      d.log?.(`импорт ${originalName}: ${probe.video.codec} ${probe.video.display_width}×${probe.video.display_height} ${probe.timeline_fps.num}/${probe.timeline_fps.den}${probe.vfr ? " VFR" : ""}, ${(probe.duration_us / 1e6).toFixed(1)} с`);
      if (!reused) {
        const now = await d.storage();
        if (!now.ok) throw new ImportFail({ code: "storage_unavailable", stage: "storage", message: `${now.reason}: ${now.detail}` });
        // копия уже на диске: в оценке её не считаем
        checkSpace(probe.duration_us, now.freeBytes + (sameVolume ? 0 : srcStat.size));
      }
      const asset: MediaAsset = {
        id: medId,
        project_id: input.projectId,
        original_name: originalName,
        rel_path: `${srcRel}/${basename(original)}`,
        sha256: copied.sha256,
        size_bytes: srcStat.size,
        probe: { ...probe, size_bytes: srcStat.size },
        status: "ready",
        import: { method: input.method, ...(input.method === "path" ? { source_path: src } : {}), cloned: copied.cloned },
        created_at: new Date().toISOString(),
      };

      let manifest: MediaManifest;
      let proxyBytes: number | undefined;
      const store = new ArtifactStore({ root, db: ctx.db, guard: d.storage });
      if (reused) {
        // M3: прокси этой задачи опубликован прошлой попыткой — берём его, второй раз не публикуем
        manifest = MediaManifestSchema.parse(JSON.parse(await readFile(join(root, pxRel, "manifest.json"), "utf8")));
        if (manifest.asset.sha256 !== copied.sha256) {
          throw new Error(`media.import: прокси ${pxRel} сделан из другого файла (sha256 ${manifest.asset.sha256.slice(0, 12)}…, сейчас ${copied.sha256.slice(0, 12)}…)`);
        }
        ctx.emit("proxy_reused", `прокси опубликован попыткой ${reused.attempt}: повторно не строится`, { attempt: reused.attempt });
      } else {
        const draft = await createJobDraft(root, { runId: fence.jobId, attempt: fence.attempt });
        const out = (name: string) => {
          const p = join(draft.dir, name);
          assertOutsideSource(p, root, [src, original]);
          return p;
        };
        const release = await ctx.renders.acquire(signal);
        const derivs: MediaManifest["derivatives"] = [];
        const add = async (kind: DerivativeKind, file: string, params: Record<string, unknown>) => {
          derivs.push({ kind, path: `${pxRel}/${file}`, sha256: await sha256File(join(draft.dir, file), { sync: true }), params });
        };
        try {
          await enter("proxy", 0.15);
          const proxy = out("proxy.mp4");
          await runFfmpeg(proxyArgs(original, proxy, probe, d.media.proxyShortSide), {
            run, signal, durationUs: probe.duration_us, onProgress: (p) => ctx.progress(0.15 + 0.6 * p, "proxy"),
          });
          const px = await probeMedia(proxy, { run, signal });
          const frameUs = (1e6 * probe.timeline_fps.den) / probe.timeline_fps.num;
          const drift = Math.abs(px.duration_us - probe.duration_us);
          if (px.vfr || drift > Math.max(2 * frameUs, 100_000)) {
            throw new Error(`прокси не прошёл проверку: ${px.vfr ? "VFR; " : ""}длительность ${px.duration_us} µs против ${probe.duration_us} µs`);
          }
          proxyBytes = (await stat(proxy)).size;
          await add("proxy", "proxy.mp4", {
            short_side: d.media.proxyShortSide, width: px.video.width, height: px.video.height, fps: px.timeline_fps, codec: "h264", crf: 23, preset: "veryfast",
            duration_us: px.duration_us,
          });

          if (probe.audio) {
            await enter("audio16k", 0.76);
            await extractAudio16k(original, out("audio16k.wav"), demuxerFor(probe.container), { run, signal, durationUs: probe.duration_us, onProgress: (p) => ctx.progress(0.76 + 0.08 * p, "audio16k") });
            await add("audio16k", "audio16k.wav", { sample_rate: 16000, channels: 1, codec: "pcm_s16le" });
            await enter("waveform", 0.85);
            out("waveform.bin");
            const wf = await writeWaveform(join(draft.dir, "audio16k.wav"), draft.dir);
            await add("waveform", "waveform.bin", { ...wf, index: "waveform.json" });
          } else {
            ctx.emit("no_audio", "у исходника нет звука: audio16k и waveform пропущены");
          }

          await enter("thumbs", 0.87);
          const thumbsDir = out("thumbs");
          await mkdir(thumbsDir);
          await runFfmpeg(thumbsArgs(proxy, thumbsDir, d.media.thumbEveryUs, THUMB_HEIGHT), {
            run, signal, durationUs: probe.duration_us, onProgress: (p) => ctx.progress(0.87 + 0.06 * p, "thumbs"),
          });
          const thumbs = { every_us: d.media.thumbEveryUs, count: await countThumbs(thumbsDir), height: THUMB_HEIGHT };
          await fsyncWrite(join(draft.dir, "thumbs.json"), JSON.stringify(thumbs, null, 2) + "\n");
          await add("thumbs", "thumbs.json", { ...thumbs, dir: "thumbs" });
        } finally {
          release();
        }
        manifest = MediaManifestSchema.parse({ schema_version: 1, asset, derivatives: derivs });
        await fsyncWrite(join(draft.dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

        await enter("publish", 0.94);
        await store.publish(draft.dir, pxRel, () => undefined, fence);
      }

      await enter("publish", 0.97);
      // каталог копии оригинала становится draft попытки (имя `<job>-a<N>` после переноса прокси свободно)
      renameSync(srcDraft, pubDraft);
      const finalAsset: MediaAsset = { ...asset, created_at: new Date().toISOString() };
      try {
        await store.publish(pubDraft, srcRel, (db) => {
          media.insert(db, finalAsset, { createdByJobId: ctx.job.id });
          for (const x of manifest.derivatives) media.setDerivative(db, medId, { kind: x.kind, rel_path: x.path, sha256: x.sha256, params: x.params });
          const p = projects.get(db, input.projectId)!;
          projects.setSettings(db, input.projectId, settingsFromProbe(p.settings, probe));
        }, fence);
      } catch (e) {
        if (/UNIQUE constraint failed: media_assets\.project_id/.test(errText(e))) {
          throw new ImportFail({ code: "media_exists", message: "media_exists: в проекте уже есть исходник (импортирован параллельно); один исходник на проект" });
        }
        throw e;
      }
      timings.publish = (timings.publish ?? 0) + (Date.now() - t0);
      const res: MediaImportResult = {
        media_id: medId, deduplicated: false, sha256: copied.sha256, rel_path: finalAsset.rel_path, cloned: copied.cloned,
        proxy_reused: reused !== undefined, ...(proxyBytes !== undefined ? { proxy_bytes: proxyBytes } : {}), timings_ms: timings,
      };
      d.log?.(`импорт ${originalName}: готово, ${medId}`);
      return done(res);
    } catch (e) {
      return await failed(e);
    }

    function done(r: MediaImportResult): HandlerResult {
      ctx.progress(1, "done");
      return { status: "completed", outputRefs: r };
    }

    async function failed(e: unknown): Promise<HandlerResult> {
      const msg = errText(e);
      const cancelled = () => jobs.get(ctx.db, ctx.job.id)?.cancel_requested === true;
      // процессы живы — ничего не трогаем, draft в карантин (ADR 0007)
      if (e instanceof FfmpegError && e.kind === "orphaned") {
        for (const dir of [srcDraft, pubDraft]) if (existsSync(dir)) await quarantineDir(dir, `stale_process: ${stage}: ${msg}`).catch(() => undefined);
        return fail({ code: "stale_process", stage: "orphaned", message: `${stage}: ${msg}` }, "blocked");
      }
      // fenced_out / отмена при публикации: draft уже в карантине у ArtifactStore
      if (e instanceof FencedOutError) {
        await dropDraft(srcDraft).catch(() => undefined);
        return fail({ code: "fenced_out", stage: "fenced_out", message: msg });
      }
      if (e instanceof PublishCancelledError) {
        await dropDraft(srcDraft).catch(() => undefined);
        return fail({ code: "cancelled", stage: "cancelled", message: msg }, "cancelled");
      }
      for (const dir of [srcDraft, pubDraft]) await dropDraft(dir).catch(() => undefined);
      if (e instanceof ImportFail) return fail(e.error, e.status);
      if (signal.aborted || (e instanceof FfmpegError && e.kind === "aborted")) {
        if (cancelled()) return fail({ code: "cancelled", stage: "cancelled", message: `импорт отменён на этапе ${stage}` }, "cancelled");
        return fail({ code: "interrupted", stage: "interrupted", message: `попытка прервана на этапе ${stage}` });
      }
      if (e instanceof MediaInvalidError) return fail({ code: "media_invalid", message: msg });
      if (isStorageError(e)) return fail({ code: "storage_unavailable", stage: "storage", message: msg });
      const ffKind = e instanceof FfmpegError ? ffmpegFailureKind(msg) : undefined;
      if ((e as NodeJS.ErrnoException).code === "ENOSPC" || ffKind === "low_space") {
        return fail({ code: "low_space", message: `low_space: на томе кончилось место на этапе ${stage}: ${msg}` });
      }
      // ревью M6: сбой ввода-вывода посреди этапа часто значит «диск отключили» — перепроверка
      const now = await d.storage().catch(() => undefined);
      if (!now || !now.ok) {
        return fail({ code: "storage_unavailable", stage: "storage", message: `${now ? `${now.reason}: ${now.detail}; ` : ""}${stage}: ${msg}` });
      }
      if (stage === "publish") return fail({ code: "pipeline", stage: "publish", message: msg });
      return fail({ code: "pipeline", message: `${stage}: ${msg}` });
    }
  };
}
