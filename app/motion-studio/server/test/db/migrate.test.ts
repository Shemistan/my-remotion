import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as projects from "../../src/db/repos/projects.js";
import { makeStore, removeStore, type TestStore } from "./helpers.js";

let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-db-migrate-");
  db = openDb(s.root);
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

it("studio.db в корне хранилища: WAL, synchronous=FULL, foreign_keys, busy_timeout", async () => {
  expect(existsSync(join(s.root, "studio.db"))).toBe(true);
  expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
  expect(db.pragma("synchronous", { simple: true })).toBe(2);
  expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  expect(db.pragma("busy_timeout", { simple: true })).toBe(5000);
});

it("миграции по номеру в PRAGMA user_version, повтор ничего не делает", async () => {
  expect(await migrate(db)).toEqual({ from: 0, to: 3 });
  expect(await migrate(db)).toEqual({ from: 3, to: 3 });
  expect(db.pragma("user_version", { simple: true })).toBe(3);
});

it("002_resource_locks: база версии 1 (Task 11) доводится до последней", async () => {
  db.exec(readFileSync(new URL("../../src/db/migrations/001_phase1.sql", import.meta.url), "utf8"));
  db.pragma("user_version = 1");
  expect(await migrate(db, { log: () => undefined })).toMatchObject({ from: 1, to: 3, backup: expect.any(String) });
  const cols = (db.prepare("PRAGMA table_info(resource_locks)").all() as { name: string; pk: number }[]).map((c) => [c.name, c.pk]);
  expect(cols).toEqual([["resource", 1], ["job_id", 0], ["acquired_at", 0]]);
});

it("001_phase1: все таблицы Phase 1 и meta", async () => {
  await migrate(db);
  const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
  for (const t of [
    "meta", "projects", "scenes", "scene_versions", "chat_messages", "jobs", "job_events", "agent_runs", "render_jobs",
    "qa_reports", "knowledge_refs", "exports", "component_tests", "scene_locks", "job_processes",
  ]) expect(names, t).toContain(t);
  const interrupts = (db.prepare("PRAGMA table_info(jobs)").all() as { name: string; notnull: number; dflt_value: string }[])
    .find((c) => c.name === "interrupts");
  expect(interrupts).toMatchObject({ notnull: 1, dflt_value: "0" });
});

it("проект playground создаётся миграцией", async () => {
  await migrate(db);
  expect(projects.get(db, "playground")).toMatchObject({ id: "playground", kind: "playground" });
});

it("БД новее приложения — ошибка, схема не трогается", async () => {
  await migrate(db);
  db.pragma("user_version = 99");
  await expect(migrate(db)).rejects.toThrow(/новее/);
});

it("сбой миграции откатывается целиком", async () => {
  db.exec("CREATE TABLE projects (x INTEGER)"); // конфликт с 001
  await expect(migrate(db)).rejects.toThrow();
  expect(db.pragma("user_version", { simple: true })).toBe(0);
  expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'jobs'").get()).toEqual({ n: 0 });
});
