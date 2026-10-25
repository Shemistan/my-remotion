// Намерение удалить проект (Task 47): сводка «что будет удалено» и токен на 10 минут, привязанный
// к состоянию проекта; сценарный проект считает папки `packages/`, активные задачи — с пакетом.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { enqueue } from "../../src/jobs/queue.js";
import { INTENT_TTL_MS, deleteIntent, verifyDeleteToken } from "../../src/projects/delete-intent.js";
import { renameProject } from "../../src/projects/lifecycle.js";
import { type Env, genJob, seedProject, setup, teardown } from "./helpers.js";

let env: Env;
beforeEach(async () => {
  env = await setup("ms-proj-intent-");
  seedProject(env, "p1", "Мой ролик");
  seedProject(env, "s1", "Сценарий", "script", { packages: 2 });
});
afterEach(async () => {
  vi.useRealTimers();
  await teardown(env);
});

it("сводка: название, сцены, размер, файлы; срок — 10 минут", () => {
  const at = Date.now();
  const it1 = deleteIntent(env.db, env.root, "p1");
  expect(it1).toMatchObject({ title: "Мой ролик", scenes: 1, versions: 0, exports: 0, packages: 0, files: 1, activeJobs: [] });
  expect(it1.bytes).toBeGreaterThan(0);
  expect(Date.parse(it1.expiresAt) - at).toBeGreaterThanOrEqual(INTENT_TTL_MS - 1000);
  expect(INTENT_TTL_MS).toBe(10 * 60_000);
  expect(it1.token).toMatch(/^\d+\.[0-9a-f]{64}$/);
});

it("сценарный проект: папки packages/ считаются, идущая задача пакета — в activeJobs", () => {
  const { job } = enqueue(env.db, genJob("s1"));
  const it1 = deleteIntent(env.db, env.root, "s1");
  expect(it1.packages).toBe(2);
  expect(it1.files).toBe(3);
  expect(it1.activeJobs).toEqual([job.id]);
});

it("токен: устарел через 10 минут; изменилось состояние (файл, название) — intent_expired; чужой проект — нет", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const it1 = deleteIntent(env.db, env.root, "p1");
  expect(() => verifyDeleteToken(env.db, env.root, "p1", it1.token)).not.toThrow();
  expect(() => verifyDeleteToken(env.db, env.root, "s1", it1.token)).toThrow(/intent_expired/);
  expect(() => verifyDeleteToken(env.db, env.root, "p1", "мусор")).toThrow(/intent_expired/);
  vi.setSystemTime(Date.now() + 11 * 60_000);
  expect(() => verifyDeleteToken(env.db, env.root, "p1", it1.token)).toThrow(/intent_expired/);

  const it2 = deleteIntent(env.db, env.root, "p1");
  writeFileSync(join(env.root, "workspace/projects/p1/new.txt"), "новое");
  expect(() => verifyDeleteToken(env.db, env.root, "p1", it2.token)).toThrow(/intent_expired/);
  const it3 = deleteIntent(env.db, env.root, "p1");
  renameProject(env.db, "p1", "Другое");
  expect(() => verifyDeleteToken(env.db, env.root, "p1", it3.token)).toThrow(/intent_expired/);
});

it("проекта без каталога на диске — сводка с нулями", async () => {
  const { create } = await import("../../src/db/repos/projects.js");
  create(env.db, { id: "empty", title: "Пустой" });
  expect(deleteIntent(env.db, env.root, "empty")).toMatchObject({ bytes: 0, files: 0, scenes: 0, packages: 0 });
});
