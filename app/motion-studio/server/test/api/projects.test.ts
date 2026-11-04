// Проекты: список (без служебных bench-проектов), создание, карточка со сценами и экспортами.
import { afterEach, beforeEach, expect, it } from "vitest";
import { ProjectDtoSchema, defaultSettings } from "@ms/contracts";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { type Api, getHeaders, makeApi, okHeaders, seedVersion } from "./helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(() => api.close());

it("POST /projects → 201 ProjectDto; невалидное тело → 400 с путём поля", async () => {
  const r = await api.inj("POST", "/api/projects", okHeaders, { title: "Ролик", settings: defaultSettings() });
  expect(r.statusCode).toBe(201);
  expect(ProjectDtoSchema.parse(r.json())).toMatchObject({ title: "Ролик", settings: defaultSettings() });
  const bad = await api.inj("POST", "/api/projects", okHeaders, { title: "" });
  expect(bad.statusCode).toBe(400);
  expect(bad.json()).toMatchObject({ error: "validation" });
  expect(JSON.stringify(bad.json().issues)).toContain("title");
  const extra = await api.inj("POST", "/api/projects", okHeaders, { title: "x", nope: 1 });
  expect(extra.statusCode).toBe(400);
});

it("GET /projects: playground первым, bench-проекты скрыты; includeBench=1 — все", async () => {
  projects.create(api.core.db, { id: "bench-s5-abc", title: "bench" });
  projects.create(api.core.db, { id: "eval-s3-abc", title: "old bench" });
  await api.inj("POST", "/api/projects", okHeaders, { title: "Мой" });
  const ids = (await api.inj("GET", "/api/projects", getHeaders)).json().map((p: { id: string }) => p.id);
  expect(ids[0]).toBe("playground");
  expect(ids).toHaveLength(2);
  expect(ids.some((i: string) => i.startsWith("bench-") || i.startsWith("eval-"))).toBe(false);
  const all = (await api.inj("GET", "/api/projects?includeBench=1", getHeaders)).json();
  expect(all).toHaveLength(4);
});

it("GET /projects/:id: сцены с текущими версиями и последние экспорты; нет проекта → 404", async () => {
  const { projectId, scene, versionId } = await seedVersion(api);
  exportsRepo.insert(api.core.db, { version_id: versionId, format: "mp4", path: "workspace/projects/playground/exports/exp_1/scene.mp4", sha256: "a".repeat(64) });
  const r = await api.inj("GET", `/api/projects/${projectId}`, getHeaders);
  expect(r.statusCode).toBe(200);
  const body = r.json();
  expect(body.project.id).toBe(projectId);
  expect(body.scenes).toHaveLength(1);
  expect(body.scenes[0]).toMatchObject({
    id: scene.id,
    excerpt: "Рост выручки",
    current_version_id: versionId,
    current_version: { version_id: versionId, number: 1, status: "ready" },
    last_job: { status: "completed" },
  });
  expect(body.exports).toHaveLength(1);
  expect(body.exports[0]).toMatchObject({ version_id: versionId, format: "mp4", scene_id: scene.id });
  expect(body.scenes[0].latest_version).toMatchObject({ version_id: versionId, number: 1 });
  const missing = await api.inj("GET", "/api/projects/prj_nope", getHeaders);
  expect(missing.statusCode).toBe(404);
  expect(missing.json()).toMatchObject({ error: "not_found" });
});

it("GET /projects/:id: excerpt без общего длинного префикса и последняя задача сцены", async () => {
  projects.create(api.core.db, { id: "p_excerpt", title: "Пакет" });
  const common = "Общий визуальный стиль: тёмный фон и белый текст. ";
  const first = api.core.repo.createScene("p_excerpt", { prompt: `${common}Показать рост выручки по месяцам`, settings: defaultSettings() });
  const second = api.core.repo.createScene("p_excerpt", { prompt: `${common}Сравнить расходы двух отделов`, settings: defaultSettings() });
  jobs.insert(api.core.db, {
    id: "job_excerpt_failed",
    type: "playground.generate",
    project_id: "p_excerpt",
    scene_id: first.id,
    input: {},
    status: "failed",
    stage: "engineer",
    error: { code: "pipeline", stage: "engineer", message: "лимит" },
  });
  const body = (await api.inj("GET", "/api/projects/p_excerpt", getHeaders)).json();
  expect(body.scenes.map((s: { excerpt: string | null }) => s.excerpt)).toEqual([
    "Показать рост выручки по месяцам",
    "Сравнить расходы двух отделов",
  ]);
  expect(body.scenes[0].last_job).toEqual({
    id: "job_excerpt_failed",
    status: "failed",
    stage: "engineer",
    error: { code: "pipeline", stage: "engineer", message: "лимит" },
  });
  expect(body.scenes[1].last_job).toBeNull();
  expect(second.id).toBeTruthy();
});

it("POST /projects/:id/scenes принимает заданное название", async () => {
  const r = await api.inj("POST", "/api/projects/playground/scenes", { ...okHeaders, "idempotency-key": "title-1" }, {
    prompt: "Длинный промпт для сцены",
    title: "Короткое название",
    settings: defaultSettings(),
  });
  expect(r.statusCode).toBe(202);
  expect(r.json().scene.title).toBe("Короткое название");
});

it("GET /projects/:id: сцена только с failed-версией — current_version null, latest_version — она (Task 21)", async () => {
  const { core } = api;
  const { makeDraft, meta } = await import("../scenes/helpers.js");
  const jobs = await import("../../src/db/repos/jobs.js");
  projects.create(core.db, { id: "p_fail", title: "Падение" });
  const scene = core.repo.createScene("p_fail", { prompt: "висит", settings: defaultSettings() });
  jobs.insert(core.db, { id: "job_ff", type: "playground.generate", project_id: "p_fail", scene_id: scene.id, input: {}, status: "completed", attempt: 1 });
  const draft = await makeDraft(core.root, { runId: "job_ff", attempt: 1, sceneId: scene.id, projectId: "p_fail" });
  const v = await core.repo.publish(draft, meta(scene.id, { status: "failed" }), { jobId: "job_ff", attempt: 1 });
  const body = (await api.inj("GET", "/api/projects/p_fail", getHeaders)).json();
  expect(body.scenes[0].current_version).toBeNull();
  expect(body.scenes[0].latest_version).toMatchObject({ version_id: v.versionId, number: 1, status: "failed" });
});
