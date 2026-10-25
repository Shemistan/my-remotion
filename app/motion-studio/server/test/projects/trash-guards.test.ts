// Предохранители корзины (Task 47, раунд исправлений 1): запись в удалённый проект не пересоздаёт
// его каталог (иначе восстановление навсегда `restore_conflict`), восстановление во время
// очистки — 409 `trash_purging`, `trash_purged` — только при фактической очистке, ручной повтор
// `trash.purge` — только после сбоя, токен удаления одноразовый, сверки при старте не путают
// пересозданный пустой каталог с восстановлением и экспорты проектов в корзине — с пропавшими.
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defaultSettings } from "@ms/contracts";
import type { ProcessRegistry } from "@ms/core";
import { afterEach, beforeEach, expect, it } from "vitest";
import { ArtifactStore } from "../../src/artifacts/store.js";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as trashRepo from "../../src/db/repos/trash.js";
import * as versions from "../../src/db/repos/versions.js";
import { enqueue } from "../../src/jobs/queue.js";
import { retryJob } from "../../src/jobs/retry.js";
import type { JobContext } from "../../src/jobs/types.js";
import type { Phase46Deps } from "../../src/pipeline/phase46-deps.js";
import { trashPurge } from "../../src/pipeline/trash-purge.js";
import { deleteIntent } from "../../src/projects/delete-intent.js";
import { archiveProject, lifecycleOf } from "../../src/projects/lifecycle.js";
import { deleteProject, listTrash, reconcileTrash, restoreFromTrash } from "../../src/projects/trash.js";
import { reconcileExports } from "../../src/scenes/reconcile-exports.js";
import { type Env, seedProject, setup, teardown } from "./helpers.js";

let env: Env;
beforeEach(async () => {
  env = await setup("ms-proj-guards-");
  seedProject(env, "p1", "Мой ролик", "script");
});
afterEach(async () => teardown(env));

const del = (id = "p1", title = "Мой ролик") => deleteProject(env.core, id, { token: deleteIntent(env.db, env.root, id).token, confirm_title: title });
const projectDir = (id = "p1") => join(env.root, "workspace/projects", id);
const destRel = (n = 1) => `workspace/projects/p1/script/scr_1/r${n}`;
const store = (guard = env.s.guard) => new ArtifactStore({ root: env.root, db: env.db, guard });

it("запись ревизии в удалённый проект — project_deleted, каталог проекта не пересоздан, восстановление работает", async () => {
  const { trashId } = del();
  await expect(store().writeRevision(destRel(), "script.json", { a: 1 }, () => undefined)).rejects.toMatchObject({ code: "project_deleted", status: 409 });
  expect(existsSync(projectDir())).toBe(false);
  restoreFromTrash(env.core, trashId);
  await store().writeRevision(destRel(), "script.json", { a: 1 }, () => undefined);
  expect(existsSync(join(env.root, destRel(), "script.json"))).toBe(true);
});

it("гонка: проект ушёл в корзину во время синхронной записи — запись отклонена в транзакции, пустой каталог не остаётся", async () => {
  let calls = 0;
  let trashId = "";
  const guard = async () => {
    calls += 1;
    if (calls === 3) trashId = del().trashId; // последняя проверка хранилища перед созданием родителей
    return env.s.guard();
  };
  await expect(store(guard).writeRevision(destRel(), "script.json", { a: 1 }, () => undefined)).rejects.toMatchObject({ code: "project_deleted" });
  expect(calls).toBeGreaterThanOrEqual(3);
  expect(trashId).not.toBe("");
  expect(existsSync(projectDir())).toBe(false);
  restoreFromTrash(env.core, trashId);
  expect(lifecycleOf(env.db, "p1")!.deleted_at).toBeNull();
});

it("восстановление: на месте проекта пустой каталог (след отклонённой записи) — убирается, проект возвращается", () => {
  const { trashId } = del();
  mkdirSync(join(projectDir(), "script/scr_1"), { recursive: true });
  restoreFromTrash(env.core, trashId);
  expect(existsSync(join(projectDir(), "scenes/scn_p1/brief.json"))).toBe(true);
  expect(existsSync(join(projectDir(), "script"))).toBe(false);
});

it("архивный проект открыт для правок (бриф: архив запрещает только задачи)", async () => {
  archiveProject(env.db, "p1");
  await store().writeRevision(destRel(), "script.json", { a: 1 }, () => undefined);
  expect(existsSync(join(env.root, destRel(), "script.json"))).toBe(true);
});

function ctxFor(input: unknown, events: string[] = []): JobContext {
  const job = enqueue(env.db, { type: "trash.purge", projectId: "playground", input, idempotencyKey: `purge-${Math.random()}` }).job;
  return {
    db: env.db, job, attempt: 1, signal: new AbortController().signal,
    run: { root: env.root, runId: job.id, attempt: 1, registry: undefined as never },
    emit: (kind) => void events.push(kind), progress: () => undefined, fenceOk: () => true,
    agents: undefined as never, renders: undefined as never, heavy: undefined as never,
  };
}
const deps = (): Phase46Deps => ({ svc: { root: env.root } as Phase46Deps["svc"], options: {} as Phase46Deps["options"], exporter: {} as Phase46Deps["exporter"] });

it("восстановление во время очистки — 409 trash_purging, строка помечена в списке; очистка доходит до конца", async () => {
  const { trashId } = del();
  const running = trashPurge(deps)(ctxFor({ trashIds: [trashId], token: "t" }));
  // синхронная часть обработчика уже пометила строку (до первого await)
  expect(listTrash(env.db, env.root)).toMatchObject([{ id: trashId, purging: true }]);
  expect(() => restoreFromTrash(env.core, trashId)).toThrow(/trash_purging/);
  expect(await running).toMatchObject({ status: "completed", outputRefs: { purged: [trashId] } });
  expect(lifecycleOf(env.db, "p1")!.deleted_at).not.toBeNull();
  expect(existsSync(projectDir())).toBe(false);
});

it("сбой посреди очистки: строка остаётся «идёт очистка», восстановления нет, сверка не трогает, повтор дочищает", async () => {
  const { trashId } = del();
  const rel = trashRepo.get(env.db, trashId)!.rel_path;
  renameSync(join(env.root, rel), join(env.root, `${rel}.purging`)); // как пометила прерванная очистка
  expect(listTrash(env.db, env.root)).toMatchObject([{ id: trashId, purging: true }]);
  expect(() => restoreFromTrash(env.core, trashId)).toThrow(/trash_purging/);
  expect(reconcileTrash(env.db, env.root)).toEqual({ restored: [], orphans: [] });
  const events: string[] = [];
  expect(await trashPurge(deps)(ctxFor({ trashIds: [trashId], token: "t" }, events))).toMatchObject({ outputRefs: { purged: [trashId] } });
  expect(existsSync(join(env.root, `${rel}.purging`))).toBe(false);
  expect(events).toContain("trash_purged");
});

it("хранилище недоступно (каталога корзины нет) — строка без каталога пропускается: purged_at не ставится, trash_purged нет", async () => {
  const { trashId } = del();
  renameSync(join(env.root, "workspace/trash"), join(env.root, "workspace/trash-offline"));
  const events: string[] = [];
  expect(await trashPurge(deps)(ctxFor({ trashIds: [trashId], token: "t" }, events))).toMatchObject({ outputRefs: { purged: [], skipped: [trashId] } });
  expect(trashRepo.get(env.db, trashId)!.purged_at).toBeNull();
  expect(events).not.toContain("trash_purged");
});

it("сбой между rm и purged_at: на онлайн-хранилище нет ни каталога, ни .purging, ни проекта — повтор помечает строку очищенной", async () => {
  const { trashId } = del();
  const rel = trashRepo.get(env.db, trashId)!.rel_path;
  rmSync(join(env.root, rel), { recursive: true, force: true }); // rm дошёл, markPurged — нет
  const events: string[] = [];
  expect(await trashPurge(deps)(ctxFor({ trashIds: [trashId], token: "t" }, events))).toMatchObject({ outputRefs: { purged: [trashId], skipped: [] } });
  expect(trashRepo.get(env.db, trashId)!.purged_at).not.toBeNull();
  expect(events).toContain("trash_purged");
  expect(listTrash(env.db, env.root)).toEqual([]);
});

it("строка без каталога, но каталог проекта на месте — не «призрак»: пропуск", async () => {
  const { trashId } = del();
  const rel = trashRepo.get(env.db, trashId)!.rel_path;
  renameSync(join(env.root, rel), projectDir());
  expect(await trashPurge(deps)(ctxFor({ trashIds: [trashId], token: "t" }))).toMatchObject({ outputRefs: { purged: [], skipped: [trashId] } });
  expect(trashRepo.get(env.db, trashId)!.purged_at).toBeNull();
  expect(existsSync(join(projectDir(), "scenes/scn_p1/brief.json"))).toBe(true);
});

it("ручной повтор trash.purge — только после сбоя (interrupted); иначе нужен новый purge-intent", async () => {
  const registry = { live: async () => [] } as unknown as ProcessRegistry;
  const failed = enqueue(env.db, { type: "trash.purge", projectId: "playground", input: { trashIds: ["trs_1"], token: "t" }, idempotencyKey: "pg-1" }).job;
  jobs.update(env.db, failed.id, { status: "failed", error: { code: "pipeline", stage: "prepare", message: "x" } });
  await expect(retryJob(env.db, failed.id, registry)).rejects.toMatchObject({ code: "purge_retry_forbidden" });
  const cancelled = enqueue(env.db, { type: "trash.purge", projectId: "playground", input: { trashIds: ["trs_2"], token: "t" }, idempotencyKey: "pg-2" }).job;
  jobs.update(env.db, cancelled.id, { status: "cancelled" });
  await expect(retryJob(env.db, cancelled.id, registry)).rejects.toMatchObject({ code: "purge_retry_forbidden" });
  const crashed = enqueue(env.db, { type: "trash.purge", projectId: "playground", input: { trashIds: ["trs_3"], token: "t" }, idempotencyKey: "pg-3" }).job;
  jobs.update(env.db, crashed.id, { status: "failed", error: { code: "interrupted", stage: "interrupted", message: "прерываний 3 из 3" } });
  expect((await retryJob(env.db, crashed.id, registry)).status).toBe("pending");
});

it("токен удаления одноразовый: после восстановления прежний токен — intent_expired", () => {
  const tok = deleteIntent(env.db, env.root, "p1").token;
  const { trashId } = deleteProject(env.core, "p1", { token: tok, confirm_title: "Мой ролик" });
  restoreFromTrash(env.core, trashId);
  expect(() => deleteProject(env.core, "p1", { token: tok, confirm_title: "Мой ролик" })).toThrow(/intent_expired/);
  expect(lifecycleOf(env.db, "p1")!.deleted_at).toBeNull();
});

it("reconcileTrash: каталог корзины пропал, на месте проекта — пустой пересозданный каталог → orphans, не «восстановлен»", () => {
  const { trashId } = del();
  const rel = trashRepo.get(env.db, trashId)!.rel_path;
  renameSync(join(env.root, rel), join(env.root, "workspace/elsewhere"));
  mkdirSync(join(projectDir(), "script/scr_1"), { recursive: true });
  const r = reconcileTrash(env.db, env.root);
  expect(r).toEqual({ restored: [], orphans: [rel] });
  expect(lifecycleOf(env.db, "p1")!.deleted_at).not.toBeNull();
  expect(trashRepo.get(env.db, trashId)).toBeDefined();
});

it("reconcileExports: экспорты проекта в корзине не считаются пропавшими", async () => {
  versions.insert(env.db, {
    id: "ver_1", scene_id: "scn_p1", parent_version_id: null, number: 1, status: "ready", prompt: "p", edit_plan: null,
    settings: defaultSettings(), path: "workspace/projects/p1/scenes/scn_p1/versions/ver_1", manifest_sha256: "0".repeat(64),
    created_by_job_id: null, created_at: new Date().toISOString(),
  });
  exportsRepo.insert(env.db, { id: "exp_1", version_id: "ver_1", format: "mp4", path: "workspace/projects/p1/exports/exp_1/scene.mp4", sha256: "0".repeat(64) });
  expect((await reconcileExports(env.db, env.root)).missing).toEqual(["exp_1"]);
  del();
  expect((await reconcileExports(env.db, env.root)).missing).toEqual([]);
});
