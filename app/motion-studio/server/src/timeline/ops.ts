// Операции над ревизией таймлайна (Task 42, Р-V6, Д2): перемещение сцены в пределах якорей
// (`snapToWord` → `anchorCheck`; без `override_reason` якорь вне окна — blocking), выбор
// утверждённой версии, включение/исключение. Длительности, режима и зоны с таймлайна нет — только
// через план. `ops` документа — действующие операции пользователя по порядку (накопительно): по
// ним `carryOver` переносит сдвиги на пересобранную ревизию. Синхронная правка —
// `saveTimelineRevision` (409 `revision_conflict` / `resource_busy`), как правка EDL и плана.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type PlanIssue, type TimelineOp, type TimelineVersionRef, type VideoTimelineClip, type VideoTimelineDoc, VideoTimelineDocSchema,
  composeTimeline, mapWords, snapToWord, timelineChecks, usToFrame,
} from "@ms/contracts";
import { canonicalHash, canonicalJson } from "@ms/contracts/canonical";
import { artifactPaths } from "../artifacts/paths.js";
import type { Db } from "../db/open.js";
import * as approvalsRepo from "../db/repos/approvals.js";
import * as transcripts from "../db/repos/transcripts.js";
import { type VideoTimelineRow, videoTimelines } from "../db/repos/video.js";
import * as versions from "../db/repos/versions.js";
import { RevisionConflictError } from "../edit/errors.js";
import { timelineFor } from "../edit/timeline-store.js";
import type { EditDeps } from "../edit/transcript-ops.js";
import { projectLockKey } from "../jobs/locks.js";
import { sceneStates, timelinePlan, versionRef } from "./build.js";

/** Файл документа ревизии таймлайна. */
export const TIMELINE_FILE = "timeline.json";

export type TimelineErrorCode = "timeline_not_found" | "clip_not_found" | "version_not_approved" | "override_reason_required" | "empty_ops" | "no_change";
const STATUS: Record<TimelineErrorCode, number> = {
  timeline_not_found: 404, clip_not_found: 422, version_not_approved: 409, override_reason_required: 422, empty_ops: 422, no_change: 422,
};

/** Операция не применима (422/409) или таймлайна нет (404); сообщение начинается с кода. */
export class TimelineError extends Error {
  readonly status: number;
  constructor(readonly code: TimelineErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "TimelineError";
    this.status = STATUS[code];
  }
}

/** Данные для операций, которых нет в самом документе (их собирает `timelineOpsContext`). */
export interface TimelineOpsContext {
  /** Кадры начала слов смонтированного ролика — прилипание `move`; нет — кадр как есть. */
  wordFrames?: readonly number[];
  /** Клип сцены плана с утверждённой версией (C валидна) — по `clip_id`. */
  approved?: Record<string, VideoTimelineClip>;
  /** Клип с текущей неутверждённой версией (`include: "override"`, причина — из операции) — по `clip_id`. */
  current?: Record<string, VideoTimelineClip>;
  /** Готовые версии сцен по `scene_id` — выбор версии у клипа `override`. */
  ready?: Record<string, TimelineVersionRef[]>;
}

/**
 * Контекст операций над ревизией `doc`: слова ревизии транскрипта, на которой построены её EDL и
 * план (`plan.inputs.transcript`, а не текущая), клипы сцен её плана с утверждённой и текущей
 * версией по текущему состоянию видеосцен и C (`sceneStates`).
 */
export function timelineOpsContext(db: Db, root: string, doc: VideoTimelineDoc): TimelineOpsContext {
  const tl = timelineFor(db, doc.inputs.edl.id, doc.inputs.edl.revision);
  const plan = timelinePlan(db, root, doc.inputs);
  const tr = plan.inputs.transcript;
  const words = transcripts.words(db, tr.id, tr.revision).map((w) => ({ id: w.word_id, start_us: w.start_us, end_us: w.end_us }));
  const wordFrames = [...new Set(Object.values(mapWords(tl, words)).flatMap((m) => (m.state === "removed" ? [] : [usToFrame(m.edited_start_us, tl.fps)])))].sort((a, b) => a - b);
  const states = sceneStates(db, root, plan);
  const base = { tl, items: plan.items, scenes: states, inputs: doc.inputs, timelineId: doc.timeline_id, revision: doc.revision };
  const approved = Object.fromEntries(composeTimeline(base).scenes.map((c) => [c.clip_id, c]));
  const all = Object.fromEntries(plan.items.map((x) => [x.id, "—"]));
  const current = Object.fromEntries(composeTimeline({ ...base, overrides: all }).scenes.filter((c) => c.include === "override").map((c) => {
    const rest = { ...c };
    delete rest.override_reason;
    return [c.clip_id, rest];
  }));
  const ready: Record<string, TimelineVersionRef[]> = {};
  for (const s of Object.values(states)) {
    ready[s.scene_id] = versions.listByScene(db, s.scene_id).filter((v) => v.status === "ready" && v.broken_reason === null).map(versionRef);
  }
  return { wordFrames, approved, current, ready };
}

/** Строка таймлайна по id. */
export function timelineRow(db: Db, timelineId: string): VideoTimelineRow | undefined {
  return db.prepare("SELECT * FROM video_timelines WHERE id = ?").get(timelineId) as VideoTimelineRow | undefined;
}

/** Последний `move` клипа в действующих операциях. */
export function lastMove(ops: readonly TimelineOp[] | undefined, clipId: string): Extract<TimelineOp, { op: "move" }> | undefined {
  return [...(ops ?? [])].reverse().find((o): o is Extract<TimelineOp, { op: "move" }> => o.op === "move" && o.clip_id === clipId);
}

/**
 * Проверки ревизии (`timelineChecks`) с правилом Р-V6 для `override`: причина включения не
 * оправдывает перенос — если последний `move` клипа без `override_reason`, якорь вне окна —
 * blocking (ревью I3).
 */
export function timelineIssues(doc: Pick<VideoTimelineDoc, "scenes" | "duration_frames" | "ops">): PlanIssue[] {
  return timelineChecks(doc).map((i) => {
    if (i.code !== "anchor_outside" || i.severity !== "warning") return i;
    const c = doc.scenes.find((x) => x.item_id === i.item_id);
    const m = c ? lastMove(doc.ops, c.clip_id) : undefined;
    return c?.include === "override" && m !== undefined && m.override_reason === undefined ? { ...i, severity: "blocking" as const } : i;
  });
}

const byStart = (a: VideoTimelineClip, b: VideoTimelineClip) => a.start_frame - b.start_frame || a.clip_id.localeCompare(b.clip_id);

/**
 * Применяет операции к ревизии `doc` (номер ревизии не меняется — его ставит публикация): `move` —
 * прилипание к началу слова (`ctx.wordFrames`), причина операции отменяет blocking `anchor_outside`
 * (у клипа `override` остаётся причина включения); `use_version` — версия с валидной C
 * (`ctx.approved`) или любая готовая у клипа `override`; `include` — исключение пользователем
 * (`excluded: user`) и возврат: утверждённая версия или, с причиной, текущая как `override`, на
 * позиции последнего `move` клипа, если он был. Затем `timelineIssues` (у `override` перенос без
 * причины — blocking). Неприменимая операция — `TimelineError`.
 */
export function applyTimelineOps(doc: VideoTimelineDoc, ops: readonly TimelineOp[], ctx: TimelineOpsContext = {}): VideoTimelineDoc {
  if (ops.length === 0) throw new TimelineError("empty_ops", "нет операций");
  let scenes = doc.scenes.map((c) => ({ ...c }));
  let excluded = doc.excluded.map((x) => ({ ...x }));
  const applied: TimelineOp[] = [...(doc.ops ?? [])];
  const find = (clipId: string): VideoTimelineClip => {
    const c = scenes.find((x) => x.clip_id === clipId);
    if (!c) throw new TimelineError("clip_not_found", `клипа ${clipId} нет на таймлайне r${doc.revision}`);
    return c;
  };
  for (const op of ops) {
    if (op.op === "move") {
      const c = find(op.clip_id);
      c.start_frame = ctx.wordFrames ? snapToWord(op.start_frame, ctx.wordFrames) : op.start_frame;
      if (op.override_reason !== undefined) c.override_reason = op.override_reason;
      else if (c.include === "approved") delete c.override_reason;
      applied.push({ ...op, start_frame: c.start_frame });
    } else if (op.op === "use_version") {
      const c = find(op.clip_id);
      const ok = ctx.approved?.[op.clip_id];
      if (ok && ok.version_id === op.version_id) {
        c.version_id = ok.version_id;
        c.version_number = ok.version_number;
        if (ok.version_frames !== undefined) c.version_frames = ok.version_frames;
        if (c.include === "override") {
          c.include = "approved";
          const reason = lastMove(applied, c.clip_id)?.override_reason;
          if (reason !== undefined) c.override_reason = reason;
          else delete c.override_reason;
        }
      } else {
        const v = c.include === "override" ? ctx.ready?.[c.scene_id]?.find((x) => x.version_id === op.version_id) : undefined;
        if (!v) throw new TimelineError("version_not_approved", `версия ${op.version_id} сцены ${c.item_id} без валидного утверждения (C)`);
        c.version_id = v.version_id;
        c.version_number = v.version_number;
        c.version_frames = v.duration_frames;
      }
      applied.push({ ...op });
    } else if (!op.include) {
      const c = find(op.clip_id);
      scenes = scenes.filter((x) => x.clip_id !== c.clip_id);
      excluded = [...excluded.filter((x) => x.item_id !== c.item_id), { item_id: c.item_id, reason: "user" }];
      applied.push({ ...op });
    } else {
      const on = scenes.find((x) => x.clip_id === op.clip_id);
      if (on) {
        if (on.include === "override" && op.override_reason !== undefined) on.override_reason = op.override_reason;
      } else {
        const ok = ctx.approved?.[op.clip_id];
        const cur = ctx.current?.[op.clip_id];
        let add: VideoTimelineClip;
        if (ok) add = { ...ok };
        else if (cur && op.override_reason !== undefined) add = { ...cur, override_reason: op.override_reason };
        else if (cur) throw new TimelineError("override_reason_required", `сцена ${cur.item_id} не утверждена (C): включить можно только с причиной`);
        else throw new TimelineError("version_not_approved", `у сцены ${op.clip_id} нет утверждённой версии`);
        // возврат сцены не сбрасывает сдвиг пользователя: последний `move` клипа снова в силе
        const m = lastMove(applied, add.clip_id);
        if (m) {
          add.start_frame = m.start_frame;
          if (m.override_reason !== undefined) add.override_reason = m.override_reason;
        }
        scenes.push(add);
        excluded = excluded.filter((x) => x.item_id !== add.item_id);
      }
      applied.push({ ...op });
    }
  }
  scenes.sort(byStart);
  const next: VideoTimelineDoc = { ...doc, scenes, excluded, ops: applied };
  return { ...next, issues: timelineIssues(next) };
}

/** Документ ревизии таймлайна (по умолчанию текущей) из хранилища, проверенный схемой. */
export function readTimelineDoc(db: Db, root: string, timelineId: string, revision?: number): VideoTimelineDoc {
  const t = timelineRow(db, timelineId);
  const rev = revision ?? t?.current_revision ?? undefined;
  const row = t && rev !== undefined ? videoTimelines.revision(db, timelineId, rev) : undefined;
  if (!row) throw new TimelineError("timeline_not_found", `нет таймлайна ${timelineId}${revision === undefined ? "" : ` r${revision}`}`);
  return VideoTimelineDocSchema.parse(JSON.parse(readFileSync(join(root, row.rel_path), "utf8")));
}

/**
 * Регистрация опубликованной ревизии (в транзакции публикации): строка таймлайна (первая ревизия),
 * индекс ревизии с `canonicalHash(doc)` и `current_revision`; валидное решение final по таймлайну →
 * `stale(timeline_changed)` (финал утверждается на конкретную ревизию).
 */
export function registerTimelineRevision(db: Db, r: { projectId: string; doc: VideoTimelineDoc; relPath: string; sha256: string }): void {
  if (!timelineRow(db, r.doc.timeline_id)) videoTimelines.create(db, { id: r.doc.timeline_id, project_id: r.projectId });
  videoTimelines.insertRevision(db, {
    timeline_id: r.doc.timeline_id, revision: r.doc.revision, parent_revision: r.doc.parent_revision ?? null, rel_path: r.relPath, sha256: r.sha256, hash: canonicalHash(r.doc),
  });
  approvalsRepo.markStaleByKey(db, r.projectId, "final", `timeline:${r.doc.timeline_id}`, "timeline_changed");
}

/** Синхронная публикация ревизии `doc` (`writeRevision`, замок `project:<p>:timeline`). */
export async function publishTimelineRevision(deps: EditDeps, projectId: string, doc: VideoTimelineDoc, check?: (db: Db) => Error | undefined): Promise<VideoTimelineDoc> {
  const valid = VideoTimelineDocSchema.parse(doc);
  const destRel = artifactPaths(deps.root, projectId).timelineRev(valid.timeline_id, valid.revision);
  await deps.store.writeRevision(destRel, TIMELINE_FILE, valid, (d, files) => {
    registerTimelineRevision(d, { projectId, doc: valid, relPath: `${destRel}/${TIMELINE_FILE}`, sha256: files[0]!.sha256 });
  }, { lockKey: projectLockKey(projectId, "timeline"), ...(check ? { check } : {}) });
  return valid;
}

/** Содержимое ревизии без номера, родителя и журнала операций — для сравнения «ничего не меняет». */
export function timelineContent(doc: VideoTimelineDoc): string {
  const rest: Partial<VideoTimelineDoc> = { ...doc };
  delete rest.revision;
  delete rest.parent_revision;
  delete rest.ops;
  return canonicalJson(rest);
}

/**
 * Правка пользователя: `base_revision ≠ current` → `revision_conflict` (409), таймлайн пишет задача
 * → `resource_busy` (409), холостая правка → `no_change`. Новая ревизия `base + 1` с теми же
 * входами; одна транзакция публикации — файл и индекс.
 */
export async function saveTimelineRevision(deps: EditDeps, timelineId: string, body: { base_revision: number; ops: TimelineOp[] }): Promise<VideoTimelineDoc> {
  const t = timelineRow(deps.db, timelineId);
  if (!t || t.current_revision === null) throw new TimelineError("timeline_not_found", `нет таймлайна ${timelineId}`);
  const conflict = (d: Db): RevisionConflictError | undefined => {
    const cur = timelineRow(d, timelineId)!.current_revision;
    return cur === body.base_revision ? undefined : new RevisionConflictError(`таймлайн ${timelineId}`, body.base_revision, cur);
  };
  const early = conflict(deps.db);
  if (early) throw early;
  const base = readTimelineDoc(deps.db, deps.root, timelineId, body.base_revision);
  const applied = applyTimelineOps(base, body.ops, timelineOpsContext(deps.db, deps.root, base));
  const next: VideoTimelineDoc = { ...applied, revision: base.revision + 1, parent_revision: base.revision };
  if (timelineContent(next) === timelineContent(base)) throw new TimelineError("no_change", "правка не меняет таймлайн — новая ревизия не создаётся");
  return publishTimelineRevision(deps, t.project_id, next, conflict);
}
