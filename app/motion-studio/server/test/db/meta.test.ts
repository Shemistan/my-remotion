import { afterEach, beforeEach, expect, it } from "vitest";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import { bindStoreId, getMeta, quickCheck } from "../../src/db/meta.js";
import { makeStore, removeStore, type TestStore } from "./helpers.js";

let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-db-meta-");
  db = openDb(s.root);
  await migrate(db);
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

it("bindStoreId: первый запуск пишет store_id, расхождение — store_mismatch", () => {
  const markerA = s.marker;
  const markerB = { ...markerA, store_id: "другой-стор" };
  bindStoreId(db, markerA);
  expect(getMeta(db, "store_id")).toBe(markerA.store_id);
  expect(() => bindStoreId(db, markerA)).not.toThrow();
  expect(() => bindStoreId(db, markerB)).toThrow(/store_mismatch/);
  expect(getMeta(db, "store_id")).toBe(markerA.store_id);
});

it("quickCheck: целая база — true", () => expect(quickCheck(db)).toBe(true));
