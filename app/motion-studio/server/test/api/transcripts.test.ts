// Транскрипт через API (Task 29): чтение ревизий, правка от base_revision (409
// revision_conflict / resource_busy, 422 no_change и коды EditError), лимиты тела и операций
// до разбора (ревью Task 27, M5).
import { afterEach, beforeEach, expect, it } from "vitest";
import * as resourceLocks from "../../src/db/repos/resource-locks.js";
import * as jobs from "../../src/db/repos/jobs.js";
import { projectLockKey } from "../../src/jobs/locks.js";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";
import { seedVideoApi } from "./video-helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
  await seedVideoApi(api);
});
afterEach(() => api.close());

const span = (text: string, a = "w_000001", b = "w_000002") => ({ op: "replace_span", start_word_id: a, end_word_id: b, text });

it("GET /transcripts/:id — текущая ревизия; ?revision=; 404 на нет", async () => {
  const r = await api.inj("GET", "/api/transcripts/trn_1", getHeaders);
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ id: "trn_1", current_revision: 1, doc: { revision: 1, author: "asr" } });
  expect(r.json().doc.words).toHaveLength(5);
  expect((await api.inj("GET", "/api/transcripts/trn_1?revision=1", getHeaders)).statusCode).toBe(200);
  expect((await api.inj("GET", "/api/transcripts/trn_1?revision=7", getHeaders)).statusCode).toBe(404);
  expect((await api.inj("GET", "/api/transcripts/trn_1?revision=abc", getHeaders)).statusCode).toBe(400);
  expect((await api.inj("GET", "/api/transcripts/nope", getHeaders)).json().error).toBe("transcript_not_found");
});

it("правка → 201 r2, r1 доступна; конфликт базы → 409 revision_conflict; холостая → 422 no_change", async () => {
  const a = await api.inj("POST", "/api/transcripts/trn_1/revisions", okHeaders, { base_revision: 1, ops: [span("Привет большой мир")] });
  expect(a.statusCode, a.body).toBe(201);
  expect(a.json()).toMatchObject({ id: "trn_1", current_revision: 2, doc: { revision: 2, parent_revision: 1, author: "user" } });
  expect(a.json().doc.words.map((x: { text: string }) => x.text).slice(0, 3)).toEqual(["Привет", "большой", "мир"]);
  const r1 = await api.inj("GET", "/api/transcripts/trn_1?revision=1", getHeaders);
  expect(r1.json().doc.words.map((x: { text: string }) => x.text).slice(0, 2)).toEqual(["Привет", "мир"]);
  const list = await api.inj("GET", "/api/transcripts/trn_1/revisions", getHeaders);
  expect(list.json().map((x: { revision: number; author: string }) => [x.revision, x.author])).toEqual([[1, "asr"], [2, "user"]]);

  const stale = await api.inj("POST", "/api/transcripts/trn_1/revisions", okHeaders, { base_revision: 1, ops: [span("Привет")] });
  expect(stale.statusCode).toBe(409);
  expect(stale.json()).toMatchObject({ error: "revision_conflict", base: 1, current: 2 });
  const same = await api.inj("POST", "/api/transcripts/trn_1/revisions", okHeaders, { base_revision: 2, ops: [span("Привет большой мир", "w_000001", "w_000002")] });
  expect(same.statusCode).toBe(422);
  expect(same.json().error).toBe("no_change");
  expect((await api.inj("POST", "/api/transcripts/trn_1/revisions", okHeaders, { base_revision: 2, ops: [span("x", "w_000099", "w_000099")] })).json().error).toBe("unknown_word");
  expect((await api.inj("POST", "/api/transcripts/trn_1/revisions", okHeaders, { base_revision: 0, ops: [span("x")] })).statusCode).toBe(400);
});

it("замок транскрипта у задачи → 409 resource_busy, ревизии нет", async () => {
  const job = jobs.insert(api.core.db, { id: "job_asr", type: "asr.transcribe", project_id: "p1", scene_id: null, input: {}, status: "running", attempt: 1 });
  expect(resourceLocks.acquire(api.core.db, projectLockKey("p1", "transcript"), job.id)).toBe(true);
  const r = await api.inj("POST", "/api/transcripts/trn_1/revisions", okHeaders, { base_revision: 1, ops: [span("Привет большой мир")] });
  expect(r.statusCode).toBe(409);
  expect(r.json().error).toBe("resource_busy");
  expect((await api.inj("GET", "/api/transcripts/trn_1", getHeaders)).json().current_revision).toBe(1);
});

it("лимиты: > 1000 операций → 422 too_many_ops; тело > 1 МБ → 413 до разбора", async () => {
  const many = Array.from({ length: 1001 }, () => ({ op: "replace_text", word_id: "w_000001", text: "Привет" }));
  const r = await api.inj("POST", "/api/transcripts/trn_1/revisions", okHeaders, { base_revision: 1, ops: many });
  expect(r.statusCode).toBe(422);
  expect(r.json().error).toBe("too_many_ops");
  const big = await api.inj("POST", "/api/transcripts/trn_1/revisions", okHeaders, { base_revision: 1, ops: [span("а".repeat(1_100_000))] });
  expect(big.statusCode).toBe(413);
  expect((await api.inj("GET", "/api/transcripts/trn_1", getHeaders)).json().current_revision).toBe(1);
});
