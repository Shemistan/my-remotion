// Сцены: карточка с историей версий и активной задачей, чат, кнопка Render (план без Edit
// Planner: param для длительности/стиля, spec для размера/fps/аспекта, H8), восстановление.
import { afterEach, beforeEach, expect, it } from "vitest";
import { HistoryEntrySchema, type QAReport, defaultSettings } from "@ms/contracts";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { type Api, getHeaders, makeApi, okHeaders, seedVersion } from "./helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(() => api.close());

let n = 0;
const key = () => ({ ...okHeaders, "idempotency-key": `k${++n}` });

const qa = (): QAReport => ({
  gate: { technical: "pass", visual: "warn", semantic: "pass", style: "pass" },
  issues: [{ source: "agent", code: "accent_static", severity: "warning", frame: 90, description: "финал застыл", fix_hint: "добавить движение" }],
  checked_frames: [0, 90],
  ocr: [],
  scores: { overall: 5.5, hierarchy: 6, composition: 4, entrance: 7, choreography: 5, hold: 3, legibility: 8, meaning: 9 },
  score_notes: [{ axis: "hold", frame: 90, note: "финал неподвижен" }],
  automated: true,
});

it("GET /scenes/:id: сцена, версии HistoryEntry[], активная задача; 404 для чужого id", async () => {
  const { scene, versionId } = await seedVersion(api);
  const before = (await api.inj("GET", `/api/scenes/${scene.id}`, getHeaders)).json();
  expect(before.scene).toMatchObject({ id: scene.id, current_version_id: versionId });
  expect(before.versions).toHaveLength(1);
  expect(HistoryEntrySchema.parse(before.versions[0])).toMatchObject({ version_id: versionId, number: 1 });
  expect(before.active_job).toBeNull();
  const job = (await api.inj("POST", `/api/scenes/${scene.id}/messages`, key(), { text: "медленнее" })).json().job;
  const after = (await api.inj("GET", `/api/scenes/${scene.id}`, getHeaders)).json();
  expect(after.active_job).toMatchObject({ id: job.id, status: "pending" });
  const msgs = (await api.inj("GET", `/api/scenes/${scene.id}/messages`, getHeaders)).json();
  expect(msgs.map((m: { text: string }) => m.text)).toEqual(["медленнее"]);
  expect((await api.inj("GET", "/api/scenes/scn_nope", getHeaders)).statusCode).toBe(404);
  expect((await api.inj("GET", "/api/scenes/scn_nope/messages", getHeaders)).statusCode).toBe(404);
});

it("POST /scenes/:id/render: длительность → playground.edit, plan.path param; fps → spec", async () => {
  const { scene, versionId } = await seedVersion(api);
  const a = await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: { duration_frames: 240 } });
  expect(a.statusCode).toBe(202);
  expect(a.json().job).toMatchObject({ type: "playground.edit", scene_id: scene.id });
  expect(a.json().job.input).toMatchObject({ sceneId: scene.id, settings_patch: { duration_frames: 240 }, plan: { path: "param", base_version_id: versionId } });
  const b = await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: { fps: { num: 60, den: 1 } } });
  expect(b.json().job.input.plan.path).toBe("spec");
  for (const patch of [{ style_preset: "tech-neon" }, { animation_intensity: "calm" }]) {
    expect((await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: patch })).json().job.input.plan.path).toBe("param");
  }
  for (const patch of [{ width: 1280, height: 720 }, { aspect_ratio: "1:1", width: 1080, height: 1080 }]) {
    expect((await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: patch })).json().job.input.plan.path).toBe("spec");
  }
});

it("POST /scenes/:id/render: base_version_id — план от выбранной версии; чужая → 404, не ready → 409; без поля — от текущей", async () => {
  const { scene, versionId: v1 } = await seedVersion(api);
  const { versionId: v2 } = await seedVersion(api, { scene });
  expect((await api.inj("GET", `/api/scenes/${scene.id}`, getHeaders)).json().scene.current_version_id).toBe(v2);
  const fromV1 = await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: { duration_frames: 240 }, base_version_id: v1 });
  expect(fromV1.statusCode).toBe(202);
  expect(fromV1.json().job.input.plan).toMatchObject({ base_version_id: v1 });
  const def = await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: { duration_frames: 240 } });
  expect(def.json().job.input.plan).toMatchObject({ base_version_id: v2 });
  const other = await seedVersion(api);
  expect((await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: { duration_frames: 240 }, base_version_id: other.versionId })).statusCode).toBe(404);
  api.core.db.prepare("UPDATE scene_versions SET status = 'failed' WHERE id = ?").run(v1);
  const failed = await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: { duration_frames: 240 }, base_version_id: v1 });
  expect(failed.statusCode).toBe(409);
  expect(failed.json()).toMatchObject({ error: "version_not_ready" });
});

it("POST /scenes/:id/render: пустой патч → 400, итог не проходит SettingsSchema → 400, сцена без версии → 409", async () => {
  const { scene } = await seedVersion(api);
  expect((await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: {} })).statusCode).toBe(400);
  const bad = await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: { aspect_ratio: "9:16" } });
  expect(bad.statusCode).toBe(400);
  expect(JSON.stringify(bad.json())).toContain("aspect_ratio");
  const empty = api.core.repo.createScene("playground", { prompt: "пусто", settings: defaultSettings() });
  const r = await api.inj("POST", `/api/scenes/${empty.id}/render`, key(), { settings_patch: { duration_frames: 240 } });
  expect(r.statusCode).toBe(409);
  expect(r.json()).toMatchObject({ error: "no_current_version" });
});

it("POST /scenes/:id/render: сцена видеопроекта — FPS только проекта (иначе 409 fps_locked, задачи нет); тот же FPS и другие поля — можно", async () => {
  projects.create(api.core.db, { id: "vid", kind: "video", title: "Ролик" });
  const { scene } = await seedVersion(api, { projectId: "vid" });
  const before = jobs.list(api.core.db, { sceneId: scene.id }).length;
  const r = await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: { fps: { num: 60, den: 1 }, duration_frames: 360 } });
  expect(r.statusCode).toBe(409);
  expect(r.json()).toMatchObject({ error: "fps_locked" });
  expect(jobs.list(api.core.db, { sceneId: scene.id })).toHaveLength(before);
  const same = await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: { fps: defaultSettings().fps, style_preset: "tech-neon" } });
  expect(same.statusCode).toBe(202);
  expect((await api.inj("POST", `/api/scenes/${scene.id}/render`, key(), { settings_patch: { style_preset: "light-clean" } })).statusCode).toBe(202);
  // у сцены обычного проекта FPS по-прежнему меняется
  const plain = await seedVersion(api);
  expect((await api.inj("POST", `/api/scenes/${plain.scene.id}/render`, key(), { settings_patch: { fps: { num: 60, den: 1 } } })).statusCode).toBe(202);
});

it("POST /scenes/:id/improve: 202 playground.edit с QA-планом; повтор по ключу → 200 та же задача", async () => {
  const { scene, versionId } = await seedVersion(api, { qa: qa() });
  const headers = { ...okHeaders, "idempotency-key": "improve-same" };
  const a = await api.inj("POST", `/api/scenes/${scene.id}/improve`, headers, {});
  expect(a.statusCode).toBe(202);
  expect(a.json().job).toMatchObject({ type: "playground.edit", scene_id: scene.id });
  expect(a.json().job.input).toMatchObject({ sceneId: scene.id, plan: { base_version_id: versionId, path: "code", preserve: ["timing"] } });
  expect(a.json().job.input.plan.changes.slice(0, 3).map((x: { target: string }) => x.target)).toEqual(["hold", "composition", "choreography"]);
  const b = await api.inj("POST", `/api/scenes/${scene.id}/improve`, headers, {});
  expect(b.statusCode).toBe(200);
  expect(b.json().job.id).toBe(a.json().job.id);
});

it("POST /scenes/:id/improve: без оценки → 409 no_scores; не ready → 409 version_not_ready", async () => {
  const noQa = await seedVersion(api);
  const absent = await api.inj("POST", `/api/scenes/${noQa.scene.id}/improve`, key(), {});
  expect(absent.statusCode).toBe(409);
  expect(absent.json()).toMatchObject({ error: "no_scores" });

  const failed = await seedVersion(api, { qa: qa() });
  api.core.db.prepare("UPDATE scene_versions SET status = 'failed' WHERE id = ?").run(failed.versionId);
  const r = await api.inj("POST", `/api/scenes/${failed.scene.id}/improve`, key(), { base_version_id: failed.versionId });
  expect(r.statusCode).toBe(409);
  expect(r.json()).toMatchObject({ error: "version_not_ready" });
});

it("POST /scenes/:id/restore и messages: версия чужой сцены → 404; POST scenes в несуществующий проект → 404", async () => {
  const one = await seedVersion(api);
  const two = await seedVersion(api);
  const r = await api.inj("POST", `/api/scenes/${one.scene.id}/restore`, key(), { versionId: two.versionId });
  expect(r.statusCode).toBe(404);
  const ok = await api.inj("POST", `/api/scenes/${one.scene.id}/restore`, key(), { versionId: one.versionId });
  expect(ok.statusCode).toBe(202);
  expect(ok.json().job).toMatchObject({ type: "scene.restore", input: { sceneId: one.scene.id, versionId: one.versionId } });
  expect((await api.inj("POST", `/api/scenes/${one.scene.id}/messages`, key(), { text: "x", baseVersionId: two.versionId })).statusCode).toBe(404);
  expect((await api.inj("POST", "/api/projects/prj_nope/scenes", key(), { prompt: "p", settings: defaultSettings() })).statusCode).toBe(404);
});
