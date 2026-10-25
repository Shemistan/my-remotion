// Обработчик `plan.recheck` (Task 32, без LLM): после новой ревизии EDL (`registerEdlRevision`
// ставит задачу) план пересчитывается на текущем монтаже — `recheckPlan`: сцены с вырезанными
// словами — `stale(anchor_cut)`, с сильно изменившейся длительностью — `stale(timing_changed)`,
// остальные — новые времена и кадры. Новая ревизия плана с fencing; Approval B на прежней ревизии
// становится `stale` (смена субъекта в `publishPlanRevision`). Новая ревизия стиля проекта
// (`saveProjectStyle` ставит задачу) — план переносится на неё без LLM с теми же решениями
// (`restylePlan`; EDL тоже сменился — вместе с `recheckPlan`). Плана нет — `no_plan`; план уже на
// текущих EDL, транскрипте и стиле — `no_change`. M3: ревизия, опубликованная прошлой попыткой, — по ней.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { VisualPlanRevisionDocSchema } from "@ms/contracts";
import { PLAN_FILE, currentPlan, publishPlanRevision, readFootage } from "../analysis/plan-ops.js";
import { type RecheckChange, recheckPlan, restylePlan } from "../analysis/plan-recheck.js";
import { artifactPaths } from "../artifacts/paths.js";
import { ArtifactStore } from "../artifacts/store.js";
import * as edls from "../db/repos/edls.js";
import * as plans from "../db/repos/plans.js";
import * as projects from "../db/repos/projects.js";
import * as styles from "../db/repos/styles.js";
import * as transcripts from "../db/repos/transcripts.js";
import { RevisionConflictError } from "../edit/errors.js";
import { timelineFor } from "../edit/timeline-store.js";
import { currentTranscript } from "../edit/transcript-ops.js";
import type { HandlerResult, JobHandler } from "../jobs/types.js";
import { PlanJobInputSchema, type PlanStage, type PlanVisualDeps, planFailure, planPublications } from "./plan-visual.js";

export type PlanRecheckDeps = Pick<PlanVisualDeps, "root" | "config" | "storage" | "onStage" | "log">;

/** Итог задачи (`output_refs`). */
export interface PlanRecheckResult {
  /** У проекта нет плана — перепроверять нечего. */
  no_plan?: true;
  /** План уже построен по текущим ревизиям EDL, транскрипта и стиля. */
  no_change?: true;
  plan_id?: string;
  revision?: number;
  edl_revision?: number;
  /** Ревизия стиля проекта, на которой стоит план. */
  style_revision?: number;
  changed?: { item_id: string; change: RecheckChange }[];
  reused?: boolean;
}

export function planRecheck(depsOf: (ctx: Parameters<JobHandler>[0]) => PlanRecheckDeps): JobHandler {
  return async (ctx) => {
    const d = depsOf(ctx);
    const prep = (message: string): HandlerResult => ({ status: "failed", error: { code: "pipeline", stage: "prepare", message } });
    const parsed = PlanJobInputSchema.safeParse(ctx.job.input);
    if (!parsed.success) return prep(`вход plan.recheck не годится: ${parsed.error.message}`);
    const projectId = parsed.data.projectId;
    if (projectId !== ctx.job.project_id) return prep(`вход plan.recheck: projectId ${projectId} не совпадает с проектом задачи ${ctx.job.project_id}`);
    if (!projects.get(ctx.db, projectId)) return prep(`проекта ${projectId} нет`);
    const root = d.root;
    let stage: PlanStage = "prepare";
    const done = (r: PlanRecheckResult): HandlerResult => {
      ctx.progress(1, "done");
      return { status: "completed", outputRefs: r };
    };
    try {
      const pubs = planPublications(ctx.db, projectId, ctx.job.id);
      if (pubs.plan) {
        const rel = `${artifactPaths(root, projectId).planRev(pubs.plan.id, pubs.plan.revision)}/${PLAN_FILE}`;
        const doc = VisualPlanRevisionDocSchema.parse(JSON.parse(await readFile(join(root, rel), "utf8")));
        ctx.emit("plan_reused", `перепроверка плана ${doc.plan_id} r${doc.revision} опубликована прошлой попыткой`);
        return done({ plan_id: doc.plan_id, revision: doc.revision, edl_revision: doc.inputs.edl.revision, style_revision: doc.inputs.style.revision, reused: true });
      }
      const snap = ctx.db.transaction(() => {
        const plan = plans.byProject(ctx.db, projectId);
        const edl = edls.byProject(ctx.db, projectId);
        const edlRev = edl?.current_revision == null ? undefined : edls.revision(ctx.db, edl.id, edl.current_revision);
        const st = styles.byProject(ctx.db, projectId);
        const stRev = st?.current_revision == null ? undefined : styles.revision(ctx.db, st.id, st.current_revision);
        return { plan, edl, edlRev, stRev, trRev: edl ? transcripts.get(ctx.db, edl.transcript_id)?.current_revision ?? null : null };
      }).deferred();
      const { plan, edl, edlRev, stRev, trRev } = snap;
      if (!plan || plan.current_revision === null) {
        ctx.emit("no_plan", `у проекта ${projectId} нет визуального плана — перепроверять нечего`);
        return done({ no_plan: true });
      }
      if (!edl || !edlRev || trRev === null) return prep(`у проекта ${projectId} нет чернового монтажа`);
      const status = await d.storage();
      if (!status.ok) return { status: "failed", error: { code: "storage_unavailable", stage: "storage", message: `${status.reason}: ${status.detail}` } };
      const cur = plan.current_revision;
      const doc = currentPlan(ctx.db, root, plan.id, cur);
      const sameCut = doc.inputs.edl.id === edl.id && doc.inputs.edl.revision === edlRev.revision && doc.inputs.edl.hash === edlRev.hash &&
        doc.inputs.transcript.id === edl.transcript_id && doc.inputs.transcript.revision === trRev;
      // стиля у проекта нет (не бывает при плане) — сравнивать не с чем
      const style = stRev ? { id: stRev.style_id, revision: stRev.revision, hash: stRev.hash } : doc.inputs.style;
      const sameStyle = style.id === doc.inputs.style.id && style.revision === doc.inputs.style.revision && style.hash === doc.inputs.style.hash;
      if (sameCut && sameStyle) {
        ctx.emit("plan_current", `план ${plan.id} r${cur} уже построен по EDL ${edl.id} r${edlRev.revision} и стилю ${style.id} r${style.revision} — новая ревизия не нужна`);
        return done({ no_change: true, plan_id: plan.id, revision: cur, edl_revision: edlRev.revision, style_revision: style.revision, changed: [] });
      }
      const store = new ArtifactStore({ root, db: ctx.db, guard: d.storage });
      const publish = async (next: typeof doc) => {
        stage = "publish";
        await d.onStage?.("publish");
        ctx.signal.throwIfAborted();
        await publishPlanRevision({ db: ctx.db, store, root }, projectId, VisualPlanRevisionDocSchema.parse(next), {
          fence: { jobId: ctx.job.id, attempt: ctx.attempt }, opportunitiesFrom: cur,
          check: (db) => {
            const now = plans.get(db, plan.id)?.current_revision ?? null;
            return now === cur ? undefined : new RevisionConflictError(`план ${plan.id}`, cur, now);
          },
        });
      };
      if (sameCut) {
        // сменился только стиль: те же сцены и решения на новой ревизии стиля
        const next = restylePlan(doc, style);
        await publish(next);
        ctx.emit("plan_restyled", `план ${plan.id} r${next.revision} перенесён на стиль ${style.id} r${style.revision} (было r${doc.inputs.style.revision}); решения сохранены`);
        d.log?.(`plan.recheck ${plan.id} r${next.revision}: стиль ${style.id} r${style.revision}`);
        return done({ plan_id: plan.id, revision: next.revision, edl_revision: edlRev.revision, style_revision: style.revision, changed: [], reused: false });
      }
      const tr = currentTranscript(ctx.db, root, edl.transcript_id, trRev);
      const tl = timelineFor(ctx.db, edl.id, edlRev.revision);
      const footage = readFootage(ctx.db, root, doc.inputs.footage_id);
      const transcriptChanged = doc.inputs.transcript.id !== tr.transcript_id || doc.inputs.transcript.revision !== tr.revision;
      const re = recheckPlan(doc, tl, tr.words, footage, d.config.planning, {
        edl: { id: edl.id, revision: edlRev.revision, hash: edlRev.hash },
        ...(transcriptChanged ? { transcript: { id: tr.transcript_id, revision: tr.revision } } : {}),
        segments: tr.segments, ...(sameStyle ? {} : { style }),
      });
      await publish(re.doc);
      const stale = re.changed.filter((x) => x.change !== "remapped");
      ctx.emit("plan_rechecked", `план ${plan.id} r${re.doc.revision} на EDL ${edl.id} r${edlRev.revision}: пересчитано ${re.changed.length - stale.length}, устарело ${stale.length}`, { changed: re.changed });
      d.log?.(`plan.recheck ${plan.id} r${re.doc.revision}: ${re.changed.map((x) => `${x.item_id}:${x.change}`).join(", ") || "сцен нет"}`);
      return done({ plan_id: plan.id, revision: re.doc.revision, edl_revision: edlRev.revision, style_revision: style.revision, changed: re.changed, reused: false });
    } catch (e) {
      return planFailure(e, { ctx, stage, storage: d.storage, what: "перепроверка плана" });
    }
  };
}
