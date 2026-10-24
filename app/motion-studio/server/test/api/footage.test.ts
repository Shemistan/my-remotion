// Анализ видеоряда через API (Task 33): запуск `footage.analyze` (без агента — только детектор),
// документ анализа и ключевые кадры — только опубликованные и только по списку кадров анализа.
import { afterEach, beforeEach, expect, it } from "vitest";
import * as jobsRepo from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";
import { PNG, seedFootageWithFrame } from "./plan-api-helpers.js";
import { k, seedVideoApi } from "./video-helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
  await seedVideoApi(api);
});
afterEach(() => api.close());

it("POST footage/analyze: 202 с исходником проекта и useAgent; повтор ключа — та же задача; без исходника — 409", async () => {
  const r = await api.inj("POST", "/api/projects/p1/footage/analyze", { ...okHeaders, ...k("ftg-1") }, { useAgent: false });
  expect(r.statusCode, r.body).toBe(202);
  const job = jobsRepo.get(api.core.db, r.json().job.id)!;
  expect(job).toMatchObject({ type: "footage.analyze", project_id: "p1", input: { projectId: "p1", mediaId: "med_1", useAgent: false } });
  const again = await api.inj("POST", "/api/projects/p1/footage/analyze", { ...okHeaders, ...k("ftg-1") }, { useAgent: false });
  expect(again.statusCode).toBe(200);
  expect(again.json().job.id).toBe(job.id);
  expect((await api.inj("POST", "/api/projects/p1/footage/analyze", okHeaders, {})).json().error).toBe("idempotency_key_required");

  projects.create(api.core.db, { id: "p2", kind: "video", title: "Пусто" });
  const none = await api.inj("POST", "/api/projects/p2/footage/analyze", { ...okHeaders, ...k("ftg-2") }, {});
  expect(none.statusCode).toBe(409);
  expect(none.json().error).toBe("no_media");
  expect((await api.inj("POST", "/api/projects/nope/footage/analyze", { ...okHeaders, ...k("ftg-3") }, {})).statusCode).toBe(404);
});

it("GET footage/:id — анализ; кадры — только ключевые кадры анализа, обход пути — 404", async () => {
  const doc = await seedFootageWithFrame(api);
  const g = await api.inj("GET", "/api/footage/ftg_k1", getHeaders);
  expect(g.statusCode, g.body).toBe(200);
  expect(g.json()).toEqual({ media_id: "med_1", analysis: doc });
  expect((await api.inj("GET", "/api/footage/ftg_none", getHeaders)).statusCode).toBe(404);

  const f = await api.inj("GET", "/api/footage/ftg_k1/frames/500000.png", getHeaders);
  expect(f.statusCode).toBe(200);
  expect(f.headers["content-type"]).toContain("image/png");
  expect(Buffer.from(f.rawPayload).equals(PNG)).toBe(true);
  // кадра нет в анализе, имя не по форме, обход пути
  for (const bad of ["123.png", "500000.jpg", "-1.png", "..%2F..%2Fstudio.db.png", "..%2Ffootage.json"]) {
    const r = await api.inj("GET", `/api/footage/ftg_k1/frames/${bad}`, getHeaders);
    expect(r.statusCode, bad).toBe(404);
    expect(r.body).not.toContain(api.core.root);
  }
});

it("сводка видеопроекта: последний анализ видеоряда и его режим", async () => {
  expect((await api.inj("GET", "/api/projects/p1/video", getHeaders)).json()).toMatchObject({ footage: null, semantic: null, plan: null, style: null });
  await seedFootageWithFrame(api, "ftg_k1", "llm_only");
  expect((await api.inj("GET", "/api/projects/p1/video", getHeaders)).json().footage).toEqual({ id: "ftg_k1", mode: "llm_only" });
});
