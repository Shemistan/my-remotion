// Маршруты диагностики (Task 48): стоимость задачи в `GET /api/jobs`, трассировка, журнал
// сервера (события задач пишутся с корреляционными полями), doctor с кэшем 30 с, архив.
import { homedir } from "node:os";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as agentRuns from "../../src/db/repos/agent-runs.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { tx } from "../../src/db/tx.js";
import { EventBus } from "../../src/jobs/events.js";

const doctorCalls: { fast?: boolean }[] = [];
vi.mock("../../src/diagnostics/doctor-checks.js", () => ({
  runDoctor: async (o: { fast?: boolean }) => {
    doctorCalls.push(o);
    return { ok: true, rows: [{ name: "node", ok: true, status: "ok", detail: `вызов ${doctorCalls.length}` }], created_at: new Date().toISOString() };
  },
}));

const { makeApi, getHeaders, okHeaders } = await import("./helpers.js");
type Api = Awaited<ReturnType<typeof makeApi>>;

let api: Api;
beforeEach(async () => {
  doctorCalls.length = 0;
  api = await makeApi();
});
afterEach(async () => {
  await api.close();
});

function jobWithRuns(id: string): void {
  const db = api.core.db;
  jobs.insert(db, { id, type: "script.plan", project_id: "playground", input: {}, status: "failed", attempt: 2 });
  agentRuns.insert(db, { id: `${id}_a1`, job_id: id, role: "script_director", model: "sonnet" });
  agentRuns.finish(db, `${id}_a1`, { status: "failed", cost_usd: 0.25 }); // неудачная попытка (S17b)
  agentRuns.insert(db, { id: `${id}_a2`, job_id: id, role: "script_director", model: "sonnet" });
  agentRuns.finish(db, `${id}_a2`, { status: "completed", cost_usd: 0.5 });
}

it("GET /api/jobs/:id и список: cost_usd = jobCost (с неудачными попытками)", async () => {
  jobWithRuns("job_cost");
  jobs.insert(api.core.db, { id: "job_free", type: "script.plan", project_id: "playground", input: {} });
  const one = (await api.inj("GET", "/api/jobs/job_cost", getHeaders)).json();
  expect(one.job.cost_usd).toBe(0.75);
  const list = (await api.inj("GET", "/api/jobs", getHeaders)).json() as { id: string; cost_usd?: number }[];
  expect(list.find((j) => j.id === "job_cost")!.cost_usd).toBe(0.75);
  expect(list.find((j) => j.id === "job_free")!.cost_usd).toBe(0);
});

it("GET /api/jobs/:id/trace: дерево и стоимость; 404", async () => {
  jobWithRuns("job_tr");
  const r = await api.inj("GET", "/api/jobs/job_tr/trace", getHeaders);
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ project: { id: "playground" }, job: { id: "job_tr" }, cost: { usd: 0.75, runs: 2, unknown: 0 } });
  expect(r.json().agentRuns).toHaveLength(2);
  expect((await api.inj("GET", "/api/jobs/job_nope/trace", getHeaders)).statusCode).toBe(404);
});

it("GET /api/logs: события задач в журнале с корреляцией, фильтры, лимит ≤ 1000", async () => {
  jobs.insert(api.core.db, { id: "job_log", type: "playground.generate", project_id: "playground", input: {}, attempt: 3 });
  tx(api.core.db, () => api.core.events.emit(api.core.db, { job_id: "job_log", level: "error", kind: "failed", message: "упал: Bearer sec.ret" }));
  let entries: Record<string, unknown>[] = [];
  await vi.waitFor(async () => {
    entries = (await api.inj("GET", "/api/logs?jobId=job_log", getHeaders)).json();
    expect(entries).toHaveLength(1);
  });
  expect(entries[0]).toMatchObject({ level: "error", job_id: "job_log", project_id: "playground", attempt: 3, kind: "failed", msg: "упал: Bearer [скрыто]" });
  expect((await api.inj("GET", "/api/logs?jobId=job_log&level=warn", getHeaders)).json()).toHaveLength(1);
  expect((await api.inj("GET", "/api/logs?jobId=job_other", getHeaders)).json()).toHaveLength(0);
  expect((await api.inj("GET", "/api/logs?limit=1001", getHeaders)).statusCode).toBe(400);
});

it("GET /api/diagnostics/doctor: кэш 30 с по виду проверки, refresh — заново", async () => {
  const a = (await api.inj("GET", "/api/diagnostics/doctor?fast=1", getHeaders)).json();
  const b = (await api.inj("GET", "/api/diagnostics/doctor?fast=1", getHeaders)).json();
  expect(a).toEqual(b);
  expect(doctorCalls).toHaveLength(1);
  expect(doctorCalls[0]).toMatchObject({ fast: true });
  await api.inj("GET", "/api/diagnostics/doctor?fast=1&refresh=1", getHeaders);
  expect(doctorCalls).toHaveLength(2);
  await api.inj("GET", "/api/diagnostics/doctor", getHeaders);
  expect(doctorCalls).toHaveLength(3);
  expect(doctorCalls[2]).toMatchObject({ fast: false });
});

it("POST /api/diagnostics/bundle → 202, список, скачивание; чужое имя — 404", async () => {
  const r = await api.inj("POST", "/api/diagnostics/bundle", okHeaders, { includePrompts: false });
  expect(r.statusCode).toBe(202);
  const name = r.json().name as string;
  expect(name).toMatch(/^diag-\d{8}T\d{6}(-\d+)?\.zip$/);
  await vi.waitFor(async () => {
    const list = (await api.inj("GET", "/api/diagnostics/bundles", getHeaders)).json() as { name: string; status: string }[];
    expect(list.find((b) => b.name === name)?.status).toBe("ready");
  });
  const file = await api.inj("GET", `/api/diagnostics/bundles/${name}`, getHeaders);
  expect(file.statusCode).toBe(200);
  expect(file.headers["content-type"]).toBe("application/zip");
  expect(file.rawPayload.subarray(0, 2).toString()).toBe("PK");
  expect((await api.inj("GET", "/api/diagnostics/bundles/..%2Fstudio.db", getHeaders)).statusCode).toBe(404);
  expect((await api.inj("GET", "/api/diagnostics/bundles/diag-20200101T000000.zip", getHeaders)).statusCode).toBe(404);
  // Origin обязателен на POST (общая защита)
  expect((await api.inj("POST", "/api/diagnostics/bundle", getHeaders, {})).statusCode).toBe(403);
});

it("GET /api/logs: текст сценария скрыт (kind, ids, коды остаются), пути маскированы", async () => {
  const db = api.core.db;
  jobs.insert(db, { id: "job_sc", type: "script.plan", project_id: "playground", input: {} });
  jobs.insert(db, { id: "job_pg", type: "playground.generate", project_id: "playground", input: {} });
  tx(db, () => {
    api.core.events.emit(db, { job_id: "job_sc", level: "warn", kind: "quote_autofixed", message: "s3: «Мы выросли втрое»", data: { item_id: "s3", code: "quote_autofixed", quote: "Мы выросли втрое" } });
    api.core.events.emit(db, { job_id: "job_pg", level: "error", kind: "failed", message: `нет файла ${api.core.root}/projects/a.mp4 и ${homedir()}/b.mov`, data: { path: "/Users/ivan/c.mov" } });
  });
  let entries: Record<string, unknown>[] = [];
  await vi.waitFor(async () => {
    entries = (await api.inj("GET", "/api/logs?projectId=playground", getHeaders)).json();
    expect(entries.filter((e) => e.job_id === "job_sc" || e.job_id === "job_pg")).toHaveLength(2);
  });
  const text = JSON.stringify(entries);
  expect(text).not.toContain("втрое");
  expect(text).not.toContain(api.core.root);
  expect(text).not.toMatch(/\/Users\/(?!…)/);
  expect(entries.find((e) => e.job_id === "job_sc")).toMatchObject({ kind: "quote_autofixed", level: "warn", data: { item_id: "s3", code: "quote_autofixed" } });
  expect(entries.find((e) => e.job_id === "job_pg")).toMatchObject({ msg: "нет файла хранилище/projects/a.mp4 и ~/b.mov", data: { path: "/Users/…/c.mov" } });
});

it("журнал событий подключается позже, если при старте база была недоступна", async () => {
  await api.close();
  const spy = vi.spyOn(EventBus.prototype, "tail").mockImplementationOnce(() => {
    throw new Error("storage_offline");
  });
  api = await makeApi();
  expect(spy).toHaveBeenCalledTimes(1);
  await api.inj("GET", "/api/diagnostics/bundles", getHeaders); // любой запрос — повторная подписка
  jobs.insert(api.core.db, { id: "job_late", type: "playground.generate", project_id: "playground", input: {} });
  tx(api.core.db, () => api.core.events.emit(api.core.db, { job_id: "job_late", level: "info", kind: "log", message: "после подписки" }));
  await vi.waitFor(async () => {
    expect((await api.inj("GET", "/api/logs?jobId=job_late", getHeaders)).json()).toHaveLength(1);
  });
  spy.mockRestore();
});
