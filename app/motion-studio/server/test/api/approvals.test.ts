// Approval A через API (Task 29): нельзя при proposed (409 proposed_left с числом); утверждение
// → valid; новая ревизия EDL → stale(subject_changed) — GET показывает это без записи в БД;
// отзыв; сводка видеопроекта одним запросом.
import { afterEach, beforeEach, expect, it } from "vitest";
import * as approvals from "../../src/db/repos/approvals.js";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";
import { seedVideoApi } from "./video-helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
  await seedVideoApi(api);
});
afterEach(() => api.close());

const changes = () => api.core.db.prepare("SELECT total_changes()").pluck().get() as number;
const setStatus = (base: number, ops: { id: string; status: "accepted" | "rejected" }[]) =>
  api.inj("POST", "/api/edls/edl_1/revisions", okHeaders, { base_revision: base, ops: ops.map((o) => ({ op: "set_status", decision_id: o.id, status: o.status })) });

it("A: proposed_left → утверждено → правка EDL → устарело (GET без записи) → отзыв", async () => {
  expect((await api.inj("GET", "/api/projects/p1/approvals", getHeaders)).json()).toMatchObject({ A: { state: "missing" }, B: { state: "missing" } });
  const no = await api.inj("POST", "/api/projects/p1/approvals", okHeaders, { kind: "A" });
  expect(no.statusCode).toBe(409);
  expect(no.json()).toMatchObject({ error: "proposed_left", count: 2 });
  expect((await setStatus(1, [{ id: "pau_r1_1", status: "accepted" }, { id: "fil_r1_1", status: "rejected" }])).statusCode).toBe(201);
  const a = await api.inj("POST", "/api/projects/p1/approvals", okHeaders, { kind: "A" });
  expect(a.statusCode, a.body).toBe(201);
  expect(a.json()).toMatchObject({ kind: "A", status: "valid", subject_ref: "edl:edl_1@r2" });
  expect((await api.inj("GET", "/api/projects/p1/approvals", getHeaders)).json().A).toMatchObject({ state: "valid" });

  expect((await setStatus(2, [{ id: "fil_r1_1", status: "accepted" }])).statusCode).toBe(201);
  // registerEdlRevision уже пометил A stale(subject_changed)
  const s = await api.inj("GET", "/api/projects/p1/approvals", getHeaders);
  expect(s.json().A).toMatchObject({ state: "stale", reason: "subject_changed" });

  const rv = await api.inj("POST", `/api/approvals/${a.json().id}/revoke`, okHeaders, {});
  expect(rv.statusCode).toBe(200);
  expect(rv.json().status).toBe("revoked");
  expect((await api.inj("GET", "/api/projects/p1/approvals", getHeaders)).json().A.state).toBe("missing");
  expect((await api.inj("POST", "/api/approvals/apr_nope/revoke", okHeaders, {})).statusCode).toBe(404);
  expect((await api.inj("POST", "/api/projects/p1/approvals", okHeaders, { kind: "C" })).statusCode).toBe(400);
});

it("GET approvals при разошедшемся субъекте показывает stale, но в БД ничего не пишет", async () => {
  await setStatus(1, [{ id: "pau_r1_1", status: "accepted" }, { id: "fil_r1_1", status: "rejected" }]);
  const a = (await api.inj("POST", "/api/projects/p1/approvals", okHeaders, { kind: "A" })).json();
  // субъект разошёлся в обход registerEdlRevision (хеш другой) — approval в БД ещё valid
  api.core.db.prepare("UPDATE approvals SET subject_hash = ? WHERE id = ?").run("c".repeat(64), a.id);
  const c0 = changes();
  const r = await api.inj("GET", "/api/projects/p1/approvals", getHeaders);
  expect(r.json().A).toMatchObject({ state: "stale", reason: "subject_changed" });
  expect(changes()).toBe(c0);
  expect(approvals.get(api.core.db, a.id)!.status).toBe("valid");
});

it("GET /projects/:id/video — проект, медиа, транскрипт, EDL, approvals, последние задачи", async () => {
  const r = await api.inj("GET", "/api/projects/p1/video", getHeaders);
  expect(r.statusCode, r.body).toBe(200);
  expect(r.json()).toMatchObject({
    project: { id: "p1", kind: "video" },
    media: { asset: { id: "med_1" } },
    transcript: { id: "trn_1", current_revision: 1 },
    edl: { id: "edl_1", current_revision: 1, preview_ready: false },
    approvals: { A: { state: "missing" } },
    jobs: [],
  });
  await api.inj("POST", "/api/projects/p1/roughcut/propose", { ...okHeaders, "idempotency-key": "x1" }, {});
  expect((await api.inj("GET", "/api/projects/p1/video", getHeaders)).json().jobs.map((j: { type: string }) => j.type)).toEqual(["roughcut.propose"]);
  const pg = (await api.inj("POST", "/api/projects", okHeaders, { title: "pg" })).json().id;
  expect((await api.inj("GET", `/api/projects/${pg}/video`, getHeaders)).json().error).toBe("not_video_project");
});
