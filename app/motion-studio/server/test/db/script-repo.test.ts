// S1 «сценарий → моушн»: репозиторий таблиц сценария (005_script).
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as plans from "../../src/db/repos/plans.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { DEFAULT_READING } from "@ms/contracts";
import { canonicalHash } from "@ms/contracts/canonical";
import { scriptBatches, scriptPackages, scriptPlans, scriptRevisions, scriptScenes, scripts } from "../../src/db/repos/script.js";
import { enqueue } from "../../src/jobs/queue.js";
import { currentSubject } from "../../src/approvals/subjects.js";
import { makeStore, removeStore, type TestStore } from "./helpers.js";

const SHA = "a".repeat(64);
let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-db-script-");
  db = openDb(s.root);
  await migrate(db, { log: () => undefined });
  projects.create(db, { id: "p1", kind: "script", title: "Сценарий" });
  plans.create(db, { id: "pln_1", project_id: "p1" });
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

it("scripts: один на проект; ревизии; current только вперёд", () => {
  expect(scripts.byProject(db, "p1")).toBeUndefined();
  expect(scripts.create(db, { id: "scr_1", project_id: "p1" })).toMatchObject({ id: "scr_1", project_id: "p1", current_revision: null });
  expect(() => scripts.create(db, { id: "scr_2", project_id: "p1" })).toThrow(/UNIQUE/);
  scriptRevisions.insert(db, { script_id: "scr_1", revision: 1, rel_path: "workspace/projects/p1/script/scr_1/r1/script.json", sha256: SHA, hash: SHA });
  scripts.setCurrent(db, "scr_1", 1);
  scriptRevisions.insert(db, { script_id: "scr_1", revision: 2, rel_path: "x/r2/script.json", sha256: SHA, hash: SHA });
  scripts.setCurrent(db, "scr_1", 2);
  scripts.setCurrent(db, "scr_1", 1); // назад не откатывается
  expect(scripts.byProject(db, "p1")!.current_revision).toBe(2);
  expect(scriptRevisions.get(db, "scr_1", 1)).toMatchObject({ rel_path: "workspace/projects/p1/script/scr_1/r1/script.json", hash: SHA });
  expect(scriptRevisions.get(db, "scr_1", 3)).toBeUndefined();
  expect(() => scriptRevisions.insert(db, { script_id: "scr_1", revision: 1, rel_path: "y", sha256: SHA, hash: SHA })).toThrow(/UNIQUE|PRIMARY/);
  expect(() => scripts.setCurrent(db, "scr_nope", 1)).toThrow();
});

it("batches, scenes (UNIQUE plan+item+aspect, listByPlan по aspect, setJob), packages", () => {
  const b = scriptBatches.insert(db, { id: "sb_1", project_id: "p1", plan_id: "pln_1", plan_revision: 1, aspect: "16:9", approval_id: null });
  expect(scriptBatches.get(db, "sb_1")).toEqual(b);
  scriptBatches.insert(db, { id: "sb_2", project_id: "p1", plan_id: "pln_1", plan_revision: 1, aspect: "9:16", approval_id: null });
  expect(scriptBatches.listByProject(db, "p1").map((x) => x.id)).toEqual(["sb_1", "sb_2"]);

  for (const id of ["scn_1", "scn_2", "scn_3"]) scenes.create(db, { id, project_id: "p1", title: id });
  const row = { project_id: "p1", plan_id: "pln_1", item_id: "ss_001", aspect: "16:9" as const, scene_id: "scn_1", batch_id: "sb_1", job_id: null, item_fingerprint: "f1" };
  expect(scriptScenes.insert(db, row)).toMatchObject(row);
  expect(() => scriptScenes.insert(db, { ...row, scene_id: "scn_2" })).toThrow(/UNIQUE|PRIMARY/);
  scriptScenes.insert(db, { ...row, item_id: "ss_002", scene_id: "scn_2" });
  scriptScenes.insert(db, { ...row, aspect: "9:16", scene_id: "scn_3", batch_id: "sb_2" });
  expect(scriptScenes.listByPlan(db, "pln_1", "16:9").map((x) => x.item_id)).toEqual(["ss_001", "ss_002"]);
  expect(scriptScenes.listByPlan(db, "pln_1", "9:16").map((x) => x.scene_id)).toEqual(["scn_3"]);
  expect(scriptScenes.get(db, "pln_1", "ss_001", "9:16")!.scene_id).toBe("scn_3");

  const job = enqueue(db, { type: "playground.generate", projectId: "p1", sceneId: "scn_1", input: {}, idempotencyKey: "k" }).job;
  scriptScenes.setJob(db, "scn_1", job.id);
  expect(scriptScenes.get(db, "pln_1", "ss_001", "16:9")).toMatchObject({ job_id: job.id, item_fingerprint: "f1" });
  scriptScenes.setJob(db, "scn_1", job.id, "f2");
  expect(scriptScenes.get(db, "pln_1", "ss_001", "16:9")!.item_fingerprint).toBe("f2");
  expect(() => scriptScenes.setJob(db, "scn_nope", job.id)).toThrow();

  const pkg = scriptPackages.insert(db, { id: "pkg_1", project_id: "p1", job_id: null, aspect: "16:9", rel_path: "workspace/projects/p1/packages/pkg_1", manifest_sha256: SHA });
  expect(scriptPackages.get(db, "pkg_1")).toEqual(pkg);
  expect(scriptPackages.listByProject(db, "p1").map((x) => x.id)).toEqual(["pkg_1"]);
  expect(() => scriptPackages.insert(db, { ...pkg, id: "pkg_2", aspect: "1:1" as "16:9" })).toThrow(/CHECK/);
});

it("scriptPlans: ревизия сценарного плана в visual_plan_revisions без scene_plans; hash = canonicalHash", () => {
  scriptPlans.create(db, { id: "pln_2", project_id: "p1" });
  const doc = {
    schema_version: 1 as const, plan_id: "pln_2", revision: 1,
    inputs: { script: { id: "scr_1", revision: 1, hash: SHA }, style: { id: "sty_1", revision: 1, hash: SHA } },
    fps: { num: 30, den: 1 }, aspect: "16:9" as const, reading: DEFAULT_READING,
    analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
    items: [], skipped: [], issues: [], diversity: { techniques: {}, adjacent_repeats: 0, kinetic_share: 0 },
  };
  const rev = scriptPlans.insertRevision(db, { doc, rel_path: "workspace/projects/p1/plan/pln_2/r1/script-plan.json", sha256: SHA });
  expect(rev).toMatchObject({ plan_id: "pln_2", revision: 1, hash: canonicalHash(doc) });
  expect(plans.get(db, "pln_2")!.current_revision).toBe(1);
  expect(plans.scenePlans(db, "pln_2", 1)).toEqual([]);
  expect(() => scriptPlans.insertRevision(db, { doc: { ...doc, revision: 2, items: [{} as never] }, rel_path: "x", sha256: SHA })).toThrow();
  // Approval B: субъект — текущая ревизия сценарного плана.
  expect(currentSubject(db, "p1", "B")).toEqual({ ref: "plan:pln_2@r1", hash: canonicalHash(doc) });
});

it("scriptPlans.insertRevision: rel_path только на script-plan.json", () => {
  scriptPlans.create(db, { id: "pln_3", project_id: "p1" });
  const doc = {
    schema_version: 1 as const, plan_id: "pln_3", revision: 1,
    inputs: { script: { id: "scr_1", revision: 1, hash: SHA }, style: { id: "sty_1", revision: 1, hash: SHA } },
    fps: { num: 30, den: 1 }, aspect: "16:9" as const, reading: DEFAULT_READING,
    analysis: { chapters: [], anchors: [], entities: [], numbers: [], causal: [], disputed: [] },
    items: [], skipped: [], issues: [], diversity: { techniques: {}, adjacent_repeats: 0, kinetic_share: 0 },
  };
  expect(() => scriptPlans.insertRevision(db, { doc, rel_path: "workspace/projects/p1/plan/pln_3/r1/plan.json", sha256: SHA })).toThrow(/script-plan\.json/);
  expect(plans.revision(db, "pln_3", 1)).toBeUndefined();
});

it("scriptScenes.listByPlan: по числовой части id сцены плана", () => {
  for (const id of ["scn_1", "scn_2", "scn_3"]) scenes.create(db, { id, project_id: "p1", title: id });
  const row = { project_id: "p1", plan_id: "pln_1", aspect: "16:9" as const, batch_id: null, job_id: null, item_fingerprint: "f" };
  scriptScenes.insert(db, { ...row, item_id: "ss_1000", scene_id: "scn_1" });
  scriptScenes.insert(db, { ...row, item_id: "ss_999", scene_id: "scn_2" });
  scriptScenes.insert(db, { ...row, item_id: "ss_002", scene_id: "scn_3" });
  expect(scriptScenes.listByPlan(db, "pln_1", "16:9").map((x) => x.item_id)).toEqual(["ss_002", "ss_999", "ss_1000"]);
});
