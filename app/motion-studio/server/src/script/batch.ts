// Пакеты генерации сценария (трек B, S5; спека §6.2, §7, §11): Approval B на ревизию плана,
// сцены Playground и задачи `playground.generate` — одной транзакцией. Пакет — не задача, а
// набор обычных задач с ключами `script:<planId>@r<rev>:<itemId>:<aspect>:s<styleRev>[:try-n][:regen-k]`;
// членство задачи в пакете — событие `script_batch` в `job_events` той же транзакции (сцена
// может войти в несколько пакетов: «Повторить», новый стиль), `script_scenes.job_id` — последняя.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Aspect,
  type Job,
  type ScriptBatchDto,
  type ScriptItemStatus,
  type ScriptSceneContext,
  type ScriptSceneItem,
  type Settings,
  defaultSettings,
} from "@ms/contracts";
import type { ProcessRegistry } from "@ms/core";
import { currentProjectStyle } from "../analysis/project-style.js";
import { ApiError, notFound } from "../api/errors.js";
import { publicJob } from "../api/job-dto.js";
import { approve, peekApprovalState } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import type { Db } from "../db/open.js";
import * as jobEvents from "../db/repos/job-events.js";
import * as jobs from "../db/repos/jobs.js";
import * as plans from "../db/repos/plans.js";
import * as projects from "../db/repos/projects.js";
import * as scenes from "../db/repos/scenes.js";
import { type ScriptBatchRow, type ScriptSceneRow, scriptBatches, scriptScenes } from "../db/repos/script.js";
import * as versions from "../db/repos/versions.js";
import { tx } from "../db/tx.js";
import { cancelJob, enqueue } from "../jobs/queue.js";
import { sha256 } from "../scenes/hash.js";
import { newId } from "../scenes/ids.js";
import { sceneRel, writeBriefSync } from "../scenes/store.js";
import { buildSceneBrief, keyMoments, sceneSettings, sceneTitle, sentenceWindows } from "./brief.js";
import { itemFingerprint } from "./fingerprint.js";
import { type PlanApprovable, planApprovable } from "./plan-state.js";
import { currentScript, currentScriptPlan } from "./read.js";
import { sceneStatus } from "./state.js";

/** Вид события `job_events`: задача входит в пакет (`data: { batch_id, item_id }`). */
export const BATCH_EVENT = "script_batch";

/** Задача сцены ещё идёт (или ждёт человека): новую не ставим, она входит в пакет как есть. */
const ACTIVE: ReadonlySet<Job["status"]> = new Set(["pending", "running", "awaiting_input", "awaiting_approval", "blocked"]);
/** Отменяемые пакетом статусы (blocked — решение человека: разбор процессов, `jobs/:id/cancel`). */
const CANCELLABLE: ReadonlySet<Job["status"]> = new Set(["pending", "running", "awaiting_input", "awaiting_approval"]);

export interface StartBatchInput {
  projectId: string;
  /** Ревизия плана, которую человек утверждает (`GenerateBody.revision`). */
  revision: number;
  itemIds?: string[];
  regenerate?: boolean;
  aspect?: Aspect;
  idempotencyKey: string;
}

const APPROVABLE_ERR: Record<Exclude<PlanApprovable, { ok: true }>["code"], [number, string]> = {
  plan_outdated: [409, "текст сценария изменился после плана — перестройте план"],
  blocking_issues: [422, "в плане есть блокирующие проблемы"],
  no_items: [422, "в плане нет принятых сцен"],
};

/** Префикс id пакета из ключа запроса: повтор того же `Idempotency-Key` находит пакет без новой колонки. */
const keyPrefix = (projectId: string, key: string): string => `sb_${sha256(`${projectId}\n${key}`).slice(0, 20)}`;
/** Отпечаток тела запроса в id пакета (M6): тот же ключ с другим телом — 422 `idempotency_key_reused`. */
const requestTag = (i: StartBatchInput, aspect: Aspect): string =>
  sha256(JSON.stringify({ revision: i.revision, aspect, item_ids: i.itemIds ? [...new Set(i.itemIds)].sort() : null, regenerate: i.regenerate === true })).slice(0, 10);

/** Пакет, созданный запросом с этим `Idempotency-Key` (любое тело), — для 200/202 маршрута. */
export function batchForKey(db: Db, projectId: string, key: string): ScriptBatchRow | undefined {
  const prefix = keyPrefix(projectId, key);
  return scriptBatches.listByProject(db, projectId).find((b) => b.id.startsWith(prefix));
}

/** Ключ задачи генерации сцены (§11, Р23). */
export function sceneJobKey(k: { planId: string; revision: number; itemId: string; aspect: Aspect; styleRevision: number; tryN?: number; regenK?: number }): string {
  return `script:${k.planId}@r${k.revision}:${k.itemId}:${k.aspect}:s${k.styleRevision}${k.tryN ? `:try-${k.tryN}` : ""}${k.regenK ? `:regen-${k.regenK}` : ""}`;
}

/** Последняя готовая версия, опубликованная задачей. */
const versionOfJob = (db: Db, jobId: string): string | null =>
  versions.listByJob(db, jobId).filter((v) => v.status === "ready" && !v.broken_reason).at(-1)?.id ?? null;

/** Число задач генерации сцены (для `:try-n`, `:regen-k`). */
const generateJobs = (db: Db, sceneId: string): number => jobs.list(db, { sceneId }).filter((j) => j.type === "playground.generate").length;

interface Work {
  item: ScriptSceneItem;
  index: number;
  fingerprint: string;
  /** Есть строка `script_scenes` — сцена Playground уже есть. */
  row?: ScriptSceneRow;
  /** Новая задача (бриф, настройки, вход, ключ) или идущая задача сцены. */
  enqueue?: { sceneId: string; title: string; brief: string; settings: Settings; input: unknown; key: string };
  reuse?: Job;
}

/**
 * Утверждение B и пакет генерации. Стиль — текущий стиль проекта (Р15). Брифы новых сцен
 * пишутся до SQL-транзакции; откат — их каталоги удаляются. Затем одна транзакция:
 * `planApprovable` → `approve(B)` (если валидного на этот субъект нет) → `script_batches` →
 * на каждую выбранную принятую сцену без готовой версии по текущему отпечатку (`regenerate` —
 * все выбранные): сцена → задача → `script_scenes.setJob`. Идущая задача сцены входит в пакет
 * без новой. Повтор того же ключа — тот же пакет.
 */
export function startScriptBatch(core: { db: Db; root: string }, i: StartBatchInput): ScriptBatchDto {
  const { db, root } = core;
  const project = projects.get(db, i.projectId);
  if (!project) throw notFound(`проект ${i.projectId}`);
  if (project.kind !== "script") throw new ApiError(409, "not_script_project", "проект не сценарный");
  const aspect = i.aspect ?? "16:9";
  const batchId = `${keyPrefix(i.projectId, i.idempotencyKey)}${requestTag(i, aspect)}`;
  const existing = batchForKey(db, i.projectId, i.idempotencyKey);
  if (existing) {
    if (existing.id !== batchId) {
      throw new ApiError(422, "idempotency_key_reused", `ключ ${i.idempotencyKey} уже использован пакетом ${existing.id} с другим запросом`);
    }
    return batchStatus(db, root, batchId);
  }

  const script = currentScript(db, root, i.projectId);
  if (!script) throw new ApiError(409, "no_script", "текста сценария нет");
  const cur = currentScriptPlan(db, root, i.projectId);
  if (!cur) throw new ApiError(409, "no_plan", "плана сценария нет");
  const doc = cur.doc;
  if (doc.revision !== i.revision) throw new ApiError(409, "plan_outdated", `ревизия плана r${i.revision} не текущая (текущая r${doc.revision})`);
  const style = currentProjectStyle(db, root, i.projectId);
  if (!style) throw new ApiError(409, "no_style", "стиля проекта нет");
  const styleRef = { id: style.style_id, revision: style.revision };

  const accepted = doc.items.filter((x) => x.status === "accepted");
  const skipped: { item_id: string; reason: string }[] = [];
  let selected = accepted;
  if (i.itemIds) {
    const known = new Map(doc.items.map((x) => [x.id, x]));
    const unknown = i.itemIds.filter((id) => !known.has(id));
    if (unknown.length > 0) throw new ApiError(422, "unknown_item", `в плане нет сцен: ${unknown.join(", ")}`);
    const want = new Set(i.itemIds);
    for (const id of i.itemIds) if (known.get(id)!.status !== "accepted") skipped.push({ item_id: id, reason: "сцена снята с плана" });
    selected = accepted.filter((x) => want.has(x.id));
  }

  // план работ до записи: что ставить, что уже готово, что идёт
  const base: Settings = { ...(project.settings ?? defaultSettings()), fps: doc.fps };
  const work: Work[] = [];
  // названия существующих сцен «NN · цитата» по текущей ревизии (номер мог сместиться)
  const retitle: { sceneId: string; title: string }[] = [];
  for (const item of selected) {
    const index = accepted.indexOf(item);
    const fingerprint = itemFingerprint(item, styleRef);
    const row = scriptScenes.get(db, cur.planId, item.id, aspect);
    if (row) {
      const title = sceneTitle(index + 1, item);
      if (scenes.get(db, row.scene_id)?.title !== title) retitle.push({ sceneId: row.scene_id, title });
    }
    const last = row?.job_id ? jobs.get(db, row.job_id) : undefined;
    if (!i.regenerate && row) {
      // идущая задача на тот же отпечаток — входит в пакет как есть
      if (last && ACTIVE.has(last.status) && inputFingerprint(last.input) === fingerprint) {
        work.push({ item, index, fingerprint, row, reuse: last });
        continue;
      }
      // готова: текущая версия опубликована по этому отпечатку (он пишется после публикации)
      if (row.item_fingerprint === fingerprint && scenes.get(db, row.scene_id)?.current_version_id) {
        skipped.push({ item_id: item.id, reason: "готовая версия по текущему плану" });
        continue;
      }
    }
    const sceneId = row?.scene_id ?? newId("scn");
    const prior = row ? generateJobs(db, row.scene_id) : 0;
    const failedLast = last !== undefined && (last.status === "failed" || last.status === "cancelled");
    const keyOf = (tryN: number | undefined) => sceneJobKey({
      planId: cur.planId, revision: doc.revision, itemId: item.id, aspect, styleRevision: style.revision,
      ...(tryN ? { tryN } : {}), ...(i.regenerate ? { regenK: prior } : {}),
    });
    // :try-n — последняя задача упала или отменена; ключ уже занят завершённой задачей
    // (завершилась без версии) — тоже новый номер, иначе очередь вернула бы старую
    let tryN = failedLast ? prior : undefined;
    for (let k = keyOf(tryN); jobs.findByIdempotencyKey(db, k) && !ACTIVE.has(jobs.findByIdempotencyKey(db, k)!.status); k = keyOf(tryN)) tryN = (tryN ?? prior) + 1;
    const settings = sceneSettings(base, item, aspect, style.base);
    // S11: моменты слов ключевых чисел и терминов — в бриф и в проверку spec (`key_term_early`)
    const moments = keyMoments(item, script, doc.reading, doc.fps);
    const brief = buildSceneBrief({
      item, index: index + 1, total: accepted.length,
      ...(accepted[index - 1] ? { prev: accepted[index - 1] } : {}), ...(accepted[index + 1] ? { next: accepted[index + 1] } : {}),
      projectTitle: project.title, fps: doc.fps, windows: sentenceWindows(item, script, doc.reading, doc.fps), moments,
    });
    const ctx: ScriptSceneContext = {
      project_id: i.projectId, plan_id: cur.planId, plan_revision: doc.revision, item_id: item.id, aspect,
      style: style.base, lead_frames: item.frames.lead, tail_frames: item.frames.tail,
      ...(moments.length > 0 ? { key_moments: moments } : {}),
    };
    work.push({
      item, index, fingerprint, ...(row ? { row } : {}),
      enqueue: { sceneId, title: sceneTitle(index + 1, item), brief, settings, input: { sceneId, prompt: brief, settings, script: ctx, script_fingerprint: fingerprint, answers: "skip" }, key: keyOf(tryN) },
    });
  }

  // брифы — до транзакции (синхронно, safeMkdir); откат — каталоги новых сцен убираются,
  // brief.json существующих возвращается прежним (M7)
  const created: string[] = [];
  const replaced: { sceneId: string; prev: string | undefined }[] = [];
  try {
    for (const w of work) {
      if (!w.enqueue) continue;
      if (w.row) replaced.push({ sceneId: w.enqueue.sceneId, prev: readBriefRaw(root, i.projectId, w.enqueue.sceneId) });
      writeBriefSync(root, w.enqueue.sceneId, { prompt: w.enqueue.brief, settings: w.enqueue.settings, created_at: new Date().toISOString() }, i.projectId);
      if (!w.row) created.push(w.enqueue.sceneId);
    }
    tx(db, () => {
      const now = plans.byProject(db, i.projectId);
      if (now?.id !== cur.planId || now.current_revision !== doc.revision) throw new ApiError(409, "plan_outdated", "план изменился, пока ставился пакет");
      const ok = planApprovable(doc, script);
      if (!ok.ok) {
        const [status, message] = APPROVABLE_ERR[ok.code];
        throw new ApiError(status, ok.code, message, ok.issues ? { issues: ok.issues } : {});
      }
      const subject = currentSubject(db, i.projectId, "B")!;
      const peek = peekApprovalState(db, i.projectId, "B", subject);
      const approval = peek.state === "valid" && peek.approval ? peek.approval : approve(db, { projectId: i.projectId, kind: "B", subjectRef: subject.ref, subjectHash: subject.hash });
      scriptBatches.insert(db, { id: batchId, project_id: i.projectId, plan_id: cur.planId, plan_revision: doc.revision, aspect, approval_id: approval.id });
      for (const r of retitle) scenes.setTitle(db, r.sceneId, r.title);
      for (const w of work) {
        let job: Job;
        if (w.reuse) job = w.reuse;
        else {
          const e = w.enqueue!;
          if (!w.row) {
            scenes.create(db, { id: e.sceneId, project_id: i.projectId, title: e.title });
            scriptScenes.insert(db, { project_id: i.projectId, plan_id: cur.planId, item_id: w.item.id, aspect, scene_id: e.sceneId, batch_id: batchId, job_id: null, item_fingerprint: w.fingerprint });
          }
          job = enqueue(db, { type: "playground.generate", projectId: i.projectId, sceneId: e.sceneId, input: e.input, idempotencyKey: e.key }).job;
          // отпечаток — не здесь: он сдвигается после публикации версии (recordPublishedFingerprint)
          scriptScenes.setJob(db, e.sceneId, job.id);
        }
        jobEvents.insert(db, { job_id: job.id, level: "info", kind: BATCH_EVENT, message: `сцена ${w.item.id} в пакете ${batchId}`, data: { batch_id: batchId, item_id: w.item.id } });
      }
    });
  } catch (e) {
    for (const r of replaced) {
      try {
        if (r.prev !== undefined) writeFileSync(join(root, sceneRel(i.projectId, r.sceneId), "brief.json"), r.prev);
      } catch {
        // бриф — копия входа задачи; источник истины — вход задачи в БД
      }
    }
    for (const id of created) {
      if (scenes.get(db, id)) continue;
      try {
        rmSync(join(root, sceneRel(i.projectId, id)), { recursive: true, force: true });
      } catch {
        // каталог-сироту подберёт уборка
      }
    }
    throw e;
  }
  const dto = batchStatus(db, root, batchId);
  return skipped.length > 0 ? { ...dto, skipped } : dto;
}

/** Текущий brief.json сцены как есть (для отката); нет — `undefined`. */
function readBriefRaw(root: string, projectId: string, sceneId: string): string | undefined {
  try {
    return readFileSync(join(root, sceneRel(projectId, sceneId), "brief.json"), "utf8");
  } catch {
    return undefined;
  }
}

/** Отпечаток сцены плана из входа задачи (`script_fingerprint`). */
function inputFingerprint(input: unknown): string | undefined {
  const fp = (input as { script_fingerprint?: unknown } | null)?.script_fingerprint;
  return typeof fp === "string" ? fp : undefined;
}

/**
 * После успешной публикации версии сцены сценария (S5 fix I2): отпечаток входа задачи
 * становится отпечатком текущей версии. Пока новая задача идёт, упала или отменена, старая
 * версия остаётся `stale`. Вход без отпечатка (Playground) — ничего.
 */
export function recordPublishedFingerprint(db: Db, sceneId: string, input: unknown): void {
  const fp = inputFingerprint(input);
  if (fp) scriptScenes.setFingerprint(db, sceneId, fp);
}

interface Member {
  job_id: string;
  item_id: string;
}

/** Задачи пакета по событиям `script_batch` (по порядку постановки; сцена — один раз). */
function members(db: Db, projectId: string, batchId: string): Member[] {
  const rows = db.prepare(`SELECT e.job_id AS job_id, json_extract(e.data_json, '$.item_id') AS item_id
      FROM jobs j JOIN job_events e ON e.job_id = j.id
      WHERE j.project_id = ? AND e.kind = ? AND json_extract(e.data_json, '$.batch_id') = ?
      ORDER BY e.id`).all(projectId, BATCH_EVENT, batchId) as Member[];
  const byItem = new Map<string, Member>();
  for (const r of rows) byItem.set(r.item_id, r);
  return [...byItem.values()];
}

const STATUSES = ["pending", "running", "ready", "failed", "cancelled", "blocked"] as const;

/** Состояние пакета: сцены, их задачи и версии, счётчики по статусам. */
export function batchStatus(db: Db, root: string, batchId: string): ScriptBatchDto {
  const b = scriptBatches.get(db, batchId);
  if (!b) throw notFound(`пакет генерации ${batchId}`);
  const items = members(db, b.project_id, batchId).map((m) => {
    const job = jobs.get(db, m.job_id)!;
    const versionId = versionOfJob(db, job.id);
    return { item_id: m.item_id, scene_id: job.scene_id!, job: publicJob(job, root), version_id: versionId, status: sceneStatus(job, versionId) as ScriptItemStatus };
  });
  const counts = { total: items.length, ...Object.fromEntries(STATUSES.map((s) => [s, items.filter((x) => x.status === s).length])) } as ScriptBatchDto["counts"];
  return { id: b.id, aspect: b.aspect, plan_revision: b.plan_revision, items, counts };
}

/**
 * Отмена незавершённых задач пакета (`pending`, `running`, `awaiting_input`): через `cancelJob`
 * (идущая попытка прерывается, опубликованные версии остаются). `blocked` пакет не трогает.
 */
export async function cancelBatch(core: { db: Db; root: string; processes: ProcessRegistry }, batchId: string): Promise<ScriptBatchDto> {
  const before = batchStatus(core.db, core.root, batchId);
  for (const x of before.items) {
    const j = jobs.get(core.db, x.job!.id);
    if (j && CANCELLABLE.has(j.status)) await cancelJob(core.db, core.processes, j.id);
  }
  return batchStatus(core.db, core.root, batchId);
}

/** Пакеты генерации проекта для `ScriptStateDto.batches`: новые первыми. */
export const batchesForState: (db: Db, root: string, projectId: string) => ScriptBatchDto[] = (db, root, projectId) =>
  scriptBatches.listByProject(db, projectId).reverse().map((b) => batchStatus(db, root, b.id));
