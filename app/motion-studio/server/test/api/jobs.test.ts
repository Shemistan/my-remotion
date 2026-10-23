// Задачи: список, карточка с событиями и процессами, отмена (cancelJob), повтор (409 при живом
// процессе прежней попытки), ответы на уточнения.
import { afterEach, beforeEach, expect, it } from "vitest";
import * as jobs from "../../src/db/repos/jobs.js";
import { tx } from "../../src/db/tx.js";
import { enqueue } from "../../src/jobs/queue.js";
import { killLeftovers, spawnOrphan } from "../jobs/procs.js";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(async () => {
  killLeftovers();
  await api.close();
});

const put = (key: string, over: Partial<Parameters<typeof enqueue>[1]> = {}) =>
  enqueue(api.core.db, { type: "playground.generate", projectId: "playground", sceneId: "scn_api", input: { key }, idempotencyKey: key, ...over }).job;

function scene() {
  api.core.db.prepare("INSERT INTO scenes (id, project_id, title, created_at) VALUES ('scn_api', 'playground', 't', ?)").run(new Date().toISOString());
}

it("GET /jobs с фильтрами, GET /jobs/:id с событиями; 404 для чужого id", async () => {
  scene();
  const a = put("a");
  const b = put("b");
  jobs.update(api.core.db, b.id, { status: "failed" });
  tx(api.core.db, () => api.core.events.emit(api.core.db, { job_id: a.id, level: "info", kind: "log", message: "первое" }));
  const all = (await api.inj("GET", "/api/jobs", getHeaders)).json();
  expect(all.map((j: { id: string }) => j.id).sort()).toEqual([a.id, b.id].sort());
  expect((await api.inj("GET", "/api/jobs?status=failed", getHeaders)).json().map((j: { id: string }) => j.id)).toEqual([b.id]);
  expect((await api.inj("GET", "/api/jobs?sceneId=scn_api&status=pending", getHeaders)).json()).toHaveLength(1);
  expect((await api.inj("GET", "/api/jobs?status=nope", getHeaders)).statusCode).toBe(400);
  const one = (await api.inj("GET", `/api/jobs/${a.id}`, getHeaders)).json();
  expect(one.job.id).toBe(a.id);
  expect(one.events.map((e: { message: string }) => e.message)).toEqual(["первое"]);
  expect(one.processes).toEqual([]);
  expect((await api.inj("GET", "/api/jobs/job_nope", getHeaders)).statusCode).toBe(404);
});

it("POST /jobs/:id/cancel: pending → cancelled; завершённая — без изменений", async () => {
  scene();
  const a = put("a");
  const r = await api.inj("POST", `/api/jobs/${a.id}/cancel`, okHeaders, {});
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ id: a.id, status: "cancelled" });
  expect((await api.inj("POST", `/api/jobs/${a.id}/cancel`, okHeaders, {})).json().status).toBe("cancelled");
  expect((await api.inj("POST", "/api/jobs/job_nope/cancel", okHeaders, {})).statusCode).toBe(404);
});

it("POST /jobs/:id/retry: blocked с живым процессом → 409 stale_process_alive с pids и cmds; GET показывает процессы; после смерти — 200", async () => {
  scene();
  const a = put("a");
  jobs.update(api.core.db, a.id, { status: "blocked", attempt: 1, error: { code: "stale_process", message: "живы" } });
  const orphan = await spawnOrphan(api.core.processes, { runId: a.id, attempt: 1 }, api.s.tmp);
  const r = await api.inj("POST", `/api/jobs/${a.id}/retry`, okHeaders, {});
  expect(r.statusCode).toBe(409);
  expect(r.json()).toMatchObject({ error: "stale_process_alive", pids: [orphan.pid] });
  expect(r.json().cmds).toHaveLength(1);
  const g = (await api.inj("GET", `/api/jobs/${a.id}`, getHeaders)).json();
  expect(g.processes).toEqual([expect.objectContaining({ pid: orphan.pid, attempt: 1, alive: true })]);
  process.kill(-orphan.pid, "SIGKILL");
  await new Promise((r) => setTimeout(r, 200));
  const ok = await api.inj("POST", `/api/jobs/${a.id}/retry`, okHeaders, {});
  expect(ok.statusCode).toBe(200);
  expect(ok.json()).toMatchObject({ status: "pending", interrupts: 0 });
  // pending повторять нечего
  expect((await api.inj("POST", `/api/jobs/${a.id}/retry`, okHeaders, {})).statusCode).toBe(409);
});

it("POST /jobs/:id/input: ответы или skip → pending; не awaiting_input → 409; невалидное тело → 400", async () => {
  scene();
  const a = put("a");
  expect((await api.inj("POST", `/api/jobs/${a.id}/input`, okHeaders, { skip: true })).statusCode).toBe(409);
  jobs.update(api.core.db, a.id, { status: "awaiting_input" });
  expect((await api.inj("POST", `/api/jobs/${a.id}/input`, okHeaders, { skip: false })).statusCode).toBe(400);
  const r = await api.inj("POST", `/api/jobs/${a.id}/input`, okHeaders, { answers: { "0": "три года" } });
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ status: "pending", input: { answers: { "0": "три года" } } });
  const b = put("b");
  jobs.update(api.core.db, b.id, { status: "awaiting_input" });
  expect((await api.inj("POST", `/api/jobs/${b.id}/input`, okHeaders, { skip: true })).json().input.answers).toBe("skip");
});
