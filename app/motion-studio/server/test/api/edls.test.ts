// EDL через API (Task 29): чтение с якорями по текущему транскрипту без записи (ревью
// Task 27, M2), word_map, правка от base_revision, лимиты, один EDL на проект (M6), превью
// ревизии `preview/<edl>/r<N>/` только по id с Range.
import { afterEach, beforeEach, expect, it } from "vitest";
import * as edls from "../../src/db/repos/edls.js";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";
import { k, seedPreview, seedVideoApi } from "./video-helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
  await seedVideoApi(api);
});
afterEach(() => api.close());

const changes = () => api.core.db.prepare("SELECT total_changes()").pluck().get() as number;

it("GET /edls/:id — документ, таймлайн, word_map; якорь на удалённое правкой слово пересчитан при чтении без записи", async () => {
  const r = await api.inj("GET", "/api/edls/edl_1", getHeaders);
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ id: "edl_1", current_revision: 1, preview_ready: false, timeline: { duration_us: 10_000_000 } });
  expect(r.json().word_map.w_000003).toMatchObject({ state: "kept" });
  // правка удаляет «эээ» (w_000003) — якорь вырезки-паразита больше не существует
  const t = await api.inj("POST", "/api/transcripts/trn_1/revisions", okHeaders, {
    base_revision: 1, ops: [{ op: "replace_span", start_word_id: "w_000003", end_word_id: "w_000003", text: "" }],
  });
  expect(t.statusCode, t.body).toBe(201);
  const ids = t.json().doc.words.map((x: { id: string }) => x.id);
  const c0 = changes();
  const e = await api.inj("GET", "/api/edls/edl_1", getHeaders);
  expect(changes()).toBe(c0);
  const fil = e.json().doc.decisions.find((d: { id: string }) => d.id === "fil_r1_1");
  expect(ids).not.toContain("w_000003");
  expect(fil.start_word_id).toBeUndefined();
  expect(fil.source_start_us).toBe(1_000_000);
  expect(Object.keys(e.json().word_map).sort()).toEqual([...ids].sort());
  expect(edls.get(api.core.db, "edl_1")!.current_revision).toBe(1);
});

it("правка EDL: принять → 201 r2, таймлайн короче; конфликт → 409; холостая → 422; лимит операций", async () => {
  const a = await api.inj("POST", "/api/edls/edl_1/revisions", okHeaders, { base_revision: 1, ops: [{ op: "set_status", decision_id: "pau_r1_1", status: "accepted" }] });
  expect(a.statusCode, a.body).toBe(201);
  expect(a.json()).toMatchObject({ id: "edl_1", current_revision: 2 });
  expect(a.json().timeline.duration_us).toBeLessThan(10_000_000);
  expect(a.json().word_map).toBeTypeOf("object");
  const stale = await api.inj("POST", "/api/edls/edl_1/revisions", okHeaders, { base_revision: 1, ops: [{ op: "set_status", decision_id: "fil_r1_1", status: "accepted" }] });
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ error: "revision_conflict", base: 1, current: 2 });
  const same = await api.inj("POST", "/api/edls/edl_1/revisions", okHeaders, { base_revision: 2, ops: [{ op: "set_status", decision_id: "pau_r1_1", status: "accepted" }] });
  expect(same.json().error).toBe("no_change");
  expect((await api.inj("POST", "/api/edls/edl_1/revisions", okHeaders, { base_revision: 2, ops: [{ op: "set_status", decision_id: "nope", status: "accepted" }] })).json().error).toBe("unknown_decision");
  const many = Array.from({ length: 1001 }, () => ({ op: "set_status", decision_id: "pau_r1_1", status: "rejected" }));
  expect((await api.inj("POST", "/api/edls/edl_1/revisions", okHeaders, { base_revision: 2, ops: many })).json().error).toBe("too_many_ops");
});

it("propose: 202 roughcut.propose; без транскрипта — 409 no_transcript; повтор ключа — та же задача", async () => {
  const a = await api.inj("POST", "/api/projects/p1/roughcut/propose", { ...okHeaders, ...k("rc1") }, { useAgent: false });
  expect(a.statusCode).toBe(202);
  expect(a.json().job).toMatchObject({ type: "roughcut.propose", input: { projectId: "p1", useAgent: false } });
  expect((await api.inj("POST", "/api/projects/p1/roughcut/propose", { ...okHeaders, ...k("rc1") }, { useAgent: false })).json().job.id).toBe(a.json().job.id);
  const p2 = (await api.inj("POST", "/api/projects", okHeaders, { title: "Пусто", kind: "video" })).json().id;
  expect((await api.inj("POST", `/api/projects/${p2}/roughcut/propose`, { ...okHeaders, ...k("rc2") }, {})).json().error).toBe("no_transcript");
});

it("превью ревизии: POST → 202 roughcut.preview; файл только опубликованный, Range; нет ревизии — 404", async () => {
  const a = await api.inj("POST", "/api/edls/edl_1/revisions/1/preview", { ...okHeaders, ...k("pv1") }, {});
  expect(a.statusCode).toBe(202);
  expect(a.json().job).toMatchObject({ type: "roughcut.preview", project_id: "p1", input: { edlId: "edl_1", revision: 1 } });
  expect((await api.inj("POST", "/api/edls/edl_1/revisions/9/preview", { ...okHeaders, ...k("pv2") }, {})).statusCode).toBe(404);
  expect((await api.inj("GET", "/api/edls/edl_1/revisions/1/preview.mp4", getHeaders)).statusCode).toBe(404);
  await seedPreview(api, 1, 3000);
  const r = await api.inj("GET", "/api/edls/edl_1/revisions/1/preview.mp4", { ...getHeaders, range: "bytes=10-19" });
  expect(r.statusCode).toBe(206);
  expect(r.headers["content-range"]).toBe("bytes 10-19/3000");
  expect((await api.inj("GET", "/api/edls/edl_1", getHeaders)).json().preview_ready).toBe(true);
  for (const bad of ["0", "01", "..%2F1", "1x"]) {
    expect((await api.inj("GET", `/api/edls/edl_1/revisions/${bad}/preview.mp4`, getHeaders)).statusCode, bad).not.toBe(200);
  }
});
