// Task 27: таймлайн ревизии EDL из `timeline_clips` (инвариант: = buildTimeline(acceptedCuts(doc))).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acceptedCuts, buildTimeline, mapWords } from "@ms/contracts";
import { ArtifactStore } from "../../src/artifacts/store.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import { currentEdl, saveEdlRevision } from "../../src/edit/edl-ops.js";
import { timelineFor } from "../../src/edit/timeline-store.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";
import { F30, dec, seedVideo, w } from "./helpers.js";

let s: TestStore;
let db: Db;
let store: ArtifactStore;
const words = [w("w_000001", "раз", 0, 400_000), w("w_000002", "два", 2_100_000, 2_500_000), w("w_000003", "три", 7_000_000, 7_400_000)];

beforeEach(async () => {
  s = await makeStore("ms-edit-tl-");
  db = openDb(s.root);
  await migrate(db);
  store = new ArtifactStore({ root: s.root, db, guard: s.guard });
  await seedVideo(db, store, s.root, { words, decisions: [dec("d1", { status: "accepted", source_start_us: 1_010_000, source_end_us: 1_990_000 })] });
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

describe("timelineFor", () => {
  it("каждая ревизия: таймлайн из БД = buildTimeline(acceptedCuts(документ)); слово мапится туда и обратно", async () => {
    const deps = { db, store, root: s.root };
    await saveEdlRevision(deps, "edl_1", { base_revision: 1, ops: [{ op: "add_cut", start_word_id: "w_000002", end_word_id: "w_000002" }] });
    await saveEdlRevision(deps, "edl_1", { base_revision: 2, ops: [{ op: "add_cut_range", source_start_us: 8_000_000, source_end_us: 20_000_000 }] });
    for (const rev of [1, 2, 3]) {
      const doc = currentEdl(db, s.root, "edl_1", rev);
      expect(timelineFor(db, "edl_1", rev)).toEqual(buildTimeline(10_000_000, acceptedCuts(doc), F30));
    }
    const tl = timelineFor(db, "edl_1");
    expect(tl.duration_us).toBe(10_000_000 - 1_000_000 - (6_900_000 - 2_100_000) - 2_000_000);
    expect(mapWords(tl, words)).toMatchObject({ w_000001: { state: "kept" }, w_000002: { state: "removed" }, w_000003: { state: "kept", edited_start_us: 7_000_000 - 1_000_000 - 4_800_000 } });
  });

  it("неизвестный EDL или ревизия — edl_not_found", () => {
    expect(() => timelineFor(db, "edl_9")).toThrow(/edl_not_found/);
    expect(() => timelineFor(db, "edl_1", 7)).toThrow(/edl_not_found/);
  });
});
