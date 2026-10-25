// Задача `timeline.build` (Task 42, без LLM): ревизия таймлайна проекта из текущих EDL, плана и
// версий с Approval C (`buildTimelineDoc`). Прежняя ревизия есть — сдвиги и исключения
// пользователя переносятся (`carryOver`; операции выпавшей сцены ждут её возвращения); состав не изменился — `no_change` без новой ревизии.
// Публикация `timeline/<id>/r<N>/timeline.json` с fencing; в транзакции публикации входы
// сверяются с текущими (EDL или план сменились между сборкой и публикацией — сборка заново, до 3
// раз). A или B не валидны — `approval_required`. Прошлая попытка уже опубликовала — по ней (M3).
import { type VideoTimelineDoc, VideoTimelineDocSchema } from "@ms/contracts";
import { z } from "zod";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactStore, publicationsByJob } from "../artifacts/store.js";
import type { Db } from "../db/open.js";
import * as projects from "../db/repos/projects.js";
import { videoTimelines } from "../db/repos/video.js";
import { EditError, RevisionConflictError } from "../edit/errors.js";
import type { HandlerResult, JobHandler } from "../jobs/types.js";
import { buildTimelineDoc, currentTimelineInputs, planStarts, timelineIdFor, timelinePlan } from "../timeline/build.js";
import { type SeenClip, carryOver } from "../timeline/carry-over.js";
import { TIMELINE_FILE, readTimelineDoc, registerTimelineRevision, timelineContent } from "../timeline/ops.js";
import { type Phase46Deps } from "./phase46-deps.js";
import { planFailure } from "./plan-visual.js";

export type TimelineBuildDeps = Phase46Deps;

const InputSchema = z.object({ projectId: z.string().min(1) }).strict();

/** Итог задачи (`output_refs`). */
export interface TimelineBuildResult {
  timeline_id: string;
  revision: number;
  /** Ревизия уже отражает текущие входы и решения — новая не публиковалась. */
  no_change?: true;
  reused?: boolean;
  scenes?: number;
  excluded?: number;
  blocking?: number;
  /** Клипы, чей сдвиг перенесён с прежней ревизии; не перенесённые — `dropped` (`move_dropped`). */
  carried?: string[];
  dropped?: string[];
}

const BUILD_TRIES = 3;

/**
 * Клипы с отложенными операциями (`prev.ops` есть, в `prev.scenes` нет — сцена выпадала): каким
 * клип был в последней предыдущей ревизии, где стоял на таймлайне, и позиция его сцены в плане
 * той ревизии — опора для переноса сдвига (`carryOver`, ревью I2).
 */
export function lastSeenClips(db: Db, root: string, prev: VideoTimelineDoc): Record<string, SeenClip> {
  const want = new Set((prev.ops ?? []).map((o) => o.clip_id).filter((id) => !prev.scenes.some((c) => c.clip_id === id)));
  const out: Record<string, SeenClip> = {};
  let rev = prev.parent_revision;
  while (want.size > 0 && rev !== undefined) {
    const d = readTimelineDoc(db, root, prev.timeline_id, rev);
    let starts: Record<string, number> | undefined;
    for (const c of d.scenes) {
      if (!want.has(c.clip_id)) continue;
      starts ??= planStarts(timelinePlan(db, root, d.inputs).items);
      const planStart = starts[c.item_id];
      out[c.clip_id] = { clip: c, ...(planStart !== undefined ? { planStart } : {}) };
      want.delete(c.clip_id);
    }
    rev = d.parent_revision;
  }
  return out;
}
const sameRef = (a: { id: string; revision: number; hash: string }, b: { id: string; revision: number; hash: string }) => a.id === b.id && a.revision === b.revision && a.hash === b.hash;

export const timelineBuild: (depsOf: () => TimelineBuildDeps) => JobHandler = (depsOf) => async (ctx) => {
  const prep = (message: string): HandlerResult => ({ status: "failed", error: { code: "pipeline", stage: "prepare", message } });
  const parsed = InputSchema.safeParse(ctx.job.input);
  if (!parsed.success) return prep(`вход timeline.build не годится: ${parsed.error.message}`);
  const projectId = parsed.data.projectId;
  if (projectId !== ctx.job.project_id) return prep(`вход timeline.build: projectId ${projectId} не совпадает с проектом задачи ${ctx.job.project_id}`);
  if (!projects.get(ctx.db, projectId)) return prep(`проекта ${projectId} нет`);
  const { svc } = depsOf();
  const root = svc.root;
  const storage = svc.storageCheck;
  let stage = "prepare";
  const done = (r: TimelineBuildResult): HandlerResult => {
    ctx.progress(1, "done");
    return { status: "completed", outputRefs: r };
  };
  try {
    const pre = `${artifactPaths(root, projectId).project}/timeline/`;
    const mine = publicationsByJob(ctx.db, ctx.job.id).map((r) => /^([A-Za-z0-9_]+)\/r([1-9][0-9]*)$/.exec(r.dest_rel.startsWith(pre) ? r.dest_rel.slice(pre.length) : "")).find((m) => m !== null);
    if (mine) {
      const doc = readTimelineDoc(ctx.db, root, mine[1]!, Number(mine[2]));
      ctx.emit("timeline_reused", `ревизия таймлайна ${doc.timeline_id} r${doc.revision} опубликована прошлой попыткой`);
      return done({ timeline_id: doc.timeline_id, revision: doc.revision, reused: true });
    }
    const status = await storage();
    if (!status.ok) return { status: "failed", error: { code: "storage_unavailable", stage: "storage", message: `${status.reason}: ${status.detail}` } };
    const store = new ArtifactStore({ root, db: ctx.db, guard: storage });
    for (let attempt = 1; ; attempt++) {
      stage = "prepare";
      ctx.progress(0.1, "prepare");
      const row = videoTimelines.byProject(ctx.db, projectId);
      const timelineId = row?.id ?? timelineIdFor(projectId);
      const cur = row?.current_revision ?? undefined;
      const prev = cur === undefined ? undefined : readTimelineDoc(ctx.db, root, timelineId, cur);
      const built = buildTimelineDoc(ctx.db, root, projectId, { timelineId, revision: (cur ?? 0) + 1, ...(cur !== undefined ? { parentRevision: cur } : {}) });
      const next = prev ? carryOver(prev, built, { prevPlanStarts: planStarts(timelinePlan(ctx.db, root, prev.inputs).items), lastSeen: lastSeenClips(ctx.db, root, prev) }) : built;
      if (prev && timelineContent(prev) === timelineContent(next)) {
        ctx.emit("timeline_current", `таймлайн ${timelineId} r${prev.revision} уже собран по текущим монтажу, плану и утверждённым версиям — новая ревизия не нужна`);
        return done({ timeline_id: timelineId, revision: prev.revision, no_change: true });
      }
      const doc = VideoTimelineDocSchema.parse(next);
      const destRel = artifactPaths(root, projectId).timelineRev(timelineId, doc.revision);
      // в транзакции публикации: ревизия таймлайна и входы те же, что при сборке
      const check = (db: Db): Error | undefined => {
        const now = videoTimelines.byProject(db, projectId)?.current_revision ?? null;
        if (now !== (cur ?? null)) return new RevisionConflictError(`таймлайн ${timelineId}`, cur ?? 0, now);
        const inputs = currentTimelineInputs(db, projectId);
        const fresh = inputs && sameRef(inputs.edl, doc.inputs.edl) && sameRef(inputs.plan, doc.inputs.plan) && sameRef(inputs.style, doc.inputs.style);
        return fresh ? undefined : new RevisionConflictError(`входы таймлайна ${timelineId} (EDL/план/стиль)`, doc.inputs.plan.revision, inputs?.plan.revision ?? null);
      };
      stage = "publish";
      ctx.progress(0.8, "publish");
      ctx.signal.throwIfAborted();
      try {
        await store.publishJobDoc({ jobId: ctx.job.id, attempt: ctx.attempt }, destRel, TIMELINE_FILE, doc, (db, files) => {
          registerTimelineRevision(db, { projectId, doc, relPath: `${destRel}/${TIMELINE_FILE}`, sha256: files[0]!.sha256 });
        }, { check });
      } catch (e) {
        if (e instanceof RevisionConflictError && attempt < BUILD_TRIES) {
          ctx.emit("timeline_rebuild", `${e.message} — сборка заново (${attempt + 1}/${BUILD_TRIES})`);
          continue;
        }
        throw e;
      }
      const dropped = doc.issues.filter((i) => i.code === "move_dropped").map((i) => `clip_${i.item_id}`);
      // отложенные сдвиги (сцены нет на таймлайне) перенесёнными не считаются
      const carried = (doc.ops ?? []).filter((o) => o.op === "move" && doc.scenes.some((c) => c.clip_id === o.clip_id)).map((o) => o.clip_id);
      const blocking = doc.issues.filter((i) => i.severity === "blocking").length;
      ctx.emit("timeline_built", `таймлайн ${timelineId} r${doc.revision}: сцен ${doc.scenes.length}, исключено ${doc.excluded.length}, блокирующих проблем ${blocking}${prev ? `, перенесено сдвигов ${carried.length}, сброшено ${dropped.length}` : ""}`);
      return done({ timeline_id: timelineId, revision: doc.revision, reused: false, scenes: doc.scenes.length, excluded: doc.excluded.length, blocking, carried, dropped });
    }
  } catch (e) {
    if (e instanceof EditError && e.code === "approval_required") return { status: "failed", error: { code: "approval_required", message: e.message } };
    return planFailure(e, { ctx, stage, storage, what: "сборка таймлайна" });
  }
};
