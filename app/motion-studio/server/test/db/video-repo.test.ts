// Task 35′: репозиторий таблиц Phase 4–6 (006_video_production) — по образцу script-repo.
import { afterEach, beforeEach, expect, it } from "vitest";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as plans from "../../src/db/repos/plans.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { finalExports, videoBatches, videoPackages, videoScenes, videoTimelines } from "../../src/db/repos/video.js";
import { enqueue } from "../../src/jobs/queue.js";
import { makeStore, removeStore, type TestStore } from "./helpers.js";

const SHA = "a".repeat(64);
let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-db-video-");
  db = openDb(s.root);
  await migrate(db, { log: () => undefined });
  projects.create(db, { id: "p1", kind: "video", title: "Видео" });
  plans.create(db, { id: "pln_1", project_id: "p1" });
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

it("пакеты и сцены плана: ключ (plan, item), сцена Playground одна, задача и отпечаток", () => {
  videoBatches.insert(db, { id: "vb_1", project_id: "p1", plan_id: "pln_1", plan_revision: 2, approval_id: null });
  expect(videoBatches.listByProject(db, "p1").map((b) => b.id)).toEqual(["vb_1"]);
  for (const [scene, item] of [["scn_10", "sp_010"], ["scn_2", "sp_002"]]) {
    scenes.create(db, { id: scene!, project_id: "p1", title: item! });
    videoScenes.insert(db, { project_id: "p1", plan_id: "pln_1", item_id: item!, scene_id: scene!, batch_id: "vb_1", job_id: null, item_fingerprint: "f1" });
  }
  expect(videoScenes.listByPlan(db, "pln_1").map((x) => x.item_id)).toEqual(["sp_002", "sp_010"]);
  expect(() => videoScenes.insert(db, { project_id: "p1", plan_id: "pln_1", item_id: "sp_002", scene_id: "scn_2", batch_id: null, job_id: null, item_fingerprint: "f" })).toThrow(/UNIQUE|PRIMARY/);
  const j = enqueue(db, { type: "playground.generate", projectId: "p1", sceneId: "scn_2", input: {}, idempotencyKey: "k" }).job;
  videoScenes.setJob(db, "scn_2", j.id, "f2");
  expect(videoScenes.bySceneId(db, "scn_2")).toMatchObject({ job_id: j.id, item_fingerprint: "f2" });
  expect(videoScenes.setFingerprint(db, "scn_2", "f3")).toBe(1);
  expect(videoScenes.get(db, "pln_1", "sp_002")!.item_fingerprint).toBe("f3");
  expect(() => videoScenes.setJob(db, "scn_nope", j.id)).toThrow();
});

it("таймлайн: один на проект, ревизии вперёд; финал ссылается на ревизию; папка клипов", () => {
  videoTimelines.create(db, { id: "tml_1", project_id: "p1" });
  expect(() => videoTimelines.create(db, { id: "tml_2", project_id: "p1" })).toThrow(/UNIQUE/);
  videoTimelines.insertRevision(db, { timeline_id: "tml_1", revision: 2, parent_revision: 1, rel_path: "x/r2/timeline.json", sha256: SHA, hash: SHA });
  videoTimelines.insertRevision(db, { timeline_id: "tml_1", revision: 1, parent_revision: null, rel_path: "x/r1/timeline.json", sha256: SHA, hash: SHA });
  expect(videoTimelines.byProject(db, "p1")!.current_revision).toBe(2);
  const req = { resolution: "1080p", quality: "standard", audio_bitrate_kbps: 192 } as const;
  const f = finalExports.insert(db, { id: "fx_1", project_id: "p1", timeline_id: "tml_1", timeline_revision: 2, approval_id: null, request: req, inputs_hash: SHA, rel_path: "x/final/fx_1", sha256: SHA, status: "ready", job_id: null });
  expect(f.request).toEqual(req);
  expect(finalExports.listByProject(db, "p1").map((x) => x.id)).toEqual(["fx_1"]);
  // ревизии 3 нет — внешний ключ на (timeline_id, revision)
  expect(() => finalExports.insert(db, { ...f, id: "fx_2", timeline_revision: 3 })).toThrow(/FOREIGN KEY/);
  expect(() => finalExports.insert(db, { ...f, id: "fx_3", status: "broken" as never })).toThrow(/CHECK/);
  videoPackages.insert(db, { id: "vpk_1", project_id: "p1", job_id: null, rel_path: "x/packages/vpk_1", manifest_sha256: SHA });
  expect(videoPackages.listByProject(db, "p1").map((x) => x.id)).toEqual(["vpk_1"]);
});
