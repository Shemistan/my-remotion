// Пакеты генерации видеосцен (Task 38-39, ADR 0009 Р-V2) по образцу `script/batch.ts`: пакет —
// не задача, а набор обычных задач `playground.generate` со входом `video`, ключи
// `video:<planId>@r<rev>:<itemId>:s<styleRev>[:try-n][:regen-k]`. Членство задачи — событие
// `video_batch` в `job_events` той же транзакции; `video_scenes.job_id` — последняя задача сцены.
// Approval B здесь не ставится: его утверждает человек во вкладке «План» (`approveVisualPlan`),
// пакет требует валидное B на текущую ревизию. Бюджетного гейта нет (Р-V7).
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Job, type ProjectDto, type ScenePlanItem, type Settings, type VideoBatchDto, type VideoSceneStatus, type VisualPlanRevisionDoc,
  defaultSettings, subjectRef,
} from "@ms/contracts";
import type { ProcessRegistry } from "@ms/core";
import { currentPlan } from "../analysis/plan-ops.js";
import { currentProjectStyle } from "../analysis/project-style.js";
import { ApiError, notFound } from "../api/errors.js";
import { publicJob } from "../api/job-dto.js";
import { peekApprovalState } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import { PROJECTS_REL } from "../artifacts/paths.js";
import type { Db } from "../db/open.js";
import * as approvals from "../db/repos/approvals.js";
import * as jobEvents from "../db/repos/job-events.js";
import * as jobs from "../db/repos/jobs.js";
import * as media from "../db/repos/media.js";
import * as plans from "../db/repos/plans.js";
import * as projects from "../db/repos/projects.js";
import * as scenes from "../db/repos/scenes.js";
import { type VideoBatchRow, type VideoSceneRow, videoBatches, videoScenes } from "../db/repos/video.js";
import * as versions from "../db/repos/versions.js";
import { tx } from "../db/tx.js";
import { BATCH_ACTIVE, BATCH_CANCELLABLE, keyPrefix, nextTryKey, requestTag } from "../jobs/batch-keys.js";
import { cancelJob, enqueue } from "../jobs/queue.js";
import { removeHollowDir } from "../projects/hollow.js";
import { deletedRefusal } from "../projects/lifecycle.js";
import { newId } from "../scenes/ids.js";
import { sceneRel, writeBriefSync } from "../scenes/store.js";
import { clean, clipWords } from "../script/brief.js";
import { sceneStatus } from "../script/state.js";
import { buildVideoSceneBrief, videoSceneSettings } from "./brief.js";
import { planFps, videoNarration, videoSceneContext } from "./context.js";
import { sceneKey } from "./approval-c.js";
import { videoItemFingerprint } from "./fingerprint.js";
import { inputVideoFingerprint, versionVideoFingerprint } from "./origin.js";

/** Вид события `job_events`: задача входит в пакет видеосцен (`data: { batch_id, item_id }`). */
export const VIDEO_BATCH_EVENT = "video_batch";
/** Префикс id пакетов видеосцен (`keyPrefix`). */
export const VIDEO_BATCH_PREFIX = "vb";
const TITLE_QUOTE_MAX = 60;

export interface StartVideoBatchInput {
  projectId: string;
  /** Ревизия плана, по которой человек запускает пакет (`VideoGenerateBody.revision`). */
  revision: number;
  itemIds?: string[];
  regenerate?: boolean;
  idempotencyKey: string;
}

/** Ключ задачи генерации видеосцены (Р-V2). */
export function videoSceneJobKey(k: { planId: string; revision: number; itemId: string; styleRevision: number; tryN?: number; regenK?: number }): string {
  return `video:${k.planId}@r${k.revision}:${k.itemId}:s${k.styleRevision}${k.tryN ? `:try-${k.tryN}` : ""}${k.regenK ? `:regen-${k.regenK}` : ""}`;
}

const videoRequestTag = (i: Pick<StartVideoBatchInput, "revision" | "itemIds" | "regenerate">): string =>
  requestTag({ video: true, revision: i.revision, item_ids: i.itemIds ? [...new Set(i.itemIds)].sort() : null, regenerate: i.regenerate === true });

/** Пакет полный (как S17a сценария): id кончается отпечатком запроса без `item_ids` и `regenerate`. */
const fullVideoBatch = (b: Pick<VideoBatchRow, "id" | "plan_revision">): boolean => b.id.endsWith(videoRequestTag({ revision: b.plan_revision }));

/** Пакет, созданный запросом с этим `Idempotency-Key` (любое тело), — для 200/202 маршрута. */
export function videoBatchForKey(db: Db, projectId: string, key: string): VideoBatchRow | undefined {
  const prefix = keyPrefix(projectId, key, VIDEO_BATCH_PREFIX);
  return videoBatches.listByProject(db, projectId).find((b) => b.id.startsWith(prefix));
}

/** Название сцены Playground: «NN · фраза» (фраза — опорные цитаты сцены плана). */
export function videoSceneTitle(n: number, item: ScenePlanItem): string {
  return `${String(n).padStart(2, "0")} · ${clipWords(clean(item.evidence.map((e) => e.quote).join(" … ")), TITLE_QUOTE_MAX)}`;
}

/** Принятые сцены плана по времени в ролике (номер сцены — позиция среди них). */
export const acceptedItems = (doc: VisualPlanRevisionDoc): ScenePlanItem[] =>
  doc.items.filter((x) => x.status === "accepted").sort((a, b) => a.frames.start - b.frames.start || a.id.localeCompare(b.id));

/** B на ревизию `revision` плана `planId` валидно (только чтение). */
function bValid(db: Db, projectId: string, planId: string, revision: number): string | undefined {
  const peek = peekApprovalState(db, projectId, "B", currentSubject(db, projectId, "B"));
  return peek.state === "valid" && peek.approval?.subject_ref === subjectRef("plan", planId, revision) ? peek.approval.id : undefined;
}

const versionOfJob = (db: Db, jobId: string): string | null =>
  versions.listByJob(db, jobId).filter((v) => v.status === "ready" && !v.broken_reason).at(-1)?.id ?? null;
const generateJobs = (db: Db, sceneId: string): number => jobs.list(db, { sceneId }).filter((j) => j.type === "playground.generate").length;

export { inputVideoFingerprint } from "./origin.js";

interface Work {
  item: ScenePlanItem;
  fingerprint: string;
  row?: VideoSceneRow;
  enqueue?: { sceneId: string; title: string; brief: string; settings: Settings; input: unknown; key: string };
  reuse?: Job;
}

/**
 * Пакет генерации видеосцен. Проект `kind = "video"`; ревизия — текущая (иначе 409
 * `plan_outdated`); валидное B на неё (иначе 409 `approval_required`); стиль — текущий стиль
 * проекта. По каждой выбранной принятой сцене без готовой версии по текущему отпечатку
 * (`regenerate` — все выбранные): сцена → задача → `video_scenes.setJob`; идущая задача на тот же
 * отпечаток входит как есть. Брифы — до SQL-транзакции (откат — каталоги новых сцен удаляются,
 * brief.json существующих — прежний). Повтор того же ключа — тот же пакет.
 */
export function startVideoBatch(core: { db: Db; root: string }, i: StartVideoBatchInput): VideoBatchDto {
  const { db, root } = core;
  const project = projects.get(db, i.projectId);
  if (!project) throw notFound(`проект ${i.projectId}`);
  if (project.kind !== "video") throw new ApiError(409, "not_video_project", "проект не видеопроект");
  const batchId = `${keyPrefix(i.projectId, i.idempotencyKey, VIDEO_BATCH_PREFIX)}${videoRequestTag(i)}`;
  const existing = videoBatchForKey(db, i.projectId, i.idempotencyKey);
  if (existing) {
    if (existing.id !== batchId) throw new ApiError(422, "idempotency_key_reused", `ключ ${i.idempotencyKey} уже использован пакетом ${existing.id} с другим запросом`);
    return videoBatchStatus(db, root, batchId);
  }
  const deleted = deletedRefusal(db, i.projectId);
  if (deleted) throw deleted;
  const plan = plans.byProject(db, i.projectId);
  if (!plan || plan.current_revision === null) throw new ApiError(409, "no_plan", "визуального плана нет");
  if (plan.current_revision !== i.revision) throw new ApiError(409, "plan_outdated", `ревизия плана r${i.revision} не текущая (текущая r${plan.current_revision})`);
  const doc = currentPlan(db, root, plan.id, plan.current_revision);
  if (!bValid(db, i.projectId, plan.id, doc.revision)) throw new ApiError(409, "approval_required", `план r${doc.revision} не утверждён (Approval B) — утвердите его во вкладке «План»`);
  const style = currentProjectStyle(db, root, i.projectId);
  if (!style) throw new ApiError(409, "no_style", "стиля проекта нет");
  const asset = media.byProject(db, i.projectId);
  if (!asset) throw new ApiError(409, "no_media", "исходника нет");

  const accepted = acceptedItems(doc);
  if (accepted.length === 0) throw new ApiError(422, "no_items", "в плане нет принятых сцен");
  const skipped: { item_id: string; reason: string }[] = [];
  let selected = accepted;
  if (i.itemIds) {
    const known = new Map(doc.items.map((x) => [x.id, x]));
    const unknown = i.itemIds.filter((id) => !known.has(id));
    if (unknown.length > 0) throw new ApiError(422, "unknown_item", `в плане нет сцен: ${unknown.join(", ")}`);
    const want = new Set(i.itemIds);
    for (const id of [...want]) if (known.get(id)!.status !== "accepted") skipped.push({ item_id: id, reason: "not_accepted" });
    selected = accepted.filter((x) => want.has(x.id));
  }

  const styleRef = { id: style.style_id, revision: style.revision };
  const fps = planFps(db, doc);
  const display = { width: asset.probe.video.display_width, height: asset.probe.video.display_height };
  const base: Settings = project.settings ?? defaultSettings();
  const regenerate = i.regenerate === true;
  const work: Work[] = [];
  const retitle: { sceneId: string; title: string }[] = [];
  for (const item of selected) {
    const index = accepted.indexOf(item);
    const fingerprint = videoItemFingerprint(item, styleRef);
    const row = videoScenes.get(db, doc.plan_id, item.id);
    const title = videoSceneTitle(index + 1, item);
    if (row && scenes.get(db, row.scene_id)?.title !== title) retitle.push({ sceneId: row.scene_id, title });
    const last = row?.job_id ? jobs.get(db, row.job_id) : undefined;
    if (!regenerate && row) {
      if (last && BATCH_ACTIVE.has(last.status) && inputVideoFingerprint(last.input) === fingerprint) {
        work.push({ item, fingerprint, row, reuse: last });
        continue;
      }
      // готова: текущая версия опубликована по этому отпечатку (он пишется после публикации)
      if (row.item_fingerprint === fingerprint && scenes.get(db, row.scene_id)?.current_version_id) {
        skipped.push({ item_id: item.id, reason: "ready_version" });
        continue;
      }
    }
    const sceneId = row?.scene_id ?? newId("scn");
    const prior = row ? generateJobs(db, row.scene_id) : 0;
    const failedLast = last !== undefined && (last.status === "failed" || last.status === "cancelled");
    const key = nextTryKey(db, (tryN) => videoSceneJobKey({
      planId: doc.plan_id, revision: doc.revision, itemId: item.id, styleRevision: style.revision,
      ...(tryN ? { tryN } : {}), ...(regenerate ? { regenK: prior } : {}),
    }), prior, { retry: failedLast });
    const ctx = videoSceneContext(db, root, { projectId: i.projectId, doc, item });
    const settings = videoSceneSettings(base, display, fps, item, style.base);
    const brief = buildVideoSceneBrief({
      item, index: index + 1, total: accepted.length,
      ...(accepted[index - 1] ? { prev: accepted[index - 1] } : {}), ...(accepted[index + 1] ? { next: accepted[index + 1] } : {}),
      projectTitle: project.title, fps, narration: videoNarration(db, root, doc, item), moments: ctx.key_moments ?? [], placement: ctx.placement,
    });
    work.push({
      item, fingerprint, ...(row ? { row } : {}),
      enqueue: { sceneId, title, brief, settings, input: { sceneId, prompt: brief, settings, video: ctx, video_fingerprint: fingerprint, answers: "skip" }, key },
    });
  }
  // все выбранные пропущены — пустой пакет не создаётся
  if (work.length === 0) throw new ApiError(409, "nothing_to_generate", "все выбранные сцены уже готовы по текущему плану или не приняты — генерировать нечего", { skipped });
  stage(core, { project, doc, batchId, work, retitle });
  const dto = videoBatchStatus(db, root, batchId);
  return skipped.length > 0 ? { ...dto, skipped } : dto;
}

/** Брифы до транзакции, затем одна транзакция: план и B те же → пакет → сцены, задачи, события. */
function stage(core: { db: Db; root: string }, s: { project: ProjectDto; doc: VisualPlanRevisionDoc; batchId: string; work: Work[]; retitle: { sceneId: string; title: string }[] }): void {
  const { db, root } = core;
  const { project, doc, batchId, work } = s;
  const pid = project.id;
  const created: string[] = [];
  const replaced: { sceneId: string; prev: string | undefined }[] = [];
  try {
    for (const w of work) {
      if (!w.enqueue) continue;
      if (w.row) replaced.push({ sceneId: w.enqueue.sceneId, prev: readBriefRaw(root, pid, w.enqueue.sceneId) });
      writeBriefSync(root, w.enqueue.sceneId, { prompt: w.enqueue.brief, settings: w.enqueue.settings, created_at: new Date().toISOString() }, pid);
      if (!w.row) created.push(w.enqueue.sceneId);
    }
    tx(db, () => {
      const now = plans.byProject(db, pid);
      if (now?.id !== doc.plan_id || now.current_revision !== doc.revision) throw new ApiError(409, "plan_outdated", "план изменился, пока ставился пакет");
      const approvalId = bValid(db, pid, doc.plan_id, doc.revision);
      if (!approvalId) throw new ApiError(409, "approval_required", `план r${doc.revision} не утверждён (Approval B)`);
      videoBatches.insert(db, { id: batchId, project_id: pid, plan_id: doc.plan_id, plan_revision: doc.revision, approval_id: approvalId });
      for (const r of s.retitle) scenes.setTitle(db, r.sceneId, r.title);
      for (const w of work) {
        let job: Job;
        if (w.reuse) job = w.reuse;
        else {
          const e = w.enqueue!;
          if (!w.row) {
            scenes.create(db, { id: e.sceneId, project_id: pid, title: e.title });
            videoScenes.insert(db, { project_id: pid, plan_id: doc.plan_id, item_id: w.item.id, scene_id: e.sceneId, batch_id: batchId, job_id: null, item_fingerprint: w.fingerprint });
          }
          // утверждённая версия сделана по другой сцене плана — её C устарело (ревью I1)
          const approved = w.row ? scenes.get(db, e.sceneId)?.approved_version_id : undefined;
          const made = approved ? versionVideoFingerprint(db, approved) : undefined;
          if (made !== undefined && made !== w.fingerprint) approvals.markStaleByKey(db, pid, "C", sceneKey(e.sceneId), "plan_changed");
          job = enqueue(db, { type: "playground.generate", projectId: pid, sceneId: e.sceneId, input: e.input, idempotencyKey: e.key }).job;
          // отпечаток — не здесь: он сдвигается после публикации версии (playground.generate)
          videoScenes.setJob(db, e.sceneId, job.id);
        }
        jobEvents.insert(db, { job_id: job.id, level: "info", kind: VIDEO_BATCH_EVENT, message: `видеосцена ${w.item.id} в пакете ${batchId}`, data: { batch_id: batchId, item_id: w.item.id } });
      }
    });
  } catch (e) {
    for (const r of replaced) {
      try {
        const file = join(root, sceneRel(pid, r.sceneId), "brief.json");
        if (r.prev !== undefined) writeFileSync(file, r.prev);
        else rmSync(file, { force: true });
      } catch {
        // бриф — копия входа задачи; источник истины — вход задачи в БД
      }
    }
    for (const id of created) {
      if (scenes.get(db, id)) continue;
      try {
        rmSync(join(root, sceneRel(pid, id)), { recursive: true, force: true });
      } catch {
        // каталог-сироту подберёт уборка
      }
    }
    try {
      removeHollowDir(join(root, PROJECTS_REL, pid));
    } catch {
      // не мешает: restoreFromTrash сам убирает пустой каталог
    }
    throw e;
  }
}

function readBriefRaw(root: string, projectId: string, sceneId: string): string | undefined {
  try {
    return readFileSync(join(root, sceneRel(projectId, sceneId), "brief.json"), "utf8");
  } catch {
    return undefined;
  }
}

interface Member {
  job_id: string;
  item_id: string;
}

/** Задачи пакета по событиям `video_batch` (по порядку постановки; сцена — один раз, последняя). */
function members(db: Db, projectId: string, batchId: string): Member[] {
  const rows = db.prepare(`SELECT e.job_id AS job_id, json_extract(e.data_json, '$.item_id') AS item_id
      FROM jobs j JOIN job_events e ON e.job_id = j.id
      WHERE j.project_id = ? AND e.kind = ? AND json_extract(e.data_json, '$.batch_id') = ?
      ORDER BY e.id`).all(projectId, VIDEO_BATCH_EVENT, batchId) as Member[];
  const byItem = new Map<string, Member>();
  for (const r of rows) byItem.set(r.item_id, r);
  return [...byItem.values()];
}

const STATUSES = ["pending", "running", "ready", "failed", "cancelled", "blocked"] as const;

/** Состояние пакета: сцены, их задачи и версии, счётчики по статусам. */
export function videoBatchStatus(db: Db, root: string, batchId: string): VideoBatchDto {
  const b = videoBatches.get(db, batchId);
  if (!b) throw notFound(`пакет видеосцен ${batchId}`);
  const items = members(db, b.project_id, batchId).map((m) => {
    const job = jobs.get(db, m.job_id)!;
    const versionId = versionOfJob(db, job.id);
    return { item_id: m.item_id, scene_id: job.scene_id!, job: publicJob(job, root), version_id: versionId, status: sceneStatus(job, versionId) as VideoSceneStatus };
  });
  const counts = { total: items.length, ...Object.fromEntries(STATUSES.map((s) => [s, items.filter((x) => x.status === s).length])) } as VideoBatchDto["counts"];
  return { id: b.id, plan_revision: b.plan_revision, items, counts, full: fullVideoBatch(b) };
}

/** Отмена незавершённых задач пакета через `cancelJob`; опубликованные версии остаются, `blocked` — не трогается. */
export async function cancelVideoBatch(core: { db: Db; root: string; processes: ProcessRegistry }, batchId: string): Promise<VideoBatchDto> {
  const before = videoBatchStatus(core.db, core.root, batchId);
  for (const x of before.items) {
    const j = jobs.get(core.db, x.job!.id);
    if (j && BATCH_CANCELLABLE.has(j.status)) await cancelJob(core.db, core.processes, j.id);
  }
  return videoBatchStatus(core.db, core.root, batchId);
}

/** Пакеты видеосцен проекта для `VideoScenesStateDto.batches`: новые первыми. */
export const videoBatchesForState = (db: Db, root: string, projectId: string): VideoBatchDto[] =>
  videoBatches.listByProject(db, projectId).reverse().map((b) => videoBatchStatus(db, root, b.id));
