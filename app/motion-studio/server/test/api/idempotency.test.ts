// Idempotency-Key на POST, создающих задачи (M15): нет ключа → 400; повтор с тем же входом →
// 200 с той же сценой/сообщением и задачей без новых строк; другой вход → 422.
import { afterEach, beforeEach, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import * as chat from "../../src/db/repos/chat.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { type Api, makeApi, okHeaders, seedVersion } from "./helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
});
afterEach(() => api.close());

const key = (k: string) => ({ ...okHeaders, "idempotency-key": k });

it("POST /projects/:id/scenes: 400 без ключа, 202 → 200 на повтор, 422 на другой вход; вторая сцена не создана", async () => {
  const p = (await api.inj("POST", "/api/projects", okHeaders, { title: "Тест" })).json().id as string;
  const body = { prompt: "Рост выручки", settings: defaultSettings() };
  const none = await api.inj("POST", `/api/projects/${p}/scenes`, okHeaders, body);
  expect(none.statusCode).toBe(400);
  expect(none.json()).toMatchObject({ error: "idempotency_key_required" });
  const a = await api.inj("POST", `/api/projects/${p}/scenes`, key("k1"), body);
  const b = await api.inj("POST", `/api/projects/${p}/scenes`, key("k1"), body);
  expect([a.statusCode, b.statusCode]).toEqual([202, 200]);
  expect(b.json().job.id).toBe(a.json().job.id);
  expect(b.json().scene.id).toBe(a.json().scene.id);
  expect(scenes.listByProject(api.core.db, p)).toHaveLength(1);
  expect(a.json().job).toMatchObject({ type: "playground.generate", status: "pending", project_id: p, scene_id: a.json().scene.id });
  expect(a.json().job.input).toEqual({ sceneId: a.json().scene.id, prompt: body.prompt, settings: body.settings });
  const c = await api.inj("POST", `/api/projects/${p}/scenes`, key("k1"), { ...body, prompt: "другое" });
  expect(c.statusCode).toBe(422);
  expect(c.json()).toMatchObject({ error: "idempotency_key_reused" });
  // тот же ключ в другом маршруте — тоже 422
  const s = a.json().scene.id as string;
  expect((await api.inj("POST", `/api/scenes/${s}/messages`, key("k1"), { text: "x" })).statusCode).toBe(422);
  expect(scenes.listByProject(api.core.db, p)).toHaveLength(1);
  expect(jobs.list(api.core.db)).toHaveLength(1);
});

it("POST /scenes/:id/messages: повтор не создаёт второе сообщение и задачу; другой текст → 422", async () => {
  const { scene, versionId } = await seedVersion(api);
  expect((await api.inj("POST", `/api/scenes/${scene.id}/messages`, okHeaders, { text: "медленнее" })).statusCode).toBe(400);
  const a = await api.inj("POST", `/api/scenes/${scene.id}/messages`, key("m1"), { text: "медленнее", baseVersionId: versionId });
  const b = await api.inj("POST", `/api/scenes/${scene.id}/messages`, key("m1"), { text: "медленнее", baseVersionId: versionId });
  expect([a.statusCode, b.statusCode]).toEqual([202, 200]);
  expect(b.json().message.id).toBe(a.json().message.id);
  expect(b.json().job.id).toBe(a.json().job.id);
  expect(a.json().message).toMatchObject({ role: "user", text: "медленнее", scene_id: scene.id });
  expect(a.json().job).toMatchObject({ type: "playground.edit", scene_id: scene.id });
  expect(a.json().job.input).toMatchObject({ sceneId: scene.id, messageId: a.json().message.id, baseVersionId: versionId });
  expect(chat.list(api.core.db, scene.id)).toHaveLength(1);
  expect((await api.inj("POST", `/api/scenes/${scene.id}/messages`, key("m1"), { text: "быстрее" })).statusCode).toBe(422);
  expect(chat.list(api.core.db, scene.id)).toHaveLength(1);
});

it("restore, render и exports тоже требуют ключ и повторяются идемпотентно", async () => {
  const { scene, versionId } = await seedVersion(api);
  const cases: [string, unknown, unknown][] = [
    [`/api/scenes/${scene.id}/restore`, { versionId }, { versionId: "ver_other" }],
    [`/api/scenes/${scene.id}/render`, { settings_patch: { duration_frames: 240 } }, { settings_patch: { duration_frames: 300 } }],
    [`/api/versions/${versionId}/exports`, { format: "mp4" }, { format: "mp4", crf: 20 }],
  ];
  for (const [url, body, other] of cases) {
    expect((await api.inj("POST", url, okHeaders, body)).statusCode, url).toBe(400);
    const a = await api.inj("POST", url, key(`k-${url}`), body);
    const b = await api.inj("POST", url, key(`k-${url}`), body);
    expect([a.statusCode, b.statusCode], url).toEqual([202, 200]);
    expect(b.json().job.id).toBe(a.json().job.id);
    expect((await api.inj("POST", url, key(`k-${url}`), other)).statusCode, url).toBe(422);
  }
  expect(jobs.list(api.core.db).filter((j) => j.status === "pending")).toHaveLength(3);
});
