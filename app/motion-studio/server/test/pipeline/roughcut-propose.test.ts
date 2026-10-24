// Task 28: обработчик `roughcut.propose` — детекторы, фейковый рантайм агента (только логика),
// бюджет, одна переотправка, проверка цитат, повторный propose поверх решений человека, M3, отмена.
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type EdlRevisionDoc, type Job, type RoughCutAgentOutput, type TranscriptWord, JobErrorSchema } from "@ms/contracts";
import { fileProcessRegistry } from "@ms/core";
import type { ZodType } from "zod";
import type { AgentResult, AgentRuntimeAdapter, AgentTask } from "../../src/agents/runtime.js";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { type AppConfig, loadConfig } from "../../src/config.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as edls from "../../src/db/repos/edls.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import { approveRoughCut, roughCutApprovalValid } from "../../src/edit/approval-a.js";
import { currentEdl, saveEdlRevision } from "../../src/edit/edl-ops.js";
import { releaseLocks } from "../../src/jobs/locks.js";
import { claimNext, enqueue, finish, requestCancel } from "../../src/jobs/queue.js";
import { AttemptPermits, Semaphore } from "../../src/jobs/semaphore.js";
import type { HandlerResult, JobContext } from "../../src/jobs/types.js";
import { buildSegments } from "../../src/media/segments.js";
import { type RoughcutProposeDeps, type RoughcutProposeResult, edlIdFor, roughcutPropose } from "../../src/pipeline/roughcut-propose.js";
import { asset } from "../db/video-fixtures.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { trDoc, w } from "../edit/helpers.js";

let s: TestStore;
let db: Db;
let store: ArtifactStore;
let config: AppConfig;
let n = 0;

beforeAll(async () => {
  s = await makeStore("ms-roughcut-");
  db = openDb(s.root);
  await migrate(db);
  store = new ArtifactStore({ root: s.root, db, guard: s.guard });
  config = loadConfig({ MS_DATA_DIR: s.root });
});
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

/** Речь 7 с в записи 10 с: пауза 1,6 с, повтор «я я», «э-э», фальстарт «мы в прошлом… мы в прошлом году», тишина в конце. */
const WORDS: TranscriptWord[] = [
  w("w_000001", "Привет.", 500_000, 1_000_000), w("w_000002", "я", 2_600_000, 2_800_000), w("w_000003", "я", 2_900_000, 3_100_000),
  w("w_000004", "думаю,", 3_200_000, 3_600_000), w("w_000005", "э-э,", 3_700_000, 4_000_000), w("w_000006", "мы", 4_100_000, 4_300_000),
  w("w_000007", "в", 4_400_000, 4_500_000), w("w_000008", "прошлом…", 4_600_000, 5_000_000), w("w_000009", "мы", 5_100_000, 5_300_000),
  w("w_000010", "в", 5_400_000, 5_500_000), w("w_000011", "прошлом", 5_600_000, 5_900_000), w("w_000012", "году", 6_000_000, 6_400_000),
  w("w_000013", "выросли.", 6_500_000, 7_000_000),
];

/** Видеопроект: исходник 10 с 30 fps, транскрипт r1, тихая waveform. */
async function videoProject(words = WORDS): Promise<string> {
  const k = ++n;
  const projectId = `p${k}`;
  const mediaId = `med_${k}`;
  const trnId = `trn_${k}`;
  projects.create(db, { id: projectId, kind: "video", title: `Видео ${k}` });
  const a = asset({ id: mediaId, project_id: projectId, rel_path: `workspace/projects/${projectId}/source/${mediaId}/original.mov` });
  media.insert(db, a);
  const wfRel = `workspace/projects/${projectId}/proxy/${mediaId}/waveform.bin`;
  await mkdir(join(s.root, wfRel, ".."), { recursive: true });
  writeFileSync(join(s.root, wfRel), new Uint8Array(2 * 1000)); // 10 с тишины по 10 мс
  media.setDerivative(db, mediaId, { kind: "waveform", rel_path: wfRel, sha256: "b".repeat(64), params: { bucket_ms: 10 } });
  const doc = trDoc(words, { transcript_id: trnId, segments: buildSegments(words) });
  const rel = artifactPaths(s.root, projectId).transcriptRev(trnId, 1);
  await store.writeRevision(rel, "transcript.json", doc, (d, files) => {
    transcripts.create(d, { id: trnId, project_id: projectId, media_id: mediaId, language: "ru" });
    transcripts.insertRevision(d, { doc, rel_path: `${rel}/transcript.json`, sha256: files[0]!.sha256 });
  });
  return projectId;
}

type Reply = (task: AgentTask<unknown>, signal: AbortSignal) => Promise<Partial<AgentResult<unknown>>>;

/** Фейковый рантайм: ответы по очереди; задачи записываются. */
function fakeAgents(replies: Reply[]): AgentRuntimeAdapter & { tasks: AgentTask<unknown>[] } {
  const tasks: AgentTask<unknown>[] = [];
  return {
    tasks,
    capabilities: async () => ({ available: true }),
    run: async <I, O>(task: AgentTask<I>, schema: ZodType<O>, signal: AbortSignal): Promise<AgentResult<O>> => {
      tasks.push(task as AgentTask<unknown>);
      const reply = replies.shift();
      if (!reply) throw new Error("лишний вызов агента");
      const r = await reply(task as AgentTask<unknown>, signal);
      const now = new Date().toISOString();
      const out = r.output === undefined ? undefined : schema.parse(r.output);
      return {
        status: "completed", usage: { model: "sonnet", inputTokens: 1000, outputTokens: 100, costUsd: 0.05 }, permissionDenials: [],
        stdoutPath: "", stderrPath: "", startedAt: now, finishedAt: now, ...r, ...(out !== undefined ? { output: out } : {}),
      } as AgentResult<O>;
    },
  };
}
const ok = (output: RoughCutAgentOutput): Reply => async () => ({ output });
const schemaFail: Reply = async () => ({ status: "failed", error: { kind: "schema", message: "structured_output не прошёл схему: decisions.0.quote: Required" } });

const sem = () => new AttemptPermits(new Semaphore(2));
function context(job: Job, attempt: number, ac: AbortController, events: { kind: string; message: string; data?: unknown }[]): JobContext {
  return {
    db, job, attempt, signal: ac.signal,
    run: { root: s.root, runId: job.id, attempt, registry: fileProcessRegistry(s.root) },
    emit: (kind, message, data) => events.push({ kind, message, data }),
    progress: () => undefined, fenceOk: () => true,
    agents: sem(), renders: sem(), heavy: sem(),
  };
}

interface RunOpts {
  useAgent?: boolean;
  agents?: AgentRuntimeAdapter;
  cfg?: Partial<AppConfig>;
  jobId?: string;
  noFinish?: boolean;
  deps?: Partial<RoughcutProposeDeps>;
  onStart?: (ac: AbortController, job: Job) => void;
}

async function propose(projectId: string, o: RunOpts = {}) {
  if (!o.jobId) enqueue(db, { type: "roughcut.propose", projectId, input: { projectId, ...(o.useAgent !== undefined ? { useAgent: o.useAgent } : {}) }, idempotencyKey: `rc${++n}` });
  const claim = claimNext(db, "test", 0, { running: 0, maxRunning: 4 })!;
  expect(claim, "задача не захвачена").toBeTruthy();
  const { job, attempt } = claim;
  const ac = new AbortController();
  const events: { kind: string; message: string; data?: unknown }[] = [];
  o.onStart?.(ac, job);
  const deps: RoughcutProposeDeps = { root: s.root, config: { ...config, ...o.cfg }, storage: s.guard, agents: o.agents ?? fakeAgents([]), ...o.deps };
  const r: HandlerResult = await roughcutPropose(() => deps)(context(job, attempt, ac, events));
  if (!o.noFinish) finish(db, job.id, attempt, r);
  if (r.status === "failed" || r.status === "cancelled" || r.status === "blocked") expect(JobErrorSchema.safeParse(r.error).success, JSON.stringify(r.error)).toBe(true);
  return { r, job, attempt, events, out: (r.status === "completed" ? r.outputRefs : undefined) as RoughcutProposeResult | undefined };
}

const docOf = (projectId: string): EdlRevisionDoc => {
  const e = edls.byProject(db, projectId)!;
  return currentEdl(db, s.root, e.id);
};
const draftsOf = (jobId: string) => (existsSync(join(s.root, "workspace/drafts")) ? readdirSync(join(s.root, "workspace/drafts")).filter((x) => x.startsWith(jobId)) : []);

describe("roughcut.propose", () => {
  it("useAgent: false — агент не вызывается, r1 только из детекторов, все proposed", async () => {
    const p = await videoProject();
    const agents = fakeAgents([]);
    const { r, job, events, out } = await propose(p, { useAgent: false, agents });
    expect(r.status, JSON.stringify(r)).toBe("completed");
    expect(agents.tasks).toHaveLength(0);
    expect(events.map((e) => e.kind)).toContain("agent_skipped");
    expect(out).toMatchObject({ edl_id: edlIdFor(job.id), revision: 1, no_change: false, reused: false, agent: { status: "skipped" } });
    const doc = docOf(p);
    expect(doc.decisions.every((d) => d.origin === "detector" && d.status === "proposed")).toBe(true);
    expect(doc.decisions.map((d) => [d.reason, d.source_start_us, d.source_end_us])).toEqual([
      ["pause", 1_300_000, 2_500_000], ["repeat", 2_600_000, 2_900_000], ["filler", 3_666_667, 4_066_667],
      ["repeat", 4_100_000, 5_100_000], ["pause", 7_300_000, 10_000_000],
    ]);
    expect(out!.detector).toEqual({ pause: 2, filler: 1, repeat: 2 });
    expect(draftsOf(job.id)).toEqual([]);
  });

  it("агент: без инструментов и таймкодов; вырезка с проверенной цитатой — в EDL, выдуманная — нет (событие), drop_cut — ≤ 0.3", async () => {
    const p = await videoProject();
    const agents = fakeAgents([ok({
      decisions: [
        { start_word_id: "w_000006", end_word_id: "w_000008", reason: "false_start", confidence: 0.9, explanation: "фальстарт", quote: "мы в прошлом" },
        { start_word_id: "w_000012", end_word_id: "w_000013", reason: "bad_take", confidence: 0.6, explanation: "дубль", quote: "совсем другое" },
      ],
      reviews: [{ decision_id: "pau_r1_1", verdict: "drop_cut", why: "пауза после приветствия" }, { decision_id: "pau_r9_9", verdict: "drop_cut", why: "?" }],
    })]);
    const { r, events, out } = await propose(p, { agents });
    expect(r.status, JSON.stringify(r)).toBe("completed");
    expect(agents.tasks).toHaveLength(1);
    const t = agents.tasks[0]!;
    expect(t).toMatchObject({ role: "rough_cut_editor", tools: [], model: "sonnet" });
    expect(String(t.input)).not.toMatch(/_us|\b\d{6,}\b/);
    expect(t.limits.maxBudgetUsd).toBeLessThanOrEqual(config.analysis.maxCostUsd);
    const doc = docOf(p);
    // фальстарт агента пересекся с повтором детектора — одно объединение
    const fs = doc.decisions.find((d) => d.reason === "false_start")!;
    expect(fs).toMatchObject({ origin: "agent", status: "proposed", source_start_us: 4_100_000, source_end_us: 5_100_000, start_word_id: "w_000006", end_word_id: "w_000008", confidence: 0.9 });
    expect(fs.explanation).toMatch(/фальстарт — «мы в прошлом»/);
    expect(fs.explanation).toMatch(/повтор «мы в прошлом…»/);
    expect(doc.decisions.filter((d) => d.source_start_us >= 4_100_000 && d.source_end_us <= 5_100_000)).toHaveLength(1);
    // выдуманная цитата не попала
    expect(doc.decisions.some((d) => d.start_word_id === "w_000012")).toBe(false);
    expect(events.find((e) => e.kind === "agent_cut_rejected")?.message).toMatch(/quote_mismatch/);
    expect(out!.agent).toMatchObject({ status: "completed", decisions: 2, accepted: 1, rejected: [{ code: "quote_mismatch", start_word_id: "w_000012" }], unknown_reviews: ["pau_r9_9"], calls: 1 });
    const pause = doc.decisions.find((d) => d.id === "pau_r1_1")!;
    expect(pause.confidence).toBeLessThanOrEqual(0.3);
    expect(pause.agent_note).toBe("пауза после приветствия");
  });

  it("ответ не прошёл схему — ровно одна переотправка; второй отказ — только детекторы, событие", async () => {
    const p = await videoProject();
    const agents = fakeAgents([schemaFail, schemaFail]);
    const { r, events, out } = await propose(p, { agents });
    expect(r.status).toBe("completed");
    expect(agents.tasks).toHaveLength(2);
    expect(String(agents.tasks[1]!.input)).toMatch(/Прошлый ответ отклонён/);
    expect(agents.tasks[1]!.idempotencyKey).not.toBe(agents.tasks[0]!.idempotencyKey);
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(["agent_retry", "agent_failed"]));
    expect(out!.agent).toMatchObject({ status: "failed", retried: true, calls: 2 });
    expect(docOf(p).decisions.every((d) => d.origin === "detector")).toBe(true);

    const p2 = await videoProject();
    const a2 = fakeAgents([schemaFail, ok({ decisions: [], reviews: [] })]);
    const r2 = await propose(p2, { agents: a2 });
    expect(a2.tasks).toHaveLength(2);
    expect(r2.out!.agent).toMatchObject({ status: "completed", retried: true });
  });

  it("сбой агента не из-за схемы — без переотправки", async () => {
    const p = await videoProject();
    const agents = fakeAgents([async () => ({ status: "timeout", error: { kind: "timeout", message: "не уложился" } })]);
    const { out } = await propose(p, { agents });
    expect(agents.tasks).toHaveLength(1);
    expect(out!.agent!.status).toBe("failed");
  });

  it("бюджет analysis.maxCostUsd исчерпан — агент не запускается, детекторы сохранены, событие budget", async () => {
    const p = await videoProject();
    const agents = fakeAgents([]);
    const { r, events, out } = await propose(p, { agents, cfg: { analysis: { maxCostUsd: 0.1, occupancyWindowUs: 4_000_000 } } });
    expect(r.status).toBe("completed");
    expect(agents.tasks).toHaveLength(0);
    expect(events.find((e) => e.kind === "budget")?.message).toMatch(/бюджет анализа исчерпан/);
    expect(events.find((e) => e.kind === "budget")?.message).not.toMatch(/сцен/);
    expect(out!.agent!.status).toBe("budget");
    expect(docOf(p).decisions.length).toBeGreaterThan(0);
  });

  it("ревью Task 28, M4: claude оборвал вызов по --max-budget-usd — agent.status budget, событие budget, детекторы сохранены", async () => {
    const p = await videoProject();
    const agents = fakeAgents([async () => ({ status: "failed", error: { kind: "budget", message: "error_max_budget_usd: лимит вызова исчерпан" } })]);
    const { r, events, out } = await propose(p, { agents });
    expect(r.status).toBe("completed");
    expect(agents.tasks).toHaveLength(1);
    expect(out!.agent).toMatchObject({ status: "budget", retried: false });
    expect(events.map((e) => e.kind)).toContain("budget");
    expect(events.map((e) => e.kind)).not.toContain("agent_failed");
    expect(docOf(p).decisions.length).toBeGreaterThan(0);
  });

  it("ревью Task 28, M3: попытка 1 получила ответ после переотправки и упала до публикации → попытка 2 берёт ответ из чекпоинта, агент не зовётся", async () => {
    const p = await videoProject();
    const out1 = { decisions: [{ start_word_id: "w_000006", end_word_id: "w_000008", reason: "false_start" as const, confidence: 0.9, explanation: "фальстарт", quote: "мы в прошлом" }], reviews: [] };
    const a1 = fakeAgents([schemaFail, ok(out1)]);
    const first = await propose(p, { agents: a1, noFinish: true, deps: { onStage: (st) => { if (st === "publish") throw new Error("сбой до публикации"); } } });
    expect(first.r.status).toBe("failed");
    expect(a1.tasks).toHaveLength(2);
    releaseLocks(db, jobs.update(db, first.job.id, { status: "pending", lease_owner: null, lease_until: null }));
    const a2 = fakeAgents([]);
    const second = await propose(p, { jobId: first.job.id, agents: a2 });
    expect(second.attempt).toBe(2);
    expect(second.r.status, JSON.stringify(second.r)).toBe("completed");
    expect(a2.tasks).toHaveLength(0);
    expect(second.out!.agent).toMatchObject({ status: "completed", calls: 0, decisions: 1, accepted: 1 });
    expect(docOf(p).decisions.some((d) => d.reason === "false_start" && d.origin === "agent")).toBe(true);
  });

  it("ревью Task 28, M6: вырезка агента через несколько предложений — отклонена too_long, событие", async () => {
    const words = WORDS.map((x, i) => (i === 7 ? { ...x, text: "прошлом." } : x));
    const p2 = await videoProject(words);
    const a2 = fakeAgents([ok({
      decisions: [{ start_word_id: "w_000001", end_word_id: "w_000013", reason: "bad_take", confidence: 0.6, explanation: "всё", quote: words.map((x) => x.text).join(" ") }],
      reviews: [],
    })]);
    const { events, out } = await propose(p2, { agents: a2 });
    expect(out!.agent!.rejected).toEqual([expect.objectContaining({ code: "too_long" })]);
    expect(events.find((e) => e.kind === "agent_cut_rejected")?.message).toMatch(/too_long/);
    expect(docOf(p2).decisions.every((d) => d.origin === "detector")).toBe(true);
  });

  it("повторный propose: тот же EDL, новая ревизия; отклонённое не воскресает, решения пользователя целы; A — stale; без изменений — no_change", async () => {
    const p = await videoProject();
    const first = await propose(p, { useAgent: false });
    const edlId = first.out!.edl_id;
    const d1 = docOf(p);
    // человек: первую паузу отклонил, остальное принял, добавил свою вырезку
    const ops = [
      ...d1.decisions.map((d, i) => ({ op: "set_status" as const, decision_id: d.id, status: i === 0 ? "rejected" as const : "accepted" as const })),
      { op: "add_cut" as const, start_word_id: "w_000004", end_word_id: "w_000004" },
    ];
    await saveEdlRevision({ db, store, root: s.root, roughcut: config.roughcut }, edlId, { base_revision: 1, ops });
    approveRoughCut(db, p);
    expect(roughCutApprovalValid(db, p)).toBe(true);

    // тот же результат детекторов — no_change: ревизии нет, A не тронут
    const again = await propose(p, { useAgent: false });
    expect(again.out).toMatchObject({ edl_id: edlId, revision: 2, no_change: true });
    expect(again.events.map((e) => e.kind)).toContain("no_change");
    expect(edls.get(db, edlId)!.current_revision).toBe(2);
    expect(roughCutApprovalValid(db, p)).toBe(true);

    // агент предлагает новое и то же место, что отклонено, — r3, A stale
    const agents = fakeAgents([ok({
      decisions: [{ start_word_id: "w_000012", end_word_id: "w_000012", reason: "filler", confidence: 0.5, explanation: "лишнее", quote: "году" }],
      reviews: [],
    })]);
    const third = await propose(p, { agents });
    expect(third.out).toMatchObject({ edl_id: edlId, revision: 3, no_change: false });
    expect(edls.byProject(db, p)!.id).toBe(edlId); // второго EDL нет
    expect(db.prepare("SELECT COUNT(*) FROM edls WHERE project_id = ?").pluck().get(p)).toBe(1);
    const d3 = docOf(p);
    expect(d3.parent_revision).toBe(2);
    const rejected = d3.decisions.filter((d) => d.source_start_us === 1_300_000);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.status).toBe("rejected");
    expect(d3.decisions.find((d) => d.origin === "user")).toMatchObject({ status: "accepted", start_word_id: "w_000004" });
    expect(d3.decisions.filter((d) => d.status === "proposed").map((d) => d.start_word_id)).toEqual(["w_000012"]);
    expect(third.out!.suppressed).toBeGreaterThan(0);
    expect(roughCutApprovalValid(db, p)).toBe(false);
  });

  it("M3: попытка 1 опубликовала ревизию и упала до finish → попытка 2 завершается по ней, агент не зовётся, r2 нет", async () => {
    const p = await videoProject();
    const a1 = fakeAgents([ok({ decisions: [], reviews: [] })]);
    const first = await propose(p, { agents: a1, noFinish: true });
    expect(first.r.status).toBe("completed");
    releaseLocks(db, jobs.update(db, first.job.id, { status: "pending", lease_owner: null, lease_until: null }));
    const a2 = fakeAgents([]);
    const second = await propose(p, { jobId: first.job.id, agents: a2 });
    expect(second.attempt).toBe(2);
    expect(second.out).toMatchObject({ edl_id: edlIdFor(first.job.id), revision: 1, reused: true });
    expect(a2.tasks).toHaveLength(0);
    expect(edls.get(db, edlIdFor(first.job.id))!.current_revision).toBe(1);
  });

  it("отмена во время агента → cancelled, EDL нет, draft не остался", async () => {
    const p = await videoProject();
    let started!: () => void;
    const called = new Promise<void>((res) => (started = res));
    const agents = fakeAgents([async (_t, signal) => {
      started();
      await new Promise<void>((res) => signal.addEventListener("abort", () => res(), { once: true }));
      return { status: "cancelled", error: { kind: "cancelled", message: "отменено" } };
    }]);
    let ac!: AbortController;
    let job!: Job;
    const run = propose(p, { agents, onStart: (a, j) => ((ac = a), (job = j)) });
    await called;
    requestCancel(db, job.id, { attemptAlive: true });
    ac.abort();
    const { r } = await run;
    expect(r).toMatchObject({ status: "cancelled", error: { code: "cancelled" } });
    expect(edls.byProject(db, p)).toBeUndefined();
    expect(draftsOf(job.id)).toEqual([]);
  });

  it("нет транскрипта — понятный отказ prepare; чужой projectId — отказ", async () => {
    const k = ++n;
    projects.create(db, { id: `p${k}`, kind: "video", title: "без ASR" });
    media.insert(db, asset({ id: `med_${k}`, project_id: `p${k}`, rel_path: `workspace/projects/p${k}/source/med_${k}/original.mov` }));
    const { r } = await propose(`p${k}`, { useAgent: false });
    expect(r).toMatchObject({ status: "failed", error: { code: "pipeline", stage: "prepare" } });
    expect(JSON.stringify(r)).toMatch(/нет транскрипта/);
  });

  it("слова нулевой длины и нулевые паузы whisper — EDL проходит схему, вырезок нулевой длины нет", async () => {
    const words = [
      w("w_000001", "а", 0, 400_000), w("w_000002", "б", 400_000, 400_000), w("w_000003", "в", 400_000, 900_000),
      w("w_000004", "э", 900_000, 900_000), w("w_000005", "г", 900_000, 1_300_000), w("w_000006", "конец", 9_000_000, 9_999_000),
    ];
    const p = await videoProject(words);
    const { r } = await propose(p, { useAgent: false });
    expect(r.status, JSON.stringify(r)).toBe("completed");
    const doc = docOf(p);
    for (const d of doc.decisions) expect(d.source_end_us).toBeGreaterThan(d.source_start_us);
    expect(doc.decisions.map((d) => d.reason)).toEqual(["pause"]);
  });
});
