import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it } from "vitest";
import { configureDb, openDb, type Db } from "../../src/db/open.js";
import { makeStore, removeStore, type TestStore } from "./helpers.js";

let s: TestStore;
let db: Db | undefined;
beforeEach(async () => {
  s = await makeStore("ms-db-open-");
});
afterEach(async () => {
  db?.close();
  await removeStore(s);
});

it("macOS: fullfsync включён (fsync до носителя, а не до кеша диска)", () => {
  db = openDb(s.root);
  expect(db.pragma("fullfsync", { simple: true })).toBe(process.platform === "darwin" ? 1 : 0);
});

it("journal_mode не WAL — ошибка, а не молчаливая работа без WAL", () => {
  const mem = new Database(":memory:"); // in-memory база не умеет WAL
  expect(() => configureDb(mem)).toThrow(/wal/);
  expect(mem.open).toBe(false);
});
