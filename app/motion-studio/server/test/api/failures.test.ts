// Сбои и запуск (ревью Task 20): 500 без сырых сообщений и путей (F6), откат создания сцены
// не оставляет каталог (F11), задачи в очереди на момент старта видны в /health (F9).
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import * as scenes from "../../src/db/repos/scenes.js";
import { enqueue } from "../../src/jobs/queue.js";
import { toApiResponse } from "../../src/api/errors.js";
import { EditError } from "../../src/edit/errors.js";
import { memoOnSuccess } from "../../src/api/memo.js";
import { type Api, getHeaders, makeApi, okHeaders } from "./helpers.js";

let api: Api | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

it("toApiResponse: неизвестная ошибка → 500 internal с общим текстом, без сообщения и путей", () => {
  const r = toApiResponse(new Error("ENOENT: no such file, rename '/Volumes/External SSD/MotionStudio/config.json.tmp'"));
  expect(r.status).toBe(500);
  expect(r.body.error).toBe("internal");
  expect(JSON.stringify(r.body)).not.toContain("/Volumes");
  expect(JSON.stringify(r.body)).not.toContain("ENOENT");
  const q = toApiResponse(Object.assign(new Error("SQLITE_IOERR: disk I/O error at /Users/x/studio.db"), { code: "SQLITE_IOERR" }));
  expect(JSON.stringify(q.body)).not.toContain("/Users");
});

it("toApiResponse: details EditError не перезаписывают error и message (ревью Task 33 #7)", () => {
  const r = toApiResponse(new EditError("blocking_issues", "2 проблемы", { error: "x", message: "y", issues: [1] }));
  expect(r).toEqual({ status: 409, body: { error: "blocking_issues", message: "blocking_issues: 2 проблемы", issues: [1] } });
});

it("memoOnSuccess: отказ не кэшируется (F7), успех — кэшируется", async () => {
  let n = 0;
  const f = memoOnSuccess(async () => {
    n += 1;
    if (n === 1) throw new Error("lockfile временно не читается");
    return `sha${n}`;
  });
  await expect(f()).rejects.toThrow("lockfile");
  expect(await f()).toBe("sha2");
  expect(await f()).toBe("sha2");
  expect(n).toBe(2);
});

it("сбой enqueue при создании сцены: 500 без сырого сообщения, каталога сцены и строки нет", async () => {
  api = await makeApi();
  const p = (await api.inj("POST", "/api/projects", okHeaders, { title: "Тест" })).json().id as string;
  api.core.db.exec("CREATE TRIGGER boom BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT, 'boom-secret'); END;");
  const r = await api.inj("POST", `/api/projects/${p}/scenes`, { ...okHeaders, "idempotency-key": "k1" }, { prompt: "x", settings: defaultSettings() });
  expect(r.statusCode).toBe(500);
  expect(r.json()).toMatchObject({ error: "internal" });
  expect(r.body).not.toContain("boom-secret");
  expect(scenes.listByProject(api.core.db, p)).toEqual([]);
  const dir = join(api.s.root, "workspace/projects", p, "scenes");
  expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
});

it("GET /health: задачи pending/running на момент старта (сервер возобновит их сам)", async () => {
  const first = await makeApi();
  expect((await first.inj("GET", "/api/health", getHeaders)).json().queued_at_start).toEqual({ pending: 0, running: 0 });
  const scene = first.core.repo.createScene("playground", { prompt: "a", settings: defaultSettings() });
  for (const k of ["a", "b"]) enqueue(first.core.db, { type: "playground.generate", projectId: "playground", sceneId: scene.id, input: { k }, idempotencyKey: k });
  await first.app.close();
  await first.core.close();
  api = await makeApi({ store: first.s });
  expect(api.core.boot.queued).toMatchObject({ pending: 2, running: 0 });
  expect(api.core.boot.queued.jobs).toHaveLength(2);
  expect((await api.inj("GET", "/api/health", getHeaders)).json().queued_at_start).toEqual({ pending: 2, running: 0 });
});
