// Задача `video.package` (Task 5L, Phase 5-lite, Р-V9): папка клипов видеопроекта механизмом
// `script.package`/`exportOne`. Сцены текущей ревизии плана по порядку в ролике; версия —
// утверждённая (C, валидная), без C — в «не вошли» (`only_approved: false` — текущая готовая с
// пометкой); устаревшие — «сцена устарела». На сцену — `NN_<slug>.mp4` и, кроме `fullscreen`,
// `NN_<slug>_alpha.mov` (ProRes 4444, `overlay`); готовые экспорты тех же запросов
// переиспользуются. Шпаргалка с таймкодами ролика и исходника (md/csv/txt) и
// `package-manifest.json` — в draft попытки, публикация переносом в транзакции с fencing
// (ADR 0007) + строка `video_packages`, корень a-w. Пусто — `failed(package_empty)`.
import { readFileSync, renameSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  type SceneFrames, type ScenePlanItem, type ScriptPackageFile, type VideoPackageDto, type VideoPackageManifest, VideoPackageManifestSchema,
  failureToJobErrorCode, videoSceneFrames, videoSceneWindow,
} from "@ms/contracts";
import { safeMkdir } from "@ms/core";
import { z } from "zod";
import { currentPlan } from "../analysis/plan-ops.js";
import { currentProjectStyle } from "../analysis/project-style.js";
import { artifactPaths } from "../artifacts/paths.js";
import { createJobDraft } from "../artifacts/job-draft.js";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import * as plans from "../db/repos/plans.js";
import * as projects from "../db/repos/projects.js";
import * as scenes from "../db/repos/scenes.js";
import { type VideoPackageRow, videoPackages, videoScenes } from "../db/repos/video.js";
import * as versions from "../db/repos/versions.js";
import { tx } from "../db/tx.js";
import { fenceOk } from "../jobs/queue.js";
import type { HandlerResult, JobContext, JobHandler } from "../jobs/types.js";
import { sha256 } from "../scenes/hash.js";
import { attachCause, fsyncDirSync, quarantineDir } from "../scenes/store.js";
import { CHEAT_FILES } from "../script/cheatsheet.js";
import { OVERLAY_BLOCKERS, OVERLAY_IMPOSSIBLE, overlayProblem } from "../script/overlay-check.js";
import { fileNames, fileSlug, packageIdFor } from "../script/package-names.js";
import { versionQaWarnings } from "../script/state.js";
import { sceneApprovalState } from "../video-scenes/approval-c.js";
import { acceptedItems } from "../video-scenes/batch.js";
import { NOT_APPROVED, videoCheatRows, videoCheatsheet } from "../video-scenes/cheatsheet.js";
import { planFps } from "../video-scenes/context.js";
import { videoItemFingerprint } from "../video-scenes/fingerprint.js";
import { type Phase46Deps } from "./phase46-deps.js";
import type { ExportOneInput, SceneExportDeps } from "./scene-export.js";
import {
  type Exported, MANIFEST_FILE, NO_VERSION, PACKAGE_ALPHA, PACKAGE_MP4, Refused, STALE, durationNote, ensureExport, lstatOrUndefined, place,
  quarantineOrphan, sealRoot, versionFrames, writeLocked,
} from "./script-package.js";
import { errText, isStorageError } from "./steps.js";

/** Зависимости `video.package`: общие Phase 4–6 (сигнатура фабрики 35′) + подмены тестов. */
export type VideoPackageDeps = Phase46Deps & {
  /** Экспорт одной версии в попытке задачи (тесты подменяют); по умолчанию `exportOne` S6. */
  exportOne?: (ctx: JobContext, d: SceneExportDeps, input: ExportOneInput) => Promise<HandlerResult>;
  /** Перед транзакцией публикации (тесты: устаревшая попытка). */
  beforePublish?: (ctx: JobContext) => void | Promise<void>;
};

export const VideoPackageInputSchema = z.object({ projectId: z.string().min(1), only_approved: z.boolean().optional() }).passthrough();

/** Версии у сцены плана нет (генерации не было или ни одна не удалась). */
export const NOT_GENERATED = "сцена ещё не сгенерирована";

/** C есть, но устарело не из-за плана (версия сломана или изменена). */
export const APPROVAL_STALE = "утверждение (C) устарело — утвердите версию заново";

type Stage = "prepare" | "storage" | "publish" | "fenced_out" | "cancelled";
const fail = (stage: Stage, message: string): HandlerResult => {
  const error = { code: failureToJobErrorCode(stage), stage, message };
  return stage === "cancelled" ? { status: "cancelled", error } : { status: "failed", error };
};

/** Итог задачи в `output_refs` (как у `script.package`). */
export interface VideoPackageRefs {
  package_id: string;
  rel_path: string;
  files: number;
  missing: { item_id: string; reason: string }[];
}

interface Packed {
  n: number;
  item: ScenePlanItem;
  sceneId: string;
  versionId: string;
  versionNumber: number;
  approved: boolean;
  durationFrames: number;
  names: { mp4: string; alpha: string };
  mp4: Exported;
  alpha: Exported | null;
  warnings: string[];
}

/** Фраза сцены для человека: цитаты evidence подряд. */
export const itemQuote = (item: ScenePlanItem): string => item.evidence.map((e) => e.quote).join(" … ");

/** Имя папки для человека: `<проект>_клипы_<YYYY-MM-DD>` (местная дата). */
export function videoDisplayName(projectTitle: string, at: Date): string {
  // eslint-disable-next-line no-control-regex
  const title = projectTitle.replace(/[/\\:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim() || "проект";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${title}_клипы_${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}`;
}

export const videoPackage: (depsOf: () => VideoPackageDeps) => JobHandler = (depsOf) => async (ctx) => {
  const parsed = VideoPackageInputSchema.safeParse(ctx.job.input);
  if (!parsed.success) return fail("prepare", `вход video.package не годится: ${parsed.error.message}`);
  const { projectId } = parsed.data;
  const onlyApproved = parsed.data.only_approved !== false;
  const d = depsOf();
  const db = ctx.db;
  const root = d.svc.root;
  const log = d.options.log;
  const exp = { root, exporter: d.exporter, ...(d.exportOne ? { exportOne: d.exportOne } : {}) };
  const status = await d.svc.storageCheck().catch((e: unknown) => ({ ok: false as const, reason: "error", detail: errText(e) }));
  if (!status.ok) return fail("storage", `${status.reason}: ${status.detail}`);

  const pkgId = packageIdFor(ctx.job.id);
  let rel: string;
  try {
    rel = artifactPaths(root, projectId).package(pkgId);
  } catch (e) {
    return fail("prepare", errText(e));
  }
  // восстановление: пакет уже опубликован этой задачей (сбой между COMMIT и итогом попытки)
  const done = videoPackages.get(db, pkgId);
  if (done) {
    const m = readManifest(root, done);
    if (!m) return fail("publish", `пакет ${pkgId} опубликован, но его манифест не читается`);
    await sealRoot(join(root, done.rel_path), log);
    return { status: "completed", outputRefs: refsOf(done, m) };
  }

  const project = projects.get(db, projectId);
  if (!project) return fail("prepare", `проекта ${projectId} нет`);
  if (project.kind !== "video") return fail("prepare", `проект ${projectId} не видеопроект`);
  const plan = plans.byProject(db, projectId);
  let doc: ReturnType<typeof currentPlan> | undefined;
  let style: ReturnType<typeof currentProjectStyle>;
  let fps: ReturnType<typeof planFps>;
  try {
    doc = plan && plan.current_revision !== null ? currentPlan(db, root, plan.id, plan.current_revision) : undefined;
    style = currentProjectStyle(db, root, projectId);
    if (doc) fps = planFps(db, doc);
  } catch (e) {
    return fail(isStorageError(e) ? "storage" : "prepare", `план, монтаж или стиль проекта не прочитаны: ${errText(e)}`);
  }
  if (!doc) return empty("у проекта нет плана сцен");
  const accepted = acceptedItems(doc);
  if (accepted.length === 0) return empty("в плане нет принятых сцен");
  const total = accepted.length;
  const styleRef = style ? { id: style.style_id, revision: style.revision } : null;

  const missing = new Map<string, string>();
  const details = new Map<string, string>();
  const packed: Packed[] = [];
  for (const [i, item] of accepted.entries()) {
    const n = i + 1;
    ctx.progress(0.05 + (0.85 * i) / total, "export");
    const row = videoScenes.get(db, doc.plan_id, item.id);
    const scene = row ? scenes.get(db, row.scene_id) : undefined;
    if (!row || !scene || (!scene.current_version_id && !scene.approved_version_id)) {
      missing.set(item.id, NOT_GENERATED);
      continue;
    }
    const fingerprint = styleRef ? videoItemFingerprint(item, styleRef) : undefined;
    const fresh = fingerprint === undefined || row.item_fingerprint === fingerprint;
    const c = sceneApprovalState(db, row.scene_id, { root, ...(fingerprint !== undefined ? { fingerprint } : {}) });
    let versionId: string | undefined;
    let approved = false;
    if (c.state === "valid" && c.versionId && !(c.versionId === scene.current_version_id && !fresh)) {
      versionId = c.versionId;
      approved = true;
    } else if (onlyApproved) {
      missing.set(item.id, c.state === "missing" ? NOT_APPROVED : c.reason === "plan_changed" || !fresh ? STALE : APPROVAL_STALE);
      continue;
    } else if (!fresh) {
      missing.set(item.id, STALE);
      continue;
    } else versionId = scene.current_version_id ?? undefined;
    const v = versionId ? versions.get(db, versionId) : undefined;
    if (!v || v.status !== "ready" || v.broken_reason) {
      missing.set(item.id, NO_VERSION);
      continue;
    }
    const planTotal = videoSceneFrames(item);
    const w = videoSceneWindow(item, fps!);
    const planFrames: SceneFrames = { lead: w.lead, speech: Math.max(1, planTotal - w.lead - w.tail), tail: w.tail, total: planTotal };
    const frames = versionFrames(planFrames, v.settings.duration_frames);
    const offPlan = durationNote(planFrames, v.settings.duration_frames, fps!);
    const noteFailure = (o: { reason: string; detail?: string }) => {
      if (o.detail === undefined) return;
      details.set(item.id, o.detail);
      ctx.emit("export_failed", `сцена ${n}: ${o.detail}`, { item_id: item.id, reason: o.reason, detail: o.detail });
      log?.(`сцена ${n}: экспорт не удался: ${o.detail}`);
    };
    log?.(`сцена ${n}: экспорт MP4`);
    const mp4 = await ensureExport(ctx, exp, v.id, PACKAGE_MP4, `${n}-mp4`, frames);
    if ("abort" in mp4) return mp4.abort;
    if ("reason" in mp4) {
      missing.set(item.id, mp4.reason);
      noteFailure(mp4);
      continue;
    }
    const qa = versionQaWarnings(db, root, v.id);
    let alpha: Exported | null = null;
    // fullscreen — непрозрачная сцена на весь кадр (Р-V5): альфа не нужна
    if (item.composition_mode !== "fullscreen") {
      if (overlayProblem({ issues: qa })) missing.set(item.id, OVERLAY_IMPOSSIBLE);
      else {
        log?.(`сцена ${n}: экспорт ProRes 4444 с альфой`);
        const a = await ensureExport(ctx, exp, v.id, PACKAGE_ALPHA, `${n}-alpha`, frames);
        if ("abort" in a) return a.abort;
        if ("reason" in a) {
          missing.set(item.id, a.reason);
          noteFailure(a);
        } else alpha = a.ok;
      }
    }
    const qaShown = qa.filter((x) => !(OVERLAY_BLOCKERS as readonly string[]).includes(x.code));
    packed.push({
      n, item, sceneId: row.scene_id, versionId: v.id, versionNumber: v.number, approved, durationFrames: v.settings.duration_frames,
      names: fileNames(n, total, fileSlug(itemQuote(item))), mp4: mp4.ok, alpha,
      warnings: [...(offPlan ? [`duration_off_plan: ${offPlan}`] : []), ...qaShown.map((x) => `${x.code}: ${x.description}`), ...mp4.ok.warnings, ...(alpha?.warnings ?? [])],
    });
  }
  const numberOf = new Map(accepted.map((x, i) => [x.id, i + 1]));
  const missingList = accepted.filter((x) => missing.has(x.id)).map((x) => ({
    item_id: x.id, quote: itemQuote(x), reason: missing.get(x.id)!, ...(details.has(x.id) ? { detail: details.get(x.id)! } : {}),
    n: numberOf.get(x.id)!, source: x.source, frames: { start: x.frames.start, end: x.frames.end },
  }));
  if (packed.length === 0) return empty(missingList.map((m) => `сцена ${m.n}: ${m.reason}`).join("; "));

  ctx.progress(0.9, "publish");
  const now = new Date();
  const createdAt = now.toISOString();
  const fileOf = (e: Exported, file: string): ScriptPackageFile => ({ file, export_id: e.exportId, sha256: e.sha256, ffprobe: e.ffprobe });
  const manifest: VideoPackageManifest = VideoPackageManifestSchema.parse({
    schema_version: 1,
    package_id: pkgId,
    project_id: projectId,
    project_title: project.title,
    name: videoDisplayName(project.title, now),
    fps: fps!,
    edl: { id: doc.inputs.edl.id, revision: doc.inputs.edl.revision },
    plan: { id: doc.plan_id, revision: doc.revision },
    scenes: packed.map((p) => ({
      n: p.n, item_id: p.item.id, scene_id: p.sceneId, version_id: p.versionId, version_number: p.versionNumber, approved: p.approved,
      source: p.item.source, edited: p.item.edited, frames: { start: p.item.frames.start, end: p.item.frames.end }, quote: itemQuote(p.item),
      mode: p.item.composition_mode, zone: p.item.zone, mp4: fileOf(p.mp4, p.names.mp4), alpha: p.alpha ? fileOf(p.alpha, p.names.alpha) : null,
      warnings: p.warnings, duration_frames: p.durationFrames,
    })),
    missing: missingList,
    created_at: createdAt,
  });
  const rows = videoCheatRows(manifest);
  const info = { project: project.title, fps: fps! };

  let draftDir: string;
  try {
    draftDir = (await createJobDraft(root, { runId: ctx.job.id, attempt: ctx.attempt })).dir;
  } catch (e) {
    return fail(isStorageError(e) ? "storage" : "publish", `draft пакета не создан: ${errText(e)}`);
  }
  // медиафайлы draft — жёсткие ссылки на экспорты: перед карантином убираем (общий inode)
  const media = packed.flatMap((p) => [p.names.mp4, ...(p.alpha ? [p.names.alpha] : [])]);
  const quarantine = async (reason: string) => {
    for (const f of media) {
      try {
        unlinkSync(join(draftDir, f));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") log?.(`медиафайл draft ${f} не убран: ${errText(e)}`);
      }
    }
    await quarantineDir(draftDir, reason).catch(() => undefined);
  };
  let manifestText: string;
  try {
    for (const p of packed) {
      await place(p.mp4, join(draftDir, p.names.mp4));
      if (p.alpha) await place(p.alpha, join(draftDir, p.names.alpha));
    }
    for (const f of ["md", "csv", "txt"] as const) await writeLocked(join(draftDir, CHEAT_FILES[f]), videoCheatsheet(rows, f, info));
    manifestText = JSON.stringify(manifest, null, 2) + "\n";
    await writeLocked(join(draftDir, MANIFEST_FILE), manifestText);
    fsyncDirSync(draftDir);
    await d.beforePublish?.(ctx);
    const again = await d.svc.storageCheck();
    if (!again.ok) throw Object.assign(new Error(`storage_unavailable: ${again.reason}: ${again.detail}`), { storage: true });
    await safeMkdir(root, dirname(rel));
  } catch (e) {
    await quarantine(`publish: ${errText(e)}`);
    return fail(isStorageError(e) || (e as { storage?: boolean }).storage ? "storage" : "publish", `папка клипов не собрана: ${errText(e)}`);
  }

  const dest = join(root, rel);
  const row = { id: pkgId, project_id: projectId, job_id: ctx.job.id, rel_path: rel, manifest_sha256: sha256(manifestText), created_at: createdAt };
  let moved = false;
  try {
    tx(db, () => {
      if (!fenceOk(db, ctx.job.id, ctx.attempt)) {
        throw new Refused("fenced_out", `fenced_out: попытка ${ctx.attempt} задачи ${ctx.job.id} устарела (текущая: ${jobs.get(db, ctx.job.id)?.attempt ?? "задачи нет"})`);
      }
      if (jobs.get(db, ctx.job.id)?.cancel_requested) throw new Refused("cancelled", `cancelled: отмена задачи ${ctx.job.id} запрошена — пакет не публикуется`);
      if (videoPackages.get(db, pkgId)) throw new Error(`artifact_exists: пакет ${pkgId} уже опубликован`);
      if (lstatOrUndefined(dest)) quarantineOrphan(root, dest, rel);
      renameSync(draftDir, dest);
      moved = true;
      fsyncDirSync(dirname(dest));
      fsyncDirSync(dirname(draftDir));
      db.prepare("INSERT INTO artifact_publications (dest_rel, job_id, attempt, published_at) VALUES (?, ?, ?, ?)").run(rel, ctx.job.id, ctx.attempt, createdAt);
      videoPackages.insert(db, row);
    });
  } catch (e) {
    if (moved) {
      try {
        renameSync(dest, draftDir); // только каталог: права файлов (общий inode с экспортами) не трогаем
      } catch (u) {
        attachCause(e, u);
      }
    }
    await quarantine(errText(e));
    if (e instanceof Refused) return fail(e.stage, e.message);
    return fail(isStorageError(e) ? "storage" : "publish", `публикация папки клипов не удалась: ${errText(e)}`);
  }
  await sealRoot(dest, log);
  ctx.progress(1, "publish");
  return { status: "completed", outputRefs: refsOf(videoPackages.get(db, pkgId)!, manifest) };

  function empty(why: string): HandlerResult {
    return { status: "failed", error: { code: "package_empty", message: `в папку не вошло ни одной сцены: ${why}` } };
  }
};

function readManifest(root: string, row: VideoPackageRow): VideoPackageManifest | undefined {
  try {
    return VideoPackageManifestSchema.parse(JSON.parse(readFileSync(join(root, row.rel_path, MANIFEST_FILE), "utf8")));
  } catch {
    return undefined;
  }
}

function refsOf(row: VideoPackageRow, m: VideoPackageManifest): VideoPackageRefs {
  return { package_id: row.id, rel_path: row.rel_path, files: m.scenes.length, missing: m.missing.map(({ item_id, reason }) => ({ item_id, reason })) };
}

/** DTO папки клипов; манифест не читается — undefined (вызывающий решает: 409 или пропуск в списке). */
export function videoPackageDto(root: string, row: VideoPackageRow): VideoPackageDto | undefined {
  const m = readManifest(root, row);
  if (!m) return undefined;
  return { id: row.id, rel_path: row.rel_path, abs_path: join(root, row.rel_path), display_name: m.name || basename(row.rel_path), manifest: m, created_at: row.created_at };
}

/** Папки клипов проекта, новые первыми (с нечитаемым манифестом — пропускаются). */
export function videoPackagesForProject(db: Db, root: string, projectId: string): VideoPackageDto[] {
  return videoPackages.listByProject(db, projectId).reverse().map((r) => videoPackageDto(root, r)).filter((x): x is VideoPackageDto => x !== undefined);
}
