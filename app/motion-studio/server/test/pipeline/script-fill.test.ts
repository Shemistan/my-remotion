// S16a F2/F3: дозаполнение сцены плана сценария — сцена по выделению или со сменённым приёмом
// ждёт (`fill: pending`, blocking `scene_unfilled`), задача `script.plan` с `fill` делает малый
// вызов Director на фрагмент (соседние сцены и стиль проекта — контекст) и публикует ревизию.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Job, type ScriptDirectorOutput, type ScriptDirectorScene } from "@ms/contracts";
import { fileProcessRegistry } from "@ms/core";
import type { ZodType } from "zod";
import type { AgentResult, AgentRuntimeAdapter, AgentTask } from "../../src/agents/runtime.js";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { type AppConfig, loadConfig } from "../../src/config.js";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as projects from "../../src/db/repos/projects.js";
import { claimNext, enqueue, finish } from "../../src/jobs/queue.js";
import { AttemptPermits, Semaphore } from "../../src/jobs/semaphore.js";
import type { HandlerResult, JobContext } from "../../src/jobs/types.js";
import { type ScriptPlanDeps, scriptPlan } from "../../src/pipeline/script-plan.js";
import * as jobsRepo from "../../src/db/repos/jobs.js";
import { ensureFillJob } from "../../src/script/fill-jobs.js";
import { savePlanOps } from "../../src/script/plan-ops.js";
import { currentScriptPlan } from "../../src/script/read.js";
import { saveScriptText } from "../../src/script/text.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { TEXT, cleanScenes, docOf, out, scene, w } from "../script/plan-fixtures.js";

let s: TestStore;
let db: Db;
let store: ArtifactStore;
let config: AppConfig;
let n = 0;

beforeAll(async () => {
  s = await makeStore("ms-script-fill-");
  db = openDb(s.root);
  await migrate(db);
  store = new ArtifactStore({ root: s.root, db, guard: s.guard });
  config = loadConfig({ MS_DATA_DIR: s.root });
});
afterAll(async () => {
  db?.close();
  if (s) await removeStore(s);
});

const DOC = docOf([{ title: "Блок", text: TEXT }]);
/** План агента без средней фразы: w1–w14 hero-number и w29–w40 bar-compare. */
const TWO = out(DOC, [cleanScenes(DOC)[0]!, cleanScenes(DOC)[2]!]);

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
        status: "completed", usage: { model: "sonnet", inputTokens: 500, outputTokens: 50, costUsd: 0.01 }, permissionDenials: [],
        stdoutPath: "", stderrPath: "", startedAt: now, finishedAt: now, ...r, ...(o !== undefined ? { output: o } : {}),
      } as AgentResult<O>;
    },
  };
}
const ok = (o: ScriptDirectorOutput): Reply => async () => ({ output: o });
const patch = (scenes: ScriptDirectorScene[]): Reply => async () => ({ output: { scenes } });
const cliFail: Reply = async () => ({ status: "failed", error: { kind: "cli", message: "claude упал" } });

const sem = () => new AttemptPermits(new Semaphore(2));
function context(job: Job, attempt: number, events: { kind: string; message: string }[], signal: AbortSignal = new AbortController().signal): JobContext {
  return {
    db, job, attempt, signal,
    run: { root: s.root, runId: job.id, attempt, registry: fileProcessRegistry(s.root) },
    emit: (kind, message) => events.push({ kind, message }), progress: () => undefined, fenceOk: () => true,
    agents: sem(), renders: sem(), heavy: sem(),
  };
}

/** Выполняет поставленную задачу; `ac` — отмена попытки, `storage` — проверка хранилища. */
async function runJob(job: Job, agents: AgentRuntimeAdapter, o: { ac?: AbortController; storage?: ScriptPlanDeps["storage"] } = {}) {
  const claim = claimNext(db, "test", 0, { running: 0, maxRunning: 4 }, { ids: new Set([job.id]) })!;
  const events: { kind: string; message: string }[] = [];
  const deps: ScriptPlanDeps = { root: s.root, config, storage: o.storage ?? s.guard, agents };
  const r: HandlerResult = await scriptPlan(() => deps)(context(claim.job, claim.attempt, events, o.ac?.signal));
  finish(db, claim.job.id, claim.attempt, r);
  return { r, events };
}

async function run(p: string, input: Record<string, unknown>, agents: AgentRuntimeAdapter) {
  const job = enqueue(db, { type: "script.plan", projectId: p, input: { projectId: p, ...input }, idempotencyKey: `sf-${++n}` }).job;
  return runJob(job, agents);
}

/** Сценарный проект с планом агента TWO (r1). */
async function project(): Promise<string> {
  const p = `sf${++n}`;
  projects.create(db, { id: p, kind: "script", title: `Сценарий ${n}` });
  await saveScriptText({ db, store, root: s.root }, p, { blocks: [{ title: "Блок", text: TEXT }] });
  const r = await run(p, {}, fakeAgents([ok(TWO)]));
  expect(r.r.status, JSON.stringify(r.r)).toBe("completed");
  return p;
}

const ops = (p: string, base: number, o: Parameters<typeof savePlanOps>[2]["ops"]) => savePlanOps({ db, store, root: s.root }, p, { base_revision: base, ops: o });
const unfilled = (p: string) => currentScriptPlan(db, s.root, p)!.doc.issues.filter((x) => x.code === "scene_unfilled");

describe("дозаполнение сцены (script.plan fill)", () => {
  it("F2: сцена по выделению → малый вызов на фрагмент с соседями и стилем → ревизия с идеей и числами, приём человека остаётся", async () => {
    const p = await project();
    const d2 = await ops(p, 1, [{ op: "add", start_word_id: w(15), end_word_id: w(28), technique: "process-steps" }]);
    const added = d2.items.find((x) => x.origin === "user")!;
    expect(added).toMatchObject({ fill: "pending", idea: "" });
    expect(unfilled(p)).toHaveLength(1);

    const agents = fakeAgents([patch([scene(DOC, w(15), w(28), {
      technique: "race", pattern: "sequence-steps", idea: "бакет на восемь слотов, пара бакетов в цепочке", purpose: "устройство старой map",
      data: [{ label: "слотов", value: 8, quote: "восемь слотов" }, { label: "выдумка", value: 9, quote: "девять" }],
      key_terms: [{ text: "бакетах", word_id: w(19) }, { text: "Swiss", word_id: w(13) }],
    })])]);
    const r = await run(p, { fill: { plan_id: d2.plan_id, revision: 2 } }, agents);
    expect(r.r.status, JSON.stringify(r.r)).toBe("completed");
    expect(agents.tasks).toHaveLength(1);
    const input = String(agents.tasks[0]!.input);
    expect(input).toMatch(/# Дозаполнение сцены/);
    expect(input).toMatch(/w_000001–w_000014/); // соседи
    expect(input).toMatch(/w_000029–w_000040/);
    expect(input).toMatch(/process-steps/);
    expect(input).toMatch(/preset dark-premium/); // стиль проекта (style_lock)
    expect(input).toMatch(/w_000015 Старая/);
    expect(input).not.toMatch(/w_000005 /); // малый вызов: только фрагмент, не весь текст

    const cur = currentScriptPlan(db, s.root, p)!.doc;
    expect(cur.revision).toBe(3);
    const x = cur.items.find((i) => i.id === added.id)!;
    expect(x).toMatchObject({ technique: "process-steps", start_word_id: w(15), end_word_id: w(28), idea: "бакет на восемь слотов, пара бакетов в цепочке", purpose: "устройство старой map" });
    expect(x.fill).toBeUndefined();
    expect(x.data).toEqual([{ label: "слотов", value: 8, quote: "восемь слотов" }]); // число не из фрагмента отпало
    expect(x.key_terms).toEqual([{ text: "бакетах", word_id: w(19) }]);
    expect(unfilled(p)).toEqual([]);
    expect(r.r).toMatchObject({ outputRefs: { plan_id: d2.plan_id, revision: 3, filled: [added.id], failed: [] } });
    // ревью S16a M8: время дозаполнения — в журнале задачи, по сцене и итогом
    const timing = r.events.filter((e) => e.kind === "fill_scene");
    expect(timing).toHaveLength(1);
    expect(timing[0]!.message).toMatch(new RegExp(`^${added.id}: дозаполнена за \\d+,\\d с \\(вызовов Director: 1\\)$`));
    expect(r.events.find((e) => e.kind === "fill_done")!.message).toMatch(/сцен в работе: 1, всего \d+,\d с/);
  });

  it("F3: смена приёма → дозаполнение под новый приём; паттерн чужой приёму — паттерн приёма", async () => {
    const p = await project();
    const d2 = await ops(p, 1, [{ op: "modify", item_id: "ss_002", patch: { technique: "timeline" } }]);
    expect(d2.items[1]).toMatchObject({ technique: "timeline", idea: "", fill: "pending" });
    const agents = fakeAgents([patch([scene(DOC, w(29), w(40), { technique: "timeline", pattern: "comparison", idea: "ось: рост массива при 6,5 записях" })])]);
    const r = await run(p, { fill: { plan_id: d2.plan_id, revision: 2 } }, agents);
    expect(r.r.status, JSON.stringify(r.r)).toBe("completed");
    expect(String(agents.tasks[0]!.input)).toMatch(/timeline/);
    const x = currentScriptPlan(db, s.root, p)!.doc.items[1]!;
    expect(x).toMatchObject({ technique: "timeline", pattern: "timeline", idea: "ось: рост массива при 6,5 записях" });
    expect(x.fill).toBeUndefined();
  });

  it("агент не ответил → ревизия с fill: failed, blocking с подсказкой вписать идею", async () => {
    const p = await project();
    const d2 = await ops(p, 1, [{ op: "add", start_word_id: w(15), end_word_id: w(28) }]);
    const r = await run(p, { fill: { plan_id: d2.plan_id, revision: 2 } }, fakeAgents([cliFail, cliFail]));
    expect(r.r.status, JSON.stringify(r.r)).toBe("completed");
    const cur = currentScriptPlan(db, s.root, p)!.doc;
    expect(cur.items.find((x) => x.origin === "user")!.fill).toBe("failed");
    expect(unfilled(p)[0]!.message).toMatch(/впишите идею/);
    expect(r.events.map((e) => e.kind)).toContain("fill_failed");
    expect(r.events.find((e) => e.kind === "fill_scene")!.message).toMatch(/не дозаполнена за \d+,\d с \(вызовов Director: 2\)/);
  });

  it("нечего дозаполнять (план перестроен или уже заполнен) — без вызова и без ревизии", async () => {
    const p = await project();
    const plan = currentScriptPlan(db, s.root, p)!;
    const agents = fakeAgents([]);
    const r = await run(p, { fill: { plan_id: plan.planId, revision: 1 } }, agents);
    expect(r.r).toMatchObject({ status: "completed", outputRefs: { revision: 1, filled: [], failed: [] } });
    expect(agents.tasks).toHaveLength(0);
    expect(currentScriptPlan(db, s.root, p)!.doc.revision).toBe(1);
  });

  it("ревью S16a I1: отмена и падение не оставляют сцену без задачи — повтор ставит новую и дописывает", async () => {
    const p = await project();
    const d2 = await ops(p, 1, [{ op: "add", start_word_id: w(15), end_word_id: w(28) }]);
    const first = ensureFillJob(db, p, d2)!;
    expect(first.created).toBe(true);
    expect(ensureFillJob(db, p, d2)).toMatchObject({ created: false, job: { id: first.job.id } });

    // отмена человеком посреди вызова Director
    const ac = new AbortController();
    const cancelled = await runJob(first.job, fakeAgents([async () => {
      jobsRepo.update(db, first.job.id, { cancel_requested: true });
      ac.abort();
      return { status: "cancelled", error: { kind: "cancelled", message: "отменено" } };
    }]), { ac });
    expect(cancelled.r.status).toBe("cancelled");
    expect(jobsRepo.get(db, first.job.id)!.status).toBe("cancelled");
    expect(currentScriptPlan(db, s.root, p)!.doc.items.find((x) => x.origin === "user")!.fill).toBe("pending");

    // повтор — новая задача; хранилище пропало — падение, сцена всё так же ждёт
    const second = ensureFillJob(db, p, currentScriptPlan(db, s.root, p)!.doc)!;
    expect(second).toMatchObject({ created: true });
    expect(second.job.id).not.toBe(first.job.id);
    const failed = await runJob(second.job, fakeAgents([]), { storage: async () => ({ ok: false, reason: "not_found", detail: "SSD отключён" }) });
    expect(failed.r).toMatchObject({ status: "failed", error: { code: "storage_unavailable" } });
    expect(currentScriptPlan(db, s.root, p)!.doc.items.find((x) => x.origin === "user")!.fill).toBe("pending");

    // ещё повтор — дописывает
    const third = ensureFillJob(db, p, currentScriptPlan(db, s.root, p)!.doc)!;
    expect(third.created).toBe(true);
    const done = await runJob(third.job, fakeAgents([patch([scene(DOC, w(15), w(28), { technique: "process-steps", pattern: "sequence-steps", idea: "бакеты цепочкой" })])]));
    expect(done.r.status, JSON.stringify(done.r)).toBe("completed");
    const x = currentScriptPlan(db, s.root, p)!.doc.items.find((i) => i.origin === "user")!;
    expect(x.idea).toBe("бакеты цепочкой");
    expect(x.fill).toBeUndefined();
    expect(ensureFillJob(db, p, currentScriptPlan(db, s.root, p)!.doc)).toBeNull();
  });

  it("ревью S16a M1: назначение, заданное человеком при добавлении, Director не перетирает", async () => {
    const p = await project();
    const d2 = await ops(p, 1, [{ op: "add", start_word_id: w(15), end_word_id: w(28), purpose: "зритель видит цепочку бакетов" }]);
    const r = await run(p, { fill: { plan_id: d2.plan_id, revision: 2 } }, fakeAgents([patch([scene(DOC, w(15), w(28), {
      technique: "process-steps", pattern: "sequence-steps", idea: "бакеты цепочкой", purpose: "устройство старой map",
    })])]));
    expect(r.r.status, JSON.stringify(r.r)).toBe("completed");
    expect(currentScriptPlan(db, s.root, p)!.doc.items.find((x) => x.origin === "user")).toMatchObject({ idea: "бакеты цепочкой", purpose: "зритель видит цепочку бакетов" });
  });

  it("ревью S16a M2: текст сменился после постановки — план устарел, без вызова и без ревизии", async () => {
    const p = await project();
    const d2 = await ops(p, 1, [{ op: "add", start_word_id: w(15), end_word_id: w(28) }]);
    await saveScriptText({ db, store, root: s.root }, p, { base_revision: 1, blocks: [{ title: "Блок", text: `${TEXT} Ещё одна фраза.` }] });
    const agents = fakeAgents([]);
    const r = await run(p, { fill: { plan_id: d2.plan_id, revision: 2 } }, agents);
    expect(r.r).toMatchObject({ status: "completed", outputRefs: { revision: 2, filled: [], failed: [] } });
    expect(r.events.map((e) => e.kind)).toContain("fill_nothing");
    expect(agents.tasks).toHaveLength(0);
    expect(currentScriptPlan(db, s.root, p)!.doc.revision).toBe(2);
  });
});
