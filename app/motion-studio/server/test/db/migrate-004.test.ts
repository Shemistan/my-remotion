// Task 29: миграция 004_phase1_kind — проекты Phase 1, созданные через UI до Task 29, получили
// `kind = 'video'` (умолчание репозитория) и открылись бы как Video Workspace. 004 переводит в
// `playground` только проекты со сценами и без исходника; остальные не трогает.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { makeStore, removeStore, type TestStore } from "./helpers.js";
import { asset } from "./video-fixtures.js";

const quiet = { log: () => undefined };
const sql = (f: string) => readFileSync(new URL(`../../src/db/migrations/${f}`, import.meta.url), "utf8");

let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-db-migrate4-");
  db = openDb(s.root);
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

const insertProject = (id: string, kind: "video" | "playground") =>
  db.prepare("INSERT INTO projects (id, kind, title, created_at, updated_at) VALUES (?, ?, ?, 'now', 'now')").run(id, kind, id);
const kindOf = (id: string) => (db.prepare("SELECT kind FROM projects WHERE id = ?").get(id) as { kind: string }).kind;

describe("004_phase1_kind", () => {
  it("v3 → v4: видео со сценами и без исходника → playground; с исходником и пустые — как были", async () => {
    for (const [f, v] of [["001_phase1.sql", 1], ["002_resource_locks.sql", 2], ["003_video.sql", 3]] as const) {
      db.exec(sql(f));
      db.pragma(`user_version = ${v}`);
    }
    insertProject("prj_scenes", "video");
    scenes.create(db, { id: "scn_a", project_id: "prj_scenes", title: "a" });
    scenes.create(db, { id: "scn_b", project_id: "prj_scenes", title: "b" });
    insertProject("prj_media", "video");
    media.insert(db, asset({ id: "med_1", project_id: "prj_media" }));
    insertProject("prj_both", "video");
    scenes.create(db, { id: "scn_c", project_id: "prj_both", title: "c" });
    media.insert(db, asset({ id: "med_2", project_id: "prj_both" }));
    insertProject("prj_empty", "video");

    const r = await migrate(db, quiet);
    expect(r).toMatchObject({ from: 3, to: 6, backup: expect.stringMatching(/studio\.db\.bak-v3-/) });
    expect(kindOf("prj_scenes")).toBe("playground");
    expect(kindOf("prj_media")).toBe("video");
    expect(kindOf("prj_both")).toBe("video");
    expect(kindOf("prj_empty")).toBe("video");
    expect(kindOf("playground")).toBe("playground");
    expect(scenes.listByProject(db, "prj_scenes").map((x) => x.id).sort()).toEqual(["scn_a", "scn_b"]);
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });

  it("новая запись без kind — playground (умолчание репозитория)", async () => {
    await migrate(db, quiet);
    expect(projects.create(db, { title: "Сцены" }).kind).toBe("playground");
    expect(projects.create(db, { title: "Видео", kind: "video" }).kind).toBe("video");
  });
});
