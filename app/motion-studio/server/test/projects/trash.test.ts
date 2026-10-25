// Удаление проекта в корзину (Task 47, F14): подтверждение названием и токеном, занятый проект —
// `project_busy`, перенос каталога в `workspace/trash/<id>-<ts>/` (rename, данные не стираются),
// восстановление, очистка корзины задачей `trash.purge` по второму подтверждению, сверка при
// старте после сбоя между БД и rename.
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as projects from "../../src/db/repos/projects.js";
import * as trashRepo from "../../src/db/repos/trash.js";
import { enqueue } from "../../src/jobs/queue.js";
import type { JobContext } from "../../src/jobs/types.js";
import { trashPurge } from "../../src/pipeline/trash-purge.js";
import { deleteIntent, purgeIntent } from "../../src/projects/delete-intent.js";
import { lifecycleOf, listProjects } from "../../src/projects/lifecycle.js";
import { deleteProject, listTrash, reconcileTrash, restoreFromTrash } from "../../src/projects/trash.js";
import type { Phase46Deps } from "../../src/pipeline/phase46-deps.js";
import { type Env, cancelAll, genJob, seedProject, setup, teardown } from "./helpers.js";

let env: Env;
beforeEach(async () => {
  env = await setup("ms-proj-trash-");
  seedProject(env, "p1", "Мой ролик");
  seedProject(env, "s1", "Сценарий", "script", { packages: 1 });
});
afterEach(async () => {
  vi.useRealTimers();
  await teardown(env);
});

const trashDir = (trashId: string) => trashRepo.get(env.db, trashId)!.rel_path;

it("вектор брифа: confirm_mismatch → project_busy → корзина → восстановление → intent_expired", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const { core, db, root } = env;
  const it1 = deleteIntent(db, root, "p1");
  expect(() => deleteProject(core, "p1", { token: it1.token, confirm_title: "другое" })).toThrow(/confirm_mismatch/);
  enqueue(db, genJob("p1"));
  expect(() => deleteProject(core, "p1", { token: it1.token, confirm_title: "Мой ролик" })).toThrow(/project_busy/);
  cancelAll(db, "p1");
  const { trashId } = deleteProject(core, "p1", { token: deleteIntent(db, root, "p1").token, confirm_title: "Мой ролик" });
  expect(existsSync(join(root, "workspace/projects/p1"))).toBe(false);
  expect(trashDir(trashId)).toMatch(/^workspace\/trash\/p1-\d{8}T\d{9}Z$/);
  expect(existsSync(join(root, trashDir(trashId), "scenes/scn_p1/brief.json"))).toBe(true); // ничего не стёрто
  expect(projects.list(db).map((p) => p.id)).not.toContain("p1");
  expect(listTrash(db).map((t) => t.project_id)).toEqual(["p1"]);
  restoreFromTrash(core, trashId);
  expect(lifecycleOf(db, "p1")!.deleted_at).toBeNull();
  expect(existsSync(join(root, "workspace/projects/p1/scenes/scn_p1/brief.json"))).toBe(true);
  expect(listTrash(db)).toEqual([]);
  vi.setSystemTime(Date.now() + 11 * 60_000);
  expect(() => deleteProject(core, "p1", { token: it1.token, confirm_title: "Мой ролик" })).toThrow(/intent_expired/);
});

it("сценарный проект с идущей задачей пакета — project_busy; название сверяется после trim", () => {
  const { core, db, root } = env;
  enqueue(db, genJob("s1"));
  const tok = deleteIntent(db, root, "s1").token;
  expect(() => deleteProject(core, "s1", { token: tok, confirm_title: "Сценарий" })).toThrow(/project_busy/);
  cancelAll(db, "s1");
  const { trashId } = deleteProject(core, "s1", { token: deleteIntent(db, root, "s1").token, confirm_title: "  Сценарий " });
  expect(existsSync(join(root, trashDir(trashId), "packages/pkg_0/01.mp4"))).toBe(true);
});

it("опубликованные read-only каталоги переносятся (rename, не копия)", () => {
  const ro = join(env.root, "workspace/projects/p1/scenes/scn_p1/versions/v1");
  mkdirSync(ro, { recursive: true });
  writeFileSync(join(ro, "manifest.json"), "{}");
  chmodSync(join(ro, "manifest.json"), 0o444);
  chmodSync(ro, 0o555);
  const { trashId } = deleteProject(env.core, "p1", { token: deleteIntent(env.db, env.root, "p1").token, confirm_title: "Мой ролик" });
  expect(existsSync(join(env.root, trashDir(trashId), "scenes/scn_p1/versions/v1/manifest.json"))).toBe(true);
});

it("удалённый проект: задачи не ставятся, повторное удаление и архив — project_deleted; Playground — project_protected", () => {
  deleteProject(env.core, "p1", { token: deleteIntent(env.db, env.root, "p1").token, confirm_title: "Мой ролик" });
  expect(() => enqueue(env.db, genJob("p1"))).toThrow(/project_deleted/);
  expect(() => deleteIntent(env.db, env.root, "p1")).toThrow(/project_deleted/);
  expect(listProjects(env.db, "active").map((p) => p.id)).not.toContain("p1");
  expect(listProjects(env.db, "archived").map((p) => p.id)).not.toContain("p1");
  expect(() => deleteIntent(env.db, env.root, "playground")).toThrow(/project_protected/);
});

it("восстановление: каталог проекта уже занят — restore_conflict, корзина не тронута", () => {
  const { trashId } = deleteProject(env.core, "p1", { token: deleteIntent(env.db, env.root, "p1").token, confirm_title: "Мой ролик" });
  mkdirSync(join(env.root, "workspace/projects/p1"));
  expect(() => restoreFromTrash(env.core, trashId)).toThrow(/restore_conflict/);
  expect(existsSync(join(env.root, trashDir(trashId)))).toBe(true);
  expect(lifecycleOf(env.db, "p1")!.deleted_at).not.toBeNull();
  expect(() => restoreFromTrash(env.core, "trs_nope")).toThrow(/trash_not_found/);
});

function ctxFor(input: unknown): JobContext {
  const job = enqueue(env.db, { type: "trash.purge", projectId: "playground", input, idempotencyKey: `purge-${Math.random()}` }).job;
  return {
    db: env.db, job, attempt: 1, signal: new AbortController().signal,
    run: { root: env.root, runId: job.id, attempt: 1, registry: undefined as never },
    emit: () => undefined, progress: () => undefined, fenceOk: () => true,
    agents: undefined as never, renders: undefined as never, heavy: undefined as never,
  };
}
const deps = (): Phase46Deps => ({ svc: { root: env.root } as Phase46Deps["svc"], options: {} as Phase46Deps["options"], exporter: {} as Phase46Deps["exporter"] });

it("trash.purge: второе подтверждение; стирает только каталоги корзины, read-only тоже; повтор — без ошибок", async () => {
  const { trashId } = deleteProject(env.core, "p1", { token: deleteIntent(env.db, env.root, "p1").token, confirm_title: "Мой ролик" });
  const ro = join(env.root, trashDir(trashId), "scenes/scn_p1");
  chmodSync(join(ro, "brief.json"), 0o444);
  chmodSync(ro, 0o555);
  const intent = purgeIntent(env.db, env.root, [trashId]);
  expect(intent).toMatchObject({ count: 1 });
  expect(intent.bytes).toBeGreaterThan(0);
  const r = await trashPurge(deps)(ctxFor({ trashIds: [trashId], token: intent.token }));
  expect(r).toMatchObject({ status: "completed", outputRefs: { purged: [trashId] } });
  expect(existsSync(join(env.root, trashDir(trashId)))).toBe(false);
  expect(trashRepo.get(env.db, trashId)!.purged_at).not.toBeNull();
  expect(listTrash(env.db)).toEqual([]);
  expect(existsSync(join(env.root, "workspace/projects/s1/packages/pkg_0/01.mp4"))).toBe(true);
  const again = await trashPurge(deps)(ctxFor({ trashIds: [trashId], token: intent.token }));
  expect(again).toMatchObject({ status: "completed", outputRefs: { purged: [], skipped: [trashId] } });
  expect(() => restoreFromTrash(env.core, trashId)).toThrow(/trash_not_found/);
});

it("trash.purge: восстановленный проект не стирается; неверный вход — failed", async () => {
  const { trashId } = deleteProject(env.core, "p1", { token: deleteIntent(env.db, env.root, "p1").token, confirm_title: "Мой ролик" });
  const intent = purgeIntent(env.db, env.root, [trashId]);
  restoreFromTrash(env.core, trashId);
  const r = await trashPurge(deps)(ctxFor({ trashIds: [trashId], token: intent.token }));
  expect(r).toMatchObject({ status: "completed", outputRefs: { purged: [], skipped: [trashId] } });
  expect(existsSync(join(env.root, "workspace/projects/p1/scenes/scn_p1/brief.json"))).toBe(true);
  expect(await trashPurge(deps)(ctxFor({ nope: 1 }))).toMatchObject({ status: "failed" });
  expect(() => purgeIntent(env.db, env.root, ["trs_nope"])).toThrow(/trash_not_found/);
});

it("reconcileTrash: сбой между записью БД и rename разрешается в сторону «не удалён»", () => {
  const { trashId } = deleteProject(env.core, "p1", { token: deleteIntent(env.db, env.root, "p1").token, confirm_title: "Мой ролик" });
  const rel = trashDir(trashId);
  // (а) БД «удалён», каталог на старом месте (rename восстановления дошёл, COMMIT — нет)
  renameSync(join(env.root, rel), join(env.root, "workspace/projects/p1"));
  // (б) каталог в корзине без строки (rename удаления дошёл, COMMIT — нет)
  seedProject(env, "p3", "Третий");
  mkdirSync(join(env.root, "workspace/trash"), { recursive: true });
  renameSync(join(env.root, "workspace/projects/p3"), join(env.root, "workspace/trash/p3-20261025T101010123Z"));
  const r = reconcileTrash(env.db, env.root);
  expect(r.restored.sort()).toEqual(["p1", "p3"]);
  expect(lifecycleOf(env.db, "p1")!.deleted_at).toBeNull();
  expect(trashRepo.get(env.db, trashId)).toBeUndefined();
  expect(existsSync(join(env.root, "workspace/projects/p3/scenes/scn_p3/brief.json"))).toBe(true);
  expect(readdirSync(join(env.root, "workspace/trash"))).toEqual([]);
});
