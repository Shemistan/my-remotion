// Обработчик задачи `scene.export` (P1-14): экспорт готовой версии в MP4 H.264/AAC или
// ProRes 4444 с альфой. Рендер — в draft попытки `drafts/<job>-a<attempt>/` под семафором
// рендеров; файл проходит `exportGate` (+ альфа угла у ProRes), затем одна транзакция с
// fencing переносит draft в `exports/<export-id>/` (файл + `export-manifest.json`) и пишет
// строку `exports`; после COMMIT каталог закрывается от записи (chmod -R a-w).
import { existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type ExportManifest, ExportManifestSchema, type ExportRequest, ExportRequestSchema, type RenderEnv, type Settings, failureToJobErrorCode,
} from "@ms/contracts";
import { type StorageStatus, safeMkdir } from "@ms/core";
import { EXPORT_TIMEOUT_MS, FfmpegError, type TempoCheck, type alphaAtCorner, exportDurationFrames, exportFps, type exportVersion } from "@ms/render";
import { z } from "zod";
import * as exportsRepo from "../db/repos/exports.js";
import * as jobs from "../db/repos/jobs.js";
import * as scenes from "../db/repos/scenes.js";
import * as versions from "../db/repos/versions.js";
import { tx } from "../db/tx.js";
import { fenceOk } from "../jobs/queue.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import { sha256File } from "../scenes/hash.js";
import { newId } from "../scenes/ids.js";
import type { SceneRepo } from "../scenes/repo.js";
import {
  attachCause, exportRel, fsyncDirSync, fsyncWrite, lockChildrenSync, quarantineDir, readVersion, sealVersion, setWritableSync,
} from "../scenes/store.js";
import { renderEnv as currentRenderEnv } from "./render-env.js";
import { errText, isStorageError } from "./steps.js";

export const SceneExportInputSchema = z.object({ versionId: z.string().min(1), request: ExportRequestSchema }).passthrough();

/** Момент проверки альфы ProRes: 1 с (план, `09` §1) в кадрах fps экспорта; короче сцена — её последний кадр. */
const ALPHA_AT_S = 1;
const MANIFEST = "export-manifest.json";

/** MP4 версии с прозрачным фоном: H.264 альфу не хранит (F7). */
export const TRANSPARENT_MP4_WARNING =
  "у версии прозрачный фон, а H.264 альфу не хранит: прозрачные области в MP4 залиты; для монтажа поверх видео — ProRes 4444";

export const TRANSPARENT_UNSUPPORTED =
  "transparent_unsupported: версия сделана с непрозрачным фоном; включите прозрачный экспорт до генерации";

export interface SceneExportDeps {
  repo: SceneRepo;
  deps: (ctx: JobContext) => {
    storage: () => Promise<StorageStatus>;
    export: typeof exportVersion;
    alpha: typeof alphaAtCorner;
    /** `config.limits.exportTimeoutMs` (Task 20); по умолчанию 30 мин. */
    timeoutMs?: number;
    log?: (line: string) => void;
  };
  /** Текущее окружение рендера для `export-manifest.json` (тесты подменяют). */
  renderEnv?: () => Promise<RenderEnv>;
}

type Stage = "prepare" | "storage" | "export" | "orphaned" | "publish" | "fenced_out" | "cancelled";

/** Отказ публикации экспорта: fencing или отмена (draft уже в карантине). */
class Refused extends Error {
  constructor(readonly stage: "fenced_out" | "cancelled", message: string) {
    super(message);
  }
}

export function sceneExport(d: SceneExportDeps): JobHandler {
  return async (ctx) => {
    const fail = (stage: Stage, message: string): HandlerResult => {
      const error = { code: failureToJobErrorCode(stage), stage, message };
      if (stage === "orphaned") return { status: "blocked", error };
      if (stage === "cancelled") return { status: "cancelled", error };
      return { status: "failed", error };
    };
    const parsed = SceneExportInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return fail("prepare", `вход scene.export не годится: ${parsed.error.message}`);
    const { versionId, request } = parsed.data;
    const deps = d.deps(ctx);
    const status = await deps.storage().catch((e: unknown) => ({ ok: false as const, reason: "error", detail: errText(e) }));
    if (!status.ok) return fail("storage", `${status.reason}: ${status.detail}`);

    const db = ctx.db;
    const row = versions.get(db, versionId);
    if (!row) return fail("prepare", `версии ${versionId} нет`);
    if (row.status !== "ready") return fail("prepare", `export_not_ready: версия ${row.number} в статусе ${row.status}, экспортировать можно только ready`);
    const scene = scenes.get(db, row.scene_id);
    if (!scene) return fail("prepare", `сцены ${row.scene_id} нет`);
    const root = d.repo.root;
    const versionDir = join(root, row.path);
    let settings: Settings;
    try {
      settings = (await readVersion(versionDir)).settings;
    } catch (e) {
      if (isStorageError(e)) return fail("storage", errText(e));
      return fail("prepare", `версия ${row.number} не прочитана: ${errText(e)}`);
    }
    // H4: прозрачность закладывается при генерации (фон сцены), а не при экспорте
    if (request.format === "prores4444" && settings.transparent_export !== true) return fail("export", TRANSPARENT_UNSUPPORTED);

    const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
    const ext = request.format === "prores4444" ? "mov" : "mp4";
    let draftDir: string;
    let cacheDir: string;
    try {
      draftDir = await safeMkdir(root, `workspace/drafts/${fence.jobId}-a${fence.attempt}`);
      cacheDir = await safeMkdir(root, "cache");
    } catch (e) {
      return fail(isStorageError(e) ? "storage" : "prepare", `draft экспорта не создан: ${errText(e)}`);
    }
    const outPath = join(draftDir, `scene.${ext}`);
    const quarantine = (reason: string) => quarantineDir(draftDir, reason).catch(() => undefined);

    try {
      ctx.progress(0.1, "render");
      deps.log?.(`экспорт v${row.number} → ${request.format}${request.fps ? ` ${request.fps} fps` : ""}`);
      const release = await ctx.renders.acquire(ctx.signal);
      let r;
      try {
        r = await deps.export(
          { versionDir, settings, request, cacheDir, outPath, timeoutMs: deps.timeoutMs ?? EXPORT_TIMEOUT_MS, run: ctx.run },
          ctx.signal,
        );
      } finally {
        release();
      }
      if (!r.ok && r.error.stage === "unsupported") {
        await quarantine(`export: ${r.error.message}`);
        return fail("export", r.error.message);
      }
      if (!r.ok) {
        const alive = r.error.stage === "orphaned";
        await quarantine(`${alive ? "stale_process" : "export"}: ${r.error.stage}: ${r.error.message}`);
        if (alive) return fail("orphaned", `экспорт: ${r.error.message}`);
        if (r.error.stage === "aborted" && jobs.get(db, fence.jobId)?.cancel_requested) return fail("cancelled", "экспорт отменён");
        return fail("export", `экспорт не удался: ${r.error.stage}: ${r.error.message}`);
      }
      if (r.gate.length > 0) {
        await quarantine(`export: gate: ${r.gate.join("; ")}`);
        return fail("export", `экспорт не прошёл ffprobe: ${r.gate.join("; ")}`);
      }
      if (r.tempo && r.tempo.mismatched.length > 0) {
        const msg = tempoMismatch(r.tempo, settings, request);
        await quarantine(`export: ${msg}`);
        return fail("export", msg);
      }
      if (request.format === "prores4444") {
        const fps = exportFps(settings, request);
        const frame = Math.min(Math.round((ALPHA_AT_S * fps.num) / fps.den), exportDurationFrames(settings, request) - 1);
        let a: number;
        try {
          a = await deps.alpha(outPath, frame, undefined, { run: ctx.run, signal: ctx.signal });
        } catch (e) {
          // сбой проверки — этап export, не publish (F4); живой ffmpeg — stale_process
          const alive = e instanceof FfmpegError && e.kind === "orphaned";
          await quarantine(`${alive ? "stale_process" : "export"}: проверка альфы: ${errText(e)}`);
          if (alive) return fail("orphaned", `проверка альфы: ${errText(e)}`);
          if (jobs.get(db, fence.jobId)?.cancel_requested) return fail("cancelled", "экспорт отменён");
          if (isStorageError(e)) return fail("storage", errText(e));
          return fail("export", `проверка альфы не удалась: ${errText(e)}`);
        }
        if (a !== 0) {
          await quarantine(`export: альфа угла кадра ${frame} = ${a}`);
          return fail("export", `экспорт без прозрачности: альфа угла кадра ${frame} = ${a}, ожидался 0`);
        }
      }
      const warnings = [...r.warnings];
      if (request.format === "mp4" && settings.transparent_export === true) warnings.push(TRANSPARENT_MP4_WARNING);

      ctx.progress(0.9, "publish");
      const exportId = newId("exp");
      const sha256 = await sha256File(outPath, { sync: true });
      const manifest: ExportManifest = ExportManifestSchema.parse({
        schema_version: 1,
        export_id: exportId,
        version_id: row.id,
        version_manifest_sha256: row.manifest_sha256,
        format: request.format,
        request,
        settings: { ...settings, fps: exportFps(settings, request), duration_frames: exportDurationFrames(settings, request) },
        ffprobe: r.probe,
        sha256,
        render_env: await (d.renderEnv ?? currentRenderEnv)(),
        created_at: new Date().toISOString(),
        ...(r.tempo ? { tempo_check: r.tempo } : {}),
        ...(warnings.length ? { warnings } : {}),
      });
      await fsyncWrite(join(draftDir, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
      const rel = exportRel(scene.project_id, exportId);
      const dest = join(root, rel);
      await safeMkdir(root, dirname(rel));
      const again = await deps.storage();
      if (!again.ok) throw Object.assign(new Error(`storage_unavailable: ${again.reason}: ${again.detail}`), { storage: true });

      const exported = publish(ctx, fence, { draftDir, dest, row: { version_id: row.id, format: request.format, path: `${rel}/scene.${ext}`, sha256, id: exportId } });
      try {
        await sealVersion(dest);
      } catch (e) {
        warnings.push(`корень экспорта не закрыт от записи: ${errText(e)}`);
      }
      return {
        status: "completed",
        outputRefs: { export_id: exported.id, version_id: row.id, format: request.format, path: exported.path, sha256, ffprobe: r.probe, ...(warnings.length ? { warnings } : {}) },
      };
    } catch (e) {
      const msg = errText(e);
      if (e instanceof Refused) {
        await quarantine(msg);
        return fail(e.stage, msg);
      }
      if (existsSync(draftDir)) await quarantine(`export: ${msg}`);
      if (jobs.get(db, fence.jobId)?.cancel_requested) return fail("cancelled", msg);
      if (isStorageError(e) || (e as { storage?: boolean }).storage) return fail("storage", msg);
      return fail("publish", msg);
    }
  };
}

/**
 * Сообщение отказа при расхождении темпа (ruling 2026-10-23): сцена зашила кадры в код, и в
 * новом fps её зашитые фазы идут быстрее — тихо ускоренный ролик не публикуется.
 */
function tempoMismatch(tempo: TempoCheck, settings: Settings, request: Pick<ExportRequest, "fps">): string {
  const f = (x: { num: number; den: number }) => (x.den === 1 ? `${x.num}` : `${x.num}/${x.den}`);
  const bad = tempo.samples
    .filter((s) => tempo.mismatched.includes(s.frame))
    .map((s) => `кадр ${s.frame} → ${s.exportFrame}: ${s.maxTile.toFixed(2)}${s.hotTiles !== undefined ? `, клеток ${s.hotTiles}` : ""}`)
    .join("; ");
  const rule = tempo.hotTile !== undefined ? `худшая клетка > ${tempo.threshold} или ≥ ${tempo.hotTilesMin} клеток > ${tempo.hotTile}` : `худшая клетка > ${tempo.threshold}`;
  return (
    `fps_tempo_mismatch: сцена зашила кадры в код — в ${f(exportFps(settings, request))} fps она идёт не в том темпе, что в исходных ${f(settings.fps)}; ` +
    `экспортируйте в исходном fps (${f(settings.fps)}) или перегенерируйте сцену. ` +
    `Расхождение со стоп-кадрами версии в те же моменты (${rule}): ${bad}`
  );
}

/**
 * Транзакция публикации (только синхронное): попытка актуальна и отмена не запрошена →
 * содержимое draft read-only → `renameSync` в `exports/<id>/` → fsync каталогов → строка
 * `exports`. Сбой после rename возвращает каталог на место draft.
 */
function publish(
  ctx: JobContext,
  fence: { jobId: string; attempt: number },
  p: { draftDir: string; dest: string; row: Omit<exportsRepo.ExportRow, "created_at" | "job_id"> },
): exportsRepo.ExportRow {
  let moved = false;
  try {
    return tx(ctx.db, () => {
      if (!fenceOk(ctx.db, fence.jobId, fence.attempt)) {
        const cur = jobs.get(ctx.db, fence.jobId)?.attempt;
        throw new Refused("fenced_out", `fenced_out: попытка ${fence.attempt} задачи ${fence.jobId} устарела (текущая: ${cur ?? "задачи нет"})`);
      }
      if (jobs.get(ctx.db, fence.jobId)?.cancel_requested) throw new Refused("cancelled", `cancelled: отмена задачи ${fence.jobId} запрошена — экспорт не публикуется`);
      lockChildrenSync(p.draftDir);
      renameSync(p.draftDir, p.dest);
      moved = true;
      fsyncDirSync(dirname(p.dest));
      fsyncDirSync(dirname(p.draftDir));
      return exportsRepo.insert(ctx.db, { ...p.row, job_id: fence.jobId });
    });
  } catch (e) {
    if (moved) {
      try {
        setWritableSync(p.dest);
        renameSync(p.dest, p.draftDir);
      } catch (u) {
        attachCause(e, u);
      }
    } else if (!(e instanceof Refused)) {
      try {
        setWritableSync(p.draftDir);
      } catch {
        // draft остаётся как есть; карантин поставит вызывающий
      }
    }
    throw e;
  }
}
