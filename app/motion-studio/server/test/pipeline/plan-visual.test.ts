// Task 32: обработчики `plan.visual` и `plan.recheck` — фейковый рантайм агента (только логика):
// гейт A и свежесть входов, одна переотправка по проблемам по вине агента, лучший из двух,
// стиль агента и пользователя, чекпоинт, M3, перепроверка после новой ревизии EDL.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Job, JobErrorSchema, type SemanticTimeline, type VisualPlannerOutput, VisualPlanRevisionDocSchema, acceptedCuts, buildTimeline } from "@ms/contracts";
import { fileProcessRegistry } from "@ms/core";
import type { ZodType } from "zod";
import type { AgentResult, AgentRuntimeAdapter, AgentTask } from "../../src/agents/runtime.js";
import { approvalState } from "../../src/approvals/engine.js";
import { currentSubject } from "../../src/approvals/subjects.js";
import { approveVisualPlan } from "../../src/analysis/approval-b.js";
import { savePlanRevision } from "../../src/analysis/plan-ops.js";
import { saveProjectStyle } from "../../src/analysis/project-style.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { type AppConfig, loadConfig } from "../../src/config.js";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as edls from "../../src/db/repos/edls.js";
import * as footageRepo from "../../src/db/repos/footage.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as plans from "../../src/db/repos/plans.js";
import * as projects from "../../src/db/repos/projects.js";
import * as semanticRepo from "../../src/db/repos/semantic.js";
import * as styles from "../../src/db/repos/styles.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import { approveRoughCut } from "../../src/edit/approval-a.js";
import { saveEdlRevision } from "../../src/edit/edl-ops.js";
import { releaseLocks } from "../../src/jobs/locks.js";
import { claimNext, enqueue, finish } from "../../src/jobs/queue.js";
import { AttemptPermits, Semaphore } from "../../src/jobs/semaphore.js";
import type { HandlerResult, JobContext } from "../../src/jobs/types.js";
import { buildSegments } from "../../src/media/segments.js";
import { type PlanRecheckResult, planRecheck } from "../../src/pipeline/plan-recheck.js";
import { type PlanVisualDeps, type PlanVisualResult, planVisual } from "../../src/pipeline/plan-visual.js";
import { asset } from "../db/video-fixtures.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { F30, dec, trDoc } from "../edit/helpers.js";
import { CUT, FACE, SOURCE_US, ev, footage, id, opp, out, skipOpp, textOf, words } from "../analysis/plan-helpers.js";

let s: TestStore;
let db: Db;
let store: ArtifactStore;
let config: AppConfig;
let n = 0;

beforeAll(async () => {
  s = await makeStore("ms-plan-visual-");
  db = openDb(s.root);
  await migrate(db);
  store = new ArtifactStore({ root: s.root, db, guard: s.guard });
  config = loadConfig({ MS_DATA_DIR: s.root });
});
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

const anchors: SemanticTimeline["anchors"] = [
  { id: "a_0001", kind: "number", start_word_id: id(5), end_word_id: id(9), quote: textOf(5, 9), claim_type: "fact", importance: 3, emphasis_word_ids: [id(8)] },
  { id: "a_0002", kind: "thesis", start_word_id: id(11), end_word_id: id(15), quote: textOf(11, 15), claim_type: "opinion", importance: 2, emphasis_word_ids: [] },
];

/** Видеопроект pN: исходник, транскрипт r1, EDL r1 (вырезка CUT принята), A, semantic и footage по текущим ревизиям. */
async function ready(o: { approve?: boolean; semantic?: "fresh" | "old" | "none"; footage?: boolean } = {}): Promise<{ p: string; edl: string }> {
  const k = ++n;
  const p = `p${k}`;
  const [mediaId, trnId, edlId] = [`med_${k}`, `trn_${k}`, `edl_${k}`];
  const paths = artifactPaths(s.root, p);
  projects.create(db, { id: p, kind: "video", title: `Видео ${k}` });
  const a = asset({ id: mediaId, project_id: p, rel_path: `workspace/projects/${p}/source/${mediaId}/original.mov` });
  media.insert(db, { ...a, probe: { ...a.probe, duration_us: SOURCE_US } });
  const tr = trDoc(words, { transcript_id: trnId, segments: buildSegments(words) });
  await store.writeRevision(paths.transcriptRev(trnId, 1), "transcript.json", tr, (d, f) => {
    transcripts.create(d, { id: trnId, project_id: p, media_id: mediaId, language: "ru" });
    transcripts.insertRevision(d, { doc: tr, rel_path: `${paths.transcriptRev(trnId, 1)}/transcript.json`, sha256: f[0]!.sha256 });
  });
  const edl = { schema_version: 1 as const, edl_id: edlId, revision: 1, media_id: mediaId, media_sha256: a.sha256, transcript_id: trnId, timeline_fps: F30, decisions: [dec("d1", { status: "accepted", source_start_us: CUT.start_us, source_end_us: CUT.end_us })] };
  await store.writeRevision(paths.edlRev(edlId, 1), "edl.json", edl, (d, f) => {
    edls.create(d, { id: edlId, project_id: p, media_id: mediaId, transcript_id: trnId });
    edls.insertRevision(d, { doc: edl, rel_path: `${paths.edlRev(edlId, 1)}/edl.json`, sha256: f[0]!.sha256, timeline: buildTimeline(SOURCE_US, acceptedCuts(edl), F30) });
  });
  if (o.approve !== false) approveRoughCut(db, p);
  if ((o.semantic ?? "fresh") !== "none") {
    const semId = `sem_${k}`;
    const doc: SemanticTimeline = {
      schema_version: 1, id: semId, transcript_ref: { id: trnId, revision: 1 }, edl_ref: { id: edlId, revision: o.semantic === "old" ? 2 : 1 },
      chapters: [{ id: "ch_01", title: "Итоги", summary: "", start_word_id: id(4), end_word_id: id(20) }], anchors, entities: [], numbers: [], causal: [], disputed: [],
    };
    await store.writeRevision(paths.semantic(semId), "semantic.json", doc, (d, f) => {
      semanticRepo.insert(d, { id: semId, project_id: p, transcript_id: trnId, transcript_revision: 1, edl_id: edlId, edl_revision: doc.edl_ref.revision, rel_path: `${paths.semantic(semId)}/semantic.json`, sha256: f[0]!.sha256, chapters: [] });
    });
  }
  if (o.footage !== false) {
    const fdoc = { ...footage(FACE), id: `ftg_${k}` };
    await store.writeRevision(paths.footage(fdoc.id), "footage.json", fdoc, (d, f) => {
      footageRepo.insert(d, { id: fdoc.id, project_id: p, media_id: mediaId, mode: "vision", rel_path: `${paths.footage(fdoc.id)}/footage.json`, sha256: f[0]!.sha256 });
    });
  }
  return { p, edl: edlId };
}

type Reply = (task: AgentTask<unknown>) => Promise<Partial<AgentResult<unknown>>>;
function fakeAgents(replies: Reply[]): AgentRuntimeAdapter & { tasks: AgentTask<unknown>[] } {
  const tasks: AgentTask<unknown>[] = [];
  return {
    tasks,
    capabilities: async () => ({ available: true }),
    run: async <I, O>(task: AgentTask<I>, schema: ZodType<O>): Promise<AgentResult<O>> => {
      tasks.push(task as AgentTask<unknown>);
      const reply = replies.shift();
      if (!reply) throw new Error("лишний вызов агента");
      const r = await reply(task as AgentTask<unknown>);
      const now = new Date().toISOString();
      const o = r.output === undefined ? undefined : schema.parse(r.output);
      return {
        status: "completed", usage: { model: "sonnet", inputTokens: 1000, outputTokens: 100, costUsd: 0.04 }, permissionDenials: [],
        stdoutPath: "", stderrPath: "", startedAt: now, finishedAt: now, ...r, ...(o !== undefined ? { output: o } : {}),
      } as AgentResult<O>;
    },
  };
}
const ok = (o: VisualPlannerOutput): Reply => async () => ({ output: o });
const cliFail: Reply = async () => ({ status: "failed", error: { kind: "cli", message: "claude упал" } });

const sem = () => new AttemptPermits(new Semaphore(2));
function context(job: Job, attempt: number, events: { kind: string; message: string }[]): JobContext {
  return {
    db, job, attempt, signal: new AbortController().signal,
    run: { root: s.root, runId: job.id, attempt, registry: fileProcessRegistry(s.root) },
    emit: (kind, message) => events.push({ kind, message }), progress: () => undefined, fenceOk: () => true,
    agents: sem(), renders: sem(), heavy: sem(),
  };
}

async function run<R>(type: "plan.visual" | "plan.recheck", p: string, o: { agents?: AgentRuntimeAdapter; jobId?: string; noFinish?: boolean; deps?: Partial<PlanVisualDeps> } = {}) {
  if (!o.jobId) enqueue(db, { type, projectId: p, input: { projectId: p }, idempotencyKey: `${type}-${++n}` });
  const claim = claimNext(db, "test", 0, { running: 0, maxRunning: 4 })!;
  expect(claim, "задача не захвачена").toBeTruthy();
  const events: { kind: string; message: string }[] = [];
  const deps: PlanVisualDeps = { root: s.root, config, storage: s.guard, agents: o.agents ?? fakeAgents([]), ...o.deps };
  const h = type === "plan.visual" ? planVisual(() => deps) : planRecheck(() => deps);
  const r: HandlerResult = await h(context(claim.job, claim.attempt, events));
  if (!o.noFinish) finish(db, claim.job.id, claim.attempt, r);
  if (r.status !== "completed" && "error" in r) expect(JobErrorSchema.safeParse(r.error).success, JSON.stringify(r.error)).toBe(true);
  return { r, job: claim.job, attempt: claim.attempt, events, out: (r.status === "completed" ? r.outputRefs : undefined) as R | undefined };
}
const planOf = (pid: string, rev: number) => VisualPlanRevisionDocSchema.parse(JSON.parse(readFileSync(join(s.root, plans.revision(db, pid, rev)!.rel_path), "utf8")));
const acceptAll = async (pid: string, rev: number) => {
  const d = planOf(pid, rev);
  return savePlanRevision({ db, store, root: s.root, planning: config.planning }, pid, { base_revision: rev, ops: d.items.map((x) => ({ op: "set_status" as const, item_id: x.id, status: "accepted" as const })) });
};

const CLEAN = out([opp({ anchor_ids: ["a_0001"] }), { ...skipOpp("o2", "мнение автора, графика отвлечёт"), anchor_ids: ["a_0002"] }]);
const FACE_OVER = out([opp({ anchor_ids: ["a_0001"], zone: "right_third" })]);

describe("plan.visual", () => {
  it("без Approval A → failed approval_required, агент не вызван", async () => {
    const { p } = await ready({ approve: false });
    const agents = fakeAgents([]);
    const { r } = await run("plan.visual", p, { agents });
    expect(r).toMatchObject({ status: "failed", error: { code: "approval_required" } });
    expect(agents.tasks).toHaveLength(0);
  });

  it("semantic построен на другой ревизии EDL, анализа видеоряда нет → failed с перечнем недостающего", async () => {
    const { p } = await ready({ semantic: "old", footage: false });
    const { r } = await run("plan.visual", p);
    expect(r).toMatchObject({ status: "failed", error: { code: "pipeline", stage: "prepare" } });
    const msg = (r as { error: { message: string } }).error.message;
    expect(msg).toMatch(/semantic устарел/);
    expect(msg).toMatch(/анализа видеоряда нет/);
  });

  it("чистый ответ: план r1 (сцены proposed, пропуски с причинами), стиль проекта r1 от агента; вход — без µs; B после принятия", async () => {
    const { p } = await ready();
    const agents = fakeAgents([ok(CLEAN)]);
    const { r, out: res } = await run<PlanVisualResult>("plan.visual", p, { agents });
    expect(r.status, JSON.stringify(r)).toBe("completed");
    expect(agents.tasks).toHaveLength(1);
    const t = agents.tasks[0]!;
    expect(t.role).toBe("visual_planner");
    expect(t.tools).toEqual([]);
    expect(String(t.input)).toContain(`${id(5)} выручка`);
    expect(String(t.input)).not.toMatch(/_us\b|\b\d{6,}\b/);
    expect(res).toMatchObject({ revision: 1, reused: false, counts: { items: 1, skipped: 1, rejected: 0, blocking: 0 }, style: { revision: 1, author: "agent" } });
    const d = planOf(res!.plan_id, 1);
    expect(d.items[0]).toMatchObject({ status: "proposed", anchor_ids: ["a_0001"], style_id: res!.style!.style_id });
    expect(d.skipped).toEqual([{ anchor_ids: ["a_0002"], reason: "мнение автора, графика отвлечёт" }]);
    expect(d.inputs).toMatchObject({ edl: { revision: 1 }, transcript: { revision: 1 }, style: { id: res!.style!.style_id, revision: 1 } });
    expect(plans.opportunities(db, res!.plan_id, 1).map((x) => x.decision)).toEqual(["plan", "skip"]);
    expect(() => approveVisualPlan(db, p, s.root)).toThrow(/items_unresolved/);
    await acceptAll(res!.plan_id, 1);
    expect(approveVisualPlan(db, p, s.root).subject_ref).toBe(`plan:${res!.plan_id}@r2`);
  });

  it("агент дважды ставит overlay на лицо без причины → переотправка одна с перечнем; сцена proposed с blocking face_overlap; B нельзя", async () => {
    const { p } = await ready();
    const agents = fakeAgents([ok(FACE_OVER), ok(FACE_OVER)]);
    const { r, out: res, events } = await run<PlanVisualResult>("plan.visual", p, { agents });
    expect(r.status).toBe("completed");
    expect(agents.tasks).toHaveLength(2);
    expect(String(agents.tasks[1]!.input)).toMatch(/face_overlap/);
    expect(events.map((e) => e.kind)).toContain("agent_retry");
    const d = planOf(res!.plan_id, 1);
    expect(d.items[0]!.status).toBe("proposed");
    expect(d.issues).toContainEqual(expect.objectContaining({ code: "face_overlap", severity: "blocking", item_id: "sp_001" }));
    await acceptAll(res!.plan_id, 1);
    expect(() => approveVisualPlan(db, p, s.root)).toThrow(/blocking_issues/);
  });

  it("лучший из двух: второй ответ хуже (больше отклонённого) — остаётся первый", async () => {
    const { p } = await ready();
    const first = out([opp({ anchor_ids: ["a_0001"] }), opp({ id: "bad", s: 12, e: 15, key_terms: [], evidence: [ev(12, 13, "не то")] })]);
    const second = out([opp({ evidence: [ev(5, 6, "мимо")] }), opp({ id: "bad", s: 12, e: 15, key_terms: [], evidence: [ev(12, 13, "не то")] })]);
    const agents = fakeAgents([ok(first), ok(second)]);
    const { out: res, events } = await run<PlanVisualResult>("plan.visual", p, { agents });
    expect(res!.counts).toMatchObject({ items: 1, rejected: 1 });
    expect(events.map((e) => e.kind)).toContain("agent_retry_kept_first");
    expect(planOf(res!.plan_id, 1).skipped).toEqual([expect.objectContaining({ reason: expect.stringMatching(/^отклонено проверкой \(quote_mismatch\)/) })]);
  });

  it("стиль задан пользователем — агент его не меняет; правка стиля после B → B stale(style_changed)", async () => {
    const { p } = await ready();
    const st = await saveProjectStyle({ db, store, root: s.root }, p, { preset: "light-clean", intensity: "calm", depth: 0 }, "user");
    const { out: res } = await run<PlanVisualResult>("plan.visual", p, { agents: fakeAgents([ok(CLEAN)]) });
    expect(res!.style).toMatchObject({ style_id: st.style_id, revision: 1, author: "user", kept: true });
    expect(styles.get(db, st.style_id)!.current_revision).toBe(1);
    await acceptAll(res!.plan_id, 1);
    approveVisualPlan(db, p, s.root);
    await saveProjectStyle({ db, store, root: s.root }, p, { preset: "light-clean", intensity: "balanced", depth: 0 }, "user");
    expect(approvalState(db, p, "B", currentSubject(db, p, "B"))).toMatchObject({ state: "stale", reason: "style_changed" });
  });

  it("стиль агента с плохим контрастом — откат к палитре пресета (событие), проблема не попадает в стиль", async () => {
    const { p } = await ready();
    const bad = { ...CLEAN, style: { ...CLEAN.style, palette_overrides: { text: "#222222" } } };
    const { out: res, events } = await run<PlanVisualResult>("plan.visual", p, { agents: fakeAgents([ok(bad)]) });
    expect(events.map((e) => e.kind)).toContain("style_fallback");
    expect(res!.style).toMatchObject({ author: "agent", issues: 0 });
  });

  it("отказ агента (не схема) → failed pipeline; повтор берёт ответ из чекпоинта и не платит второй раз (M3: опубликованное — reused)", async () => {
    const { p } = await ready();
    const a1 = fakeAgents([ok(CLEAN)]);
    const first = await run<PlanVisualResult>("plan.visual", p, { agents: a1, noFinish: true, deps: { onStage: (st) => { if (st === "publish") throw new Error("сбой перед публикацией"); } } });
    expect(first.r.status).toBe("failed");
    releaseLocks(db, jobs.update(db, first.job.id, { status: "pending", lease_owner: null, lease_until: null }));
    const a2 = fakeAgents([]);
    const second = await run<PlanVisualResult>("plan.visual", p, { agents: a2, jobId: first.job.id, noFinish: true });
    expect(second.r.status, JSON.stringify(second.r)).toBe("completed");
    expect(a2.tasks).toHaveLength(0);
    expect(second.events.map((e) => e.kind)).toContain("agent_checkpoint");
    releaseLocks(db, jobs.update(db, first.job.id, { status: "pending", lease_owner: null, lease_until: null }));
    const third = await run<PlanVisualResult>("plan.visual", p, { agents: fakeAgents([]), jobId: first.job.id });
    expect(third.out).toMatchObject({ reused: true, plan_id: second.out!.plan_id, revision: 1 });
    const failedOnce = await run("plan.visual", (await ready()).p, { agents: fakeAgents([cliFail]) });
    expect(failedOnce.r).toMatchObject({ status: "failed", error: { code: "pipeline" } });
  });

  it("повторный plan.visual — новая ревизия того же плана (один план на проект)", async () => {
    const { p } = await ready();
    const r1 = await run<PlanVisualResult>("plan.visual", p, { agents: fakeAgents([ok(CLEAN)]) });
    const r2 = await run<PlanVisualResult>("plan.visual", p, { agents: fakeAgents([ok(CLEAN)]) });
    expect(r2.out).toMatchObject({ plan_id: r1.out!.plan_id, revision: 2 });
    expect(r2.out!.style).toMatchObject({ revision: 1, kept: true }); // тот же стиль агента — без новой ревизии
  });
});

describe("plan.recheck", () => {
  it("новая ревизия EDL ставит plan.recheck; якорь вырезан → stale(anchor_cut), B stale; без плана — no_plan", async () => {
    const { p, edl } = await ready();
    const pv = await run<PlanVisualResult>("plan.visual", p, { agents: fakeAgents([ok(out([opp({ anchor_ids: ["a_0001"] }), opp({ id: "o2", s: 12, e: 13, key_terms: [], evidence: [ev(12, 13)] })]))]) });
    await acceptAll(pv.out!.plan_id, 1);
    approveVisualPlan(db, p, s.root);
    await saveEdlRevision({ db, store, root: s.root }, edl, { base_revision: 1, ops: [{ op: "add_cut", start_word_id: id(13), end_word_id: id(13) }] });
    const queued = jobs.list(db, { projectId: p }).filter((j) => j.type === "plan.recheck" && j.status === "pending");
    expect(queued).toHaveLength(1);
    const { r, out: res } = await run<PlanRecheckResult>("plan.recheck", p, { jobId: queued[0]!.id });
    expect(r.status, JSON.stringify(r)).toBe("completed");
    expect(res).toMatchObject({ revision: 3, edl_revision: 2, changed: [{ item_id: "sp_001", change: "remapped" }, { item_id: "sp_002", change: "anchor_cut" }] });
    expect(planOf(pv.out!.plan_id, 3).items[1]).toMatchObject({ status: "stale", stale_reason: "anchor_cut" });
    expect(approvalState(db, p, "B", currentSubject(db, p, "B")).state).toBe("stale");
    const again = await run<PlanRecheckResult>("plan.recheck", p);
    expect(again.out).toMatchObject({ no_change: true });
    const none = await run<PlanRecheckResult>("plan.recheck", (await ready()).p);
    expect(none.out).toMatchObject({ no_plan: true });
  });
});
