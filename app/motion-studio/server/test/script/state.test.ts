// S1 «сценарий → моушн»: состояние сценарного проекта (scriptState) и отпечаток сцены плана.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_READING, type Job, type ScriptPlanRevisionDoc, type ScriptSceneItem } from "@ms/contracts";
import { afterEach, beforeEach, expect, it } from "vitest";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { scriptPlans, scriptScenes } from "../../src/db/repos/script.js";
import { enqueue } from "../../src/jobs/queue.js";
import { itemFingerprint } from "../../src/script/fingerprint.js";
import { SCRIPT_PLAN_FILE } from "../../src/script/read.js";
import { sceneStatus, scriptState } from "../../src/script/state.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

const SHA = "a".repeat(64);
const item: ScriptSceneItem = {
  id: "ss_001", status: "accepted", origin: "agent", start_word_id: "w_000001", end_word_id: "w_000003", quote: "Раз два три",
  block_id: "b1", words: 3, at_s: 0, frames: { lead: 15, speech: 36, tail: 39, total: 90 }, technique: "hero-number", pattern: "quantities",
  purpose: "п", idea: "и", key_terms: [], data: [], importance: 2, anchor_ids: [],
};
const doc: ScriptPlanRevisionDoc = {
  schema_version: 1, plan_id: "pln_1", revision: 1,
  inputs: { script: { id: "scr_1", revision: 1, hash: SHA }, style: { id: "sty_1", revision: 1, hash: SHA } },
  fps: { num: 30, den: 1 }, aspect: "16:9", reading: DEFAULT_READING,
  analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
  items: [item, { ...item, id: "ss_002" }], skipped: [], issues: [], diversity: { techniques: { "hero-number": 2 }, adjacent_repeats: 1, kinetic_share: 0 },
};

let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-script-state-");
  db = openDb(s.root);
  await migrate(db, { log: () => undefined });
  projects.create(db, { id: "p1", kind: "script", title: "Сценарий" });
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

it("отпечаток меняется от приёма, границ, длины и стиля, но не от статуса", () => {
  const f = itemFingerprint(item, null);
  expect(itemFingerprint({ ...item, status: "rejected" }, null)).toBe(f);
  expect(itemFingerprint({ ...item, technique: "race" }, null)).not.toBe(f);
  expect(itemFingerprint({ ...item, end_word_id: "w_000004" }, null)).not.toBe(f);
  expect(itemFingerprint({ ...item, frames: { ...item.frames, tail: 40, total: 91 } }, null)).not.toBe(f);
  expect(itemFingerprint(item, { id: "sty_1", revision: 2 })).not.toBe(f);
});

it("fix I1: отпечаток — кадры целиком, термины, числа, форма времени; цитата и статус — нет", () => {
  const f = itemFingerprint(item, null);
  expect(itemFingerprint({ ...item, key_terms: [{ text: "Раз", word_id: "w_000001" }] }, null)).not.toBe(f);
  // lead ↔ tail при той же длине
  expect(itemFingerprint({ ...item, frames: { lead: 39, speech: 36, tail: 15, total: 90 } }, null)).not.toBe(f);
  expect(itemFingerprint({ ...item, data: [{ label: "n", value: 3, quote: "три" }] }, null)).not.toBe(f);
  expect(itemFingerprint({ ...item, structure_rule: "one-number" }, null)).not.toBe(f);
  expect(itemFingerprint({ ...item, quote: "раз два три" }, null)).toBe(f);
  expect(itemFingerprint({ ...item, status: "rejected" }, null)).toBe(f);
});

it("scriptState: план, сцены по форматам, статус и устаревание по отпечатку", () => {
  scriptPlans.create(db, { id: "pln_1", project_id: "p1" });
  const rel = `${artifactPaths(s.root, "p1").planRev("pln_1", 1)}/${SCRIPT_PLAN_FILE}`;
  mkdirSync(dirname(join(s.root, rel)), { recursive: true });
  writeFileSync(join(s.root, rel), JSON.stringify(doc));
  scriptPlans.insertRevision(db, { doc, rel_path: rel, sha256: SHA });
  for (const id of ["scn_1", "scn_2"]) scenes.create(db, { id, project_id: "p1", title: id });
  scriptScenes.insert(db, { project_id: "p1", plan_id: "pln_1", item_id: "ss_001", aspect: "16:9", scene_id: "scn_1", batch_id: null, job_id: null, item_fingerprint: itemFingerprint(item, null) });
  scriptScenes.insert(db, { project_id: "p1", plan_id: "pln_1", item_id: "ss_002", aspect: "9:16", scene_id: "scn_2", batch_id: null, job_id: null, item_fingerprint: "old" });
  const j = enqueue(db, { type: "playground.generate", projectId: "p1", sceneId: "scn_2", input: {}, idempotencyKey: "k" }).job;
  scriptScenes.setJob(db, "scn_2", j.id);

  const st = scriptState(db, s.root, "p1");
  expect(st.plan).toEqual({ plan_id: "pln_1", doc, approval: { state: "missing" } });
  expect(st.plan_outdated).toBe(false); // текста нет
  expect(st.approval).toEqual({ state: "missing" });
  expect(st.scenes.map((x) => [x.item_id, x.aspect, x.status, x.stale, x.job?.id ?? null])).toEqual([
    ["ss_001", "16:9", "none", false, null],
    ["ss_002", "9:16", "pending", true, j.id],
  ]);
});

it("sceneStatus: нет задачи — none, ждёт ввода — running", () => {
  const job = (status: Job["status"]) => ({ status }) as Job;
  expect(sceneStatus(null, null)).toBe("none");
  expect(sceneStatus(job("awaiting_input"), null)).toBe("running");
  expect(sceneStatus(job("running"), null)).toBe("running");
  expect(sceneStatus(job("pending"), null)).toBe("pending");
  expect(sceneStatus(job("completed"), "ver_1")).toBe("ready");
  expect(sceneStatus(job("completed"), null)).toBe("failed");
});

it("scriptState без плана: plan null", () => {
  expect(scriptState(db, s.root, "p1").plan).toBeNull();
});
