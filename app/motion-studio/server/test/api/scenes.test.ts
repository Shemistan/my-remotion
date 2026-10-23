// Сцены: карточка с историей версий и активной задачей, чат, кнопка Render (план без Edit
// Planner: param для длительности/стиля, spec для размера/fps/аспекта, H8), восстановление.
import { afterEach, beforeEach, expect, it } from "vitest";
import { HistoryEntrySchema, defaultSettings } from "@ms/contracts";
import { type Api, getHeaders, makeApi, okHeaders, seedVersion } from "./helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(() => api.close());

let n = 0;
const key = () => ({ ...okHeaders, "idempotency-key": `k${++n}` });

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
