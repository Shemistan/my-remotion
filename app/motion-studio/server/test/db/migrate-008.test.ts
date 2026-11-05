// Миграция 008_project_download: новый тип задачи, строки jobs и ссылки на них сохраняются.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import { makeStore, removeStore, type TestStore } from "./helpers.js";

const sql = (f: string) => readFileSync(new URL(`../../src/db/migrations/${f}`, import.meta.url), "utf8");
const FILES = ["001_phase1.sql", "002_resource_locks.sql", "003_video.sql", "004_phase1_kind.sql", "005_script.sql", "006_video_production.sql", "007_process_owner.sql"];
const INSERT = "INSERT INTO jobs (id, type, project_id, status, input_refs_json, created_at) VALUES (?, ?, 'p1', 'completed', '{}', 't')";

let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-db-migrate8-");
  db = openDb(s.root);
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

it("v7 → v8: задачи на месте, FK целы, project.download принимается, чужой тип — нет", async () => {
  db.pragma("foreign_keys = OFF");
  FILES.forEach((f, i) => {
    db.exec(sql(f));
    db.pragma(`user_version = ${i + 1}`);
  });
  db.pragma("foreign_keys = ON");
  db.prepare("INSERT INTO projects (id, kind, title, created_at, updated_at) VALUES ('p1', 'playground', 'П', 't', 't')").run();
  db.prepare(INSERT).run("job_1", "scene.export");
  expect(() => db.prepare(INSERT).run("job_dl0", "project.download")).toThrow(/CHECK/);

  expect(await migrate(db, { log: () => undefined })).toMatchObject({ from: 7, to: 8 });
  expect(db.prepare("SELECT type FROM jobs WHERE id = 'job_1'").pluck().get()).toBe("scene.export");
  db.prepare(INSERT).run("job_dl", "project.download");
  expect(() => db.prepare(INSERT).run("job_x", "project.other")).toThrow(/CHECK/);
  expect(db.pragma("foreign_key_check")).toEqual([]);
});
