// Task 38-39: видеопроект p1 с планом из четырёх принятых сцен (слова 5–8, 9–11, 12–15, 16–20;
// третья — fullscreen), Approval B на текущую ревизию; фейк обработчика `playground.generate`
// (публикует версию с отпечатком входа или падает), настоящие раннер и очередь.
import type { ScenePlanItem, VisualPlanRevisionDoc } from "@ms/contracts";
import { buildPlanItems } from "../../src/analysis/plan-build.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { approve } from "../../src/approvals/engine.js";
import { currentSubject } from "../../src/approvals/subjects.js";
import { videoScenes } from "../../src/db/repos/video.js";
import { JobRunner } from "../../src/jobs/runner.js";
import type { HandlerResult, JobContext, JobHandler } from "../../src/jobs/types.js";
import { SceneRepo } from "../../src/scenes/repo.js";
import { publishPlan, seedPlanProject } from "../analysis/plan-db-helpers.js";
import { ctx, id, opp, out } from "../analysis/plan-helpers.js";
import type { JobsEnv } from "../jobs/helpers.js";
import { makeDraft, meta } from "../scenes/helpers.js";

export const P = "p1";
export const TERMINAL = new Set(["completed", "failed", "cancelled", "blocked"]);

export function planItems(): ScenePlanItem[] {
  const built = buildPlanItems(out([
    opp({ id: "o1", s: 5, e: 8, key_terms: [{ text: "40%", word_id: id(8) }] }),
    opp({ id: "o2", s: 9, e: 11, key_terms: [], zone: "top_band" }),
    opp({ id: "o3", s: 12, e: 15, key_terms: [{ text: "итог", word_id: id(13) }], composition_mode: "fullscreen", zone: "full" }),
    opp({ id: "o4", s: 16, e: 20, key_terms: [], zone: "lower_third" }),
  ]), ctx()).items;
  return built.map((x) => ({ ...x, status: "accepted" as const }));
}

export interface VideoEnv {
  env: JobsEnv;
  repo: SceneRepo;
  store: ArtifactStore;
  doc: VisualPlanRevisionDoc;
}

export async function seedVideoBatchProject(env: JobsEnv, o: { approveB?: boolean } = {}): Promise<VideoEnv> {
  const store = new ArtifactStore({ root: env.s.root, db: env.db, guard: env.s.guard });
  const repo = new SceneRepo({ root: env.s.root, db: env.db, guard: env.s.guard });
  const doc = await seedPlanProject(env.db, store, env.s.root, planItems());
  if (o.approveB !== false) approveB(env);
  return { env, repo, store, doc };
}

export function approveB(env: JobsEnv): void {
  const s = currentSubject(env.db, P, "B")!;
  approve(env.db, { projectId: P, kind: "B", subjectRef: s.ref, subjectHash: s.hash });
}

/** Новая ревизия плана из `doc` с правкой `edit` сцен (B на неё не ставится). */
export async function nextRevision(v: VideoEnv, edit: (items: ScenePlanItem[]) => ScenePlanItem[]): Promise<VisualPlanRevisionDoc> {
  const doc: VisualPlanRevisionDoc = { ...v.doc, revision: v.doc.revision + 1, parent_revision: v.doc.revision, items: edit(v.doc.items.map((x) => ({ ...x }))) };
  await publishPlan(v.env.db, v.store, v.env.s.root, doc);
  v.doc = doc;
  return doc;
}

type In = { sceneId: string; video: { item_id: string }; video_fingerprint?: string };

/** Фейк генерации видеосцены: сцена из `fail` — failed; иначе ждёт `hold` и публикует версию. */
export function fakeVideoGenerate(v: VideoEnv, o: { fail?: Set<string>; hold?: Promise<void>; afterPublish?: Promise<void>; qa?: unknown } = {}): JobHandler {
  return async (c: JobContext): Promise<HandlerResult> => {
    const input = c.job.input as In;
    if (o.fail?.has(input.video.item_id)) return { status: "failed", error: { code: "pipeline", message: "фейк: генерация не удалась" } };
    if (o.hold) {
      await Promise.race([o.hold, new Promise<void>((r) => c.signal.addEventListener("abort", () => r()))]);
      if (c.signal.aborted) return { status: "cancelled", error: { code: "cancelled", message: "отменено" } };
    }
    const draft = await makeDraft(v.env.s.root, { runId: c.job.id, attempt: c.attempt, sceneId: input.sceneId, projectId: P }, o.qa !== undefined ? { qa: o.qa } : {});
    const ver = await v.repo.publish(draft, meta(input.sceneId), { jobId: c.job.id, attempt: c.attempt });
    if (input.video_fingerprint) videoScenes.setFingerprint(v.env.db, input.sceneId, input.video_fingerprint); // как playground.generate
    if (o.afterPublish) await o.afterPublish;
    return { status: "completed", outputRefs: { version_id: ver.versionId } };
  };
}

export function startRunner(v: VideoEnv, handlers: Partial<Record<"playground.generate" | "playground.edit", JobHandler>>, owner = "srv"): JobRunner {
  const r = new JobRunner({ db: v.env.db, root: v.env.s.root, owner, handlers, pollMs: 5, maxRunning: 2 });
  r.start();
  return r;
}
