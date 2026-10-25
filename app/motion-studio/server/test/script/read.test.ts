// S1 «сценарий → моушн»: чтение текущих ревизий текста и плана сценария из хранилища.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_READING } from "@ms/contracts";
import { afterEach, beforeEach, expect, it } from "vitest";
import { artifactPaths } from "../../src/artifacts/paths.js";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as plans from "../../src/db/repos/plans.js";
import * as projects from "../../src/db/repos/projects.js";
import { scriptRevisions, scripts } from "../../src/db/repos/script.js";
import { SCRIPT_FILE, SCRIPT_PLAN_FILE, currentScript, currentScriptPlan } from "../../src/script/read.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

const SHA = "a".repeat(64);
const HASH = "b".repeat(64);
let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-script-read-");
  db = openDb(s.root);
  await migrate(db, { log: () => undefined });
  projects.create(db, { id: "p1", kind: "script", title: "Сценарий" });
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

function put(rel: string, doc: unknown): void {
  mkdirSync(dirname(join(s.root, rel)), { recursive: true });
  writeFileSync(join(s.root, rel), JSON.stringify(doc));
}

const scriptDoc = (revision: number) => ({
  schema_version: 1, script_id: "scr_1", revision, blocks: [{ id: "b1", title: "", text: "Раз" }],
  words: [{ id: "w_000001", text: "Раз", block_id: "b1", start: 0, end: 3, sentence: 0 }], author: "user",
});

it("currentScript: нет текста — undefined; есть — документ текущей ревизии", () => {
  expect(currentScript(db, s.root, "p1")).toBeUndefined();
  scripts.create(db, { id: "scr_1", project_id: "p1" });
  expect(currentScript(db, s.root, "p1")).toBeUndefined();
  for (const n of [1, 2]) {
    const rel = `${artifactPaths(s.root, "p1").scriptRev("scr_1", n)}/${SCRIPT_FILE}`;
    put(rel, scriptDoc(n));
    scriptRevisions.insert(db, { script_id: "scr_1", revision: n, rel_path: rel, sha256: SHA, hash: HASH });
    scripts.setCurrent(db, "scr_1", n);
  }
  expect(currentScript(db, s.root, "p1")?.revision).toBe(2);
});

it("currentScriptPlan: файл script-plan.json текущей ревизии visual_plans; план видео — не сценарный", () => {
  expect(currentScriptPlan(db, s.root, "p1")).toBeUndefined();
  plans.create(db, { id: "pln_1", project_id: "p1" });
  const doc = {
    schema_version: 1, plan_id: "pln_1", revision: 1,
    inputs: { script: { id: "scr_1", revision: 1, hash: SHA }, style: { id: "sty_1", revision: 1, hash: SHA } },
    fps: { num: 30, den: 1 }, aspect: "16:9", reading: DEFAULT_READING,
    analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
    items: [], skipped: [], issues: [], diversity: { techniques: {}, adjacent_repeats: 0, kinetic_share: 0 }, agent: "skipped",
  };
  const rel = `${artifactPaths(s.root, "p1").planRev("pln_1", 1)}/${SCRIPT_PLAN_FILE}`;
  put(rel, doc);
  db.prepare("INSERT INTO visual_plan_revisions (plan_id, revision, parent_revision, rel_path, sha256, hash, created_at) VALUES (?, 1, NULL, ?, ?, ?, ?)")
    .run("pln_1", rel, SHA, HASH, new Date().toISOString());
  db.prepare("UPDATE visual_plans SET current_revision = 1 WHERE id = 'pln_1'").run();
  expect(currentScriptPlan(db, s.root, "p1")).toEqual({ doc, planId: "pln_1", hash: HASH });

  db.prepare("UPDATE visual_plan_revisions SET rel_path = ? WHERE plan_id = 'pln_1'").run(rel.replace(SCRIPT_PLAN_FILE, "plan.json"));
  expect(currentScriptPlan(db, s.root, "p1")).toBeUndefined();
});
