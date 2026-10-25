// Control API управления проектами и восстановления (Task 47) на настоящем bootCore в tmp-хранилище:
// переименование, архив, удаление в два шага (409 project_busy, 400 confirm_mismatch, 409
// intent_expired), корзина, очистка задачей по второму подтверждению, центр восстановления.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultSettings } from "@ms/contracts";
import { afterEach, beforeEach, expect, it } from "vitest";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { enqueue } from "../../src/jobs/queue.js";
import { type Api, makeApi, okHeaders } from "./helpers.js";

let api: Api;
beforeEach(async () => {
  api = await makeApi();
  projects.create(api.core.db, { id: "p1", title: "Мой ролик", kind: "script" });
  scenes.create(api.core.db, { id: "scn_p1", project_id: "p1", title: "x" });
  mkdirSync(join(api.core.root, "workspace/projects/p1/packages/pkg_1"), { recursive: true });
  writeFileSync(join(api.core.root, "workspace/projects/p1/packages/pkg_1/01.mp4"), "x".repeat(10));
});
afterEach(async () => api.close());

const json = (r: { body: string }) => JSON.parse(r.body) as Record<string, unknown>;
const ids = async (q = "") => (json(await api.inj("GET", `/api/projects${q}`)) as unknown as { id: string }[]).map((p) => p.id);

it("PATCH: переименование; пустое — 400 invalid_title", async () => {
  const r = await api.inj("PATCH", "/api/projects/p1", okHeaders, { title: "  Новое  " });
  expect(r.statusCode).toBe(200);
  expect(json(r).title).toBe("Новое");
  const bad = await api.inj("PATCH", "/api/projects/p1", okHeaders, { title: " " });
  expect(bad.statusCode).toBe(400);
  expect(json(bad).error).toBe("invalid_title");
});

it("архив: скрыт из списка, виден в view=archived; задача — 409 project_archived; Playground — 409", async () => {
  expect((await api.inj("POST", "/api/projects/p1/archive")).statusCode).toBe(200);
  expect(await ids()).not.toContain("p1");
  expect(await ids("?view=archived")).toEqual(["p1"]);
  const r = await api.inj("POST", "/api/projects/p1/scenes", { ...okHeaders, "idempotency-key": "k1" }, { prompt: "рост", settings: defaultSettings() });
  expect(r.statusCode).toBe(409);
  expect(json(r).error).toBe("project_archived");
  expect((await api.inj("POST", "/api/projects/p1/unarchive")).statusCode).toBe(200);
  expect(await ids()).toContain("p1");
  expect(json(await api.inj("POST", "/api/projects/playground/archive")).error).toBe("project_protected");
});

it("удаление: сводка → 409 busy → 400 mismatch → корзина → восстановление; GET удалённого — 404", async () => {
  const job = enqueue(api.core.db, { type: "playground.generate", projectId: "p1", sceneId: "scn_p1", input: { a: 1 }, idempotencyKey: "gen" }).job;
  const intent = json(await api.inj("POST", "/api/projects/p1/delete-intent"));
  expect(intent).toMatchObject({ project_id: "p1", title: "Мой ролик", scenes: 1, packages: 1, files: 1, active_jobs: 1, active_job_ids: [job.id] });
  const busy = await api.inj("DELETE", "/api/projects/p1", okHeaders, { token: intent.token, confirm_title: "Мой ролик" });
  expect(busy.statusCode).toBe(409);
  expect(json(busy)).toMatchObject({ error: "project_busy", job_ids: [job.id] });
  expect((await api.inj("POST", `/api/jobs/${job.id}/cancel`)).statusCode).toBe(200);
  const tok = json(await api.inj("POST", "/api/projects/p1/delete-intent")).token;
  const mismatch = await api.inj("DELETE", "/api/projects/p1", okHeaders, { token: tok, confirm_title: "другое" });
  expect(mismatch.statusCode).toBe(400);
  expect(json(mismatch).error).toBe("confirm_mismatch");
  const stale = await api.inj("DELETE", "/api/projects/p1", okHeaders, { token: "1.".padEnd(66, "0"), confirm_title: "Мой ролик" });
  expect(json(stale).error).toBe("intent_expired");
  const del = await api.inj("DELETE", "/api/projects/p1", okHeaders, { token: tok, confirm_title: "Мой ролик" });
  expect(del.statusCode).toBe(200);
  const trashId = json(del).trash_id as string;
  expect(existsSync(join(api.core.root, "workspace/projects/p1"))).toBe(false);
  expect((await api.inj("GET", "/api/projects/p1")).statusCode).toBe(404);
  expect(await ids()).not.toContain("p1");
  const trash = json(await api.inj("GET", "/api/trash")) as unknown as { id: string; title: string }[];
  expect(trash).toMatchObject([{ id: trashId, title: "Мой ролик", project_id: "p1" }]);
  const restored = await api.inj("POST", `/api/trash/${trashId}/restore`);
  expect(restored.statusCode).toBe(200);
  expect(json(restored).id).toBe("p1");
  expect(existsSync(join(api.core.root, "workspace/projects/p1/packages/pkg_1/01.mp4"))).toBe(true);
  expect((await api.inj("GET", "/api/projects/p1")).statusCode).toBe(200);
});

it("очистка корзины: без второго подтверждения — 409; с токеном — задача trash.purge (202), повтор ключа — 200", async () => {
  const tok = json(await api.inj("POST", "/api/projects/p1/delete-intent")).token;
  const trashId = json(await api.inj("DELETE", "/api/projects/p1", okHeaders, { token: tok, confirm_title: "Мой ролик" })).trash_id as string;
  const h = { ...okHeaders, "idempotency-key": "purge-1" };
  const noTok = await api.inj("POST", "/api/trash/purge", h, { trash_ids: [trashId], token: "1.".padEnd(66, "0") });
  expect(noTok.statusCode).toBe(409);
  expect(json(noTok).error).toBe("intent_expired");
  const pi = json(await api.inj("POST", "/api/trash/purge-intent", okHeaders, { trash_ids: [trashId] }));
  expect(pi).toMatchObject({ count: 1, files: 1 });
  expect((await api.inj("POST", "/api/trash/purge", okHeaders, { trash_ids: [trashId], token: pi.token })).statusCode).toBe(400); // нужен Idempotency-Key
  const r = await api.inj("POST", "/api/trash/purge", h, { trash_ids: [trashId], token: pi.token });
  expect(r.statusCode).toBe(202);
  expect(json(r).job).toMatchObject({ type: "trash.purge", project_id: "playground", status: "pending" });
  expect((await api.inj("POST", "/api/trash/purge", h, { trash_ids: [trashId], token: pi.token })).statusCode).toBe(200);
  // задача в очереди (обработчиков в тесте нет) — каталог на месте
  expect(existsSync(join(api.core.root, "workspace/trash"))).toBe(true);
});

it("центр восстановления: отчёт старта, карантин, ack; удаление черновика — по токену", async () => {
  const draft = join(api.core.root, "workspace/drafts/job_x-a1");
  mkdirSync(draft, { recursive: true });
  writeFileSync(join(draft, ".quarantined"), JSON.stringify({ reason: "export: сбой", at: "2026-10-25T10:00:00.000Z" }));
  const r = json(await api.inj("GET", "/api/recovery"));
  expect(r.boot).toMatchObject({ crashed: false, acknowledged_at: null, summary: { recovered: 0, blocked: 0, quarantined: 0, failed: 0 } });
  expect(r.quarantined).toMatchObject([{ rel_path: "workspace/drafts/job_x-a1", reason: "export: сбой", job_id: null, attempt: 1 }]);
  const ack = json(await api.inj("POST", `/api/recovery/${(r.boot as { id: string }).id}/ack`));
  expect((ack.boot as { acknowledged_at: string | null }).acknowledged_at).not.toBeNull();
  expect(json(await api.inj("POST", "/api/recovery/quarantine/discard", okHeaders, { dir: "workspace/drafts/job_x-a1", token: "1.".padEnd(66, "0") })).error).toBe("intent_expired");
  const it1 = json(await api.inj("POST", "/api/recovery/quarantine/intent", okHeaders, { dir: "workspace/drafts/job_x-a1" }));
  const d = await api.inj("POST", "/api/recovery/quarantine/discard", okHeaders, { dir: "workspace/drafts/job_x-a1", token: it1.token });
  expect(d.statusCode).toBe(200);
  expect(existsSync(draft)).toBe(false);
  expect((await api.inj("POST", "/api/recovery/quarantine/intent", okHeaders, { dir: "../etc" })).statusCode).toBe(404);
});
