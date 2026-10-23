// Обработчик задачи `scene.restore` (P1-13, `05` §5, M17): новая версия-копия готовой версии
// без LLM (`SceneRepo.restore` — fencing и отмена в транзакции публикации). `render_env`
// копируется из исходной; если `render_lock_sha256` не совпадает с текущим окружением —
// перерендер в draft (`renderVersion` с `outDir`), повтор технического gate (probe) и новый
// `render_env`. История не меняется: восстановленная версия становится current.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type RenderEnv, failureToJobErrorCode } from "@ms/contracts";
import { type StorageStatus, safeMkdir } from "@ms/core";
import { type renderVersion, probeGate } from "@ms/render";
import type { AppConfig } from "../config.js";
import * as chat from "../db/repos/chat.js";
import * as jobs from "../db/repos/jobs.js";
import * as versions from "../db/repos/versions.js";
import { tx } from "../db/tx.js";
import { fenceOk } from "../jobs/queue.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import type { SceneRepo } from "../scenes/repo.js";
import { quarantineDir, readVersion } from "../scenes/store.js";
import { PREVIEW, renderTimeoutMs } from "./fix-loop.js";
import { renderEnv as currentRenderEnv } from "./render-env.js";
import { errText, isStorageError } from "./steps.js";
import { z } from "zod";

export const SceneRestoreInputSchema = z.object({ sceneId: z.string().min(1), versionId: z.string().min(1) }).passthrough();

export interface SceneRestoreDeps {
  repo: SceneRepo;
  deps: (ctx: JobContext) => { storage: () => Promise<StorageStatus>; render: typeof renderVersion; config: AppConfig; log?: (line: string) => void };
  /** Текущее окружение рендера (тесты подменяют). */
  renderEnv?: () => Promise<RenderEnv>;
}

/** Ошибка перерендера: этап и сообщение (`orphaned` — процесс не подтверждён мёртвым). */
class RerenderError extends Error {
  constructor(readonly stage: "render" | "probe" | "orphaned" | "storage", message: string) {
    super(message);
  }
}

export function sceneRestore(d: SceneRestoreDeps): JobHandler {
  return async (ctx) => {
    const parsed = SceneRestoreInputSchema.safeParse(ctx.job.input);
    const failed = (stage: "prepare" | "render" | "probe" | "publish" | "storage" | "orphaned" | "fenced_out" | "cancelled", message: string): HandlerResult => {
      const error = { code: failureToJobErrorCode(stage), stage, message };
      if (stage === "orphaned") return { status: "blocked", error };
      if (stage === "cancelled") return { status: "cancelled", error };
      return { status: "failed", error };
    };
    if (!parsed.success) return failed("prepare", `вход scene.restore не годится: ${parsed.error.message}`);
    const { sceneId, versionId } = parsed.data;
    const deps = d.deps(ctx);
    const status = await deps.storage().catch((e: unknown) => ({ ok: false as const, reason: "error", detail: errText(e) }));
    if (!status.ok) return failed("storage", `${status.reason}: ${status.detail}`);
    const row = versions.get(ctx.db, versionId);
    if (!row || row.scene_id !== sceneId) return failed("prepare", `версии ${versionId} нет у сцены ${sceneId}`);
    if (row.status !== "ready") return failed("prepare", `restore_not_ready: версия ${row.number} в статусе ${row.status}, восстанавливать можно только ready`);
    const root = d.repo.root;
    const fence = { jobId: ctx.job.id, attempt: ctx.attempt };
    const draftDir = join(root, "workspace/drafts", `${fence.jobId}-a${fence.attempt}`);

    let src;
    try {
      src = await readVersion(join(root, row.path));
    } catch (e) {
      return failed("prepare", `версия ${row.number} не прочитана: ${errText(e)}`);
    }
    const now = await (d.renderEnv ?? currentRenderEnv)();
    const mismatch = src.render_env.render_lock_sha256 !== now.render_lock_sha256;
    ctx.progress(0.1, mismatch ? "render" : "publish");

    const rerender = async (outDir: string): Promise<{ render_env: RenderEnv }> => {
      deps.log?.(`восстановление v${src.number}: окружение рендера другое — перерендер`);
      ctx.emit("log", `render_lock_sha256 ${src.render_env.render_lock_sha256.slice(0, 12)} ≠ ${now.render_lock_sha256.slice(0, 12)}: перерендер`);
      const cacheDir = await safeMkdir(root, "cache");
      const release = await ctx.renders.acquire(ctx.signal);
      let rr;
      try {
        rr = await deps.render({
          versionDir: outDir, outDir, settings: src.settings, cacheDir, stills: src.qa_frames, preview: PREVIEW, timeoutMs: renderTimeoutMs(src.settings),
          run: { root, runId: fence.jobId, attempt: fence.attempt, registry: ctx.run.registry },
        }, ctx.signal);
      } finally {
        release();
      }
      if (rr.error?.stage === "orphaned") throw new RerenderError("orphaned", `рендер: ${rr.error.message}`);
      if (!rr.ok || !rr.probe) throw new RerenderError("render", `перерендер не удался: ${rr.error ? `${rr.error.stage}: ${rr.error.message}` : "нет превью"}`);
      const gate = probeGate(rr.probe, src.settings, PREVIEW.scale);
      if (gate.length > 0) throw new RerenderError("probe", `перерендер не прошёл ffprobe: ${gate.join("; ")}`);
      return { render_env: now };
    };

    try {
      const v = await d.repo.restore(sceneId, versionId, fence, mismatch ? { rerender } : {});
      const text = `Версия ${src.number} восстановлена как версия ${v.manifest.number}${mismatch ? " (перерендер: окружение рендера изменилось)" : ""}.`;
      try {
        tx(ctx.db, () => {
          if (fenceOk(ctx.db, fence.jobId, fence.attempt)) chat.add(ctx.db, { scene_id: sceneId, role: "assistant", text, job_id: fence.jobId, version_id: v.versionId });
        });
      } catch (e) {
        ctx.emit("record_failed", `сообщение не записано: ${errText(e)}`);
      }
      return {
        status: "completed",
        outputRefs: { scene_id: sceneId, version_id: v.versionId, version_number: v.manifest.number, version_dir: v.dir, restored_from: versionId, rerendered: mismatch },
      };
    } catch (e) {
      const msg = errText(e);
      const alive = e instanceof RerenderError && e.stage === "orphaned";
      // fencing и отмена: draft уже в карантине (SceneRepo); прочее — в карантин здесь
      if (!(e as { quarantined?: boolean }).quarantined && existsSync(draftDir)) {
        await quarantineDir(draftDir, `${alive ? "stale_process" : "restore"}: ${msg}`).catch(() => undefined);
      }
      if (/^fenced_out\b/.test(msg)) return failed("fenced_out", msg);
      if (/^cancelled\b/.test(msg) || jobs.get(ctx.db, fence.jobId)?.cancel_requested) return failed("cancelled", msg);
      if (e instanceof RerenderError) return failed(e.stage, msg);
      if (isStorageError(e)) return failed("storage", msg);
      return failed(/restore_not_ready|version_broken/.test(msg) ? "prepare" : "publish", msg);
    }
  };
}
