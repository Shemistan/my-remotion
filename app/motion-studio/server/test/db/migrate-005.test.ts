// S1 «сценарий → моушн»: миграция 005_script — kind 'script', типы задач script.*, таблицы сценария.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { enqueue } from "../../src/jobs/queue.js";
import { makeStore, removeStore, type TestStore } from "./helpers.js";

const quiet = { log: () => undefined };
const sql = (f: string) => readFileSync(new URL(`../../src/db/migrations/${f}`, import.meta.url), "utf8");
const FILES = ["001_phase1.sql", "002_resource_locks.sql", "003_video.sql", "004_phase1_kind.sql"];

/** База версии 4 (до 005), FK выключены на время пересборок — как в migrate(). */
function upTo4(db: Db): void {
  db.pragma("foreign_keys = OFF");
  FILES.forEach((f, i) => {
    db.exec(sql(f));
    db.pragma(`user_version = ${i + 1}`);
  });
  db.pragma("foreign_keys = ON");
}

const jobsCount = (db: Db) => db.prepare("SELECT count(*) FROM jobs").pluck().get() as number;

let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-db-migrate5-");
  db = openDb(s.root);
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

describe("005_script", () => {
  it("база v4 с проектами и задачами доводится до 5 без потерь; FK целы", async () => {
    upTo4(db);
    const v = projects.create(db, { id: "p_video", kind: "video", title: "Видео" });
    scenes.create(db, { id: "scn_1", project_id: "playground", title: "x" });
    const j1 = enqueue(db, { type: "playground.generate", projectId: "playground", sceneId: "scn_1", input: { a: 1 }, idempotencyKey: "k1" }).job;
    const j2 = enqueue(db, { type: "plan.visual", projectId: v.id, input: { projectId: v.id }, idempotencyKey: "k2" }).job;
    db.prepare("INSERT INTO job_events (job_id, ts, level, kind, message) VALUES (?, ?, 'info', 'x', 'y')").run(j1.id, new Date().toISOString());
    const before = jobsCount(db);
    const projectsBefore = projects.list(db);

    expect(await migrate(db, quiet)).toMatchObject({ from: 4, to: 6 });
    expect(db.pragma("user_version", { simple: true })).toBe(6);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(jobsCount(db)).toBe(before);
    expect(jobs.get(db, j1.id)).toEqual(j1);
    expect(jobs.get(db, j2.id)).toEqual(j2);
    expect(projects.list(db)).toEqual(projectsBefore);
    // ссылки детей по-прежнему на projects и jobs
    expect(() => scenes.create(db, { id: "scn_x", project_id: "nope", title: "x" })).toThrow(/FOREIGN KEY/);
    expect(() => db.prepare("INSERT INTO job_events (job_id, ts, level, kind, message) VALUES ('nope', 'now', 'info', 'x', 'y')").run()).toThrow(/FOREIGN KEY/);
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'jobs'").pluck().all() as string[];
    expect(idx).toEqual(expect.arrayContaining(["jobs_status", "jobs_scene", "jobs_project"]));
  });

  it("kind 'script' проходит CHECK, неизвестный — нет; задачи script.* ставятся", async () => {
    await migrate(db, quiet);
    const p = projects.create(db, { kind: "script", title: "s" });
    expect(p.kind).toBe("script");
    expect(() => db.prepare("INSERT INTO projects (id, kind, title, created_at, updated_at) VALUES ('x','nope','t','2026-10-24T00:00:00.000Z','2026-10-24T00:00:00.000Z')").run()).toThrow(/CHECK/);
    expect(enqueue(db, { type: "script.plan", projectId: p.id, input: { projectId: p.id }, idempotencyKey: "k" }).job.type).toBe("script.plan");
    expect(enqueue(db, { type: "script.package", projectId: p.id, input: { projectId: p.id, aspect: "16:9" }, idempotencyKey: "k2" }).job.type).toBe("script.package");
    expect(() => db.prepare("UPDATE jobs SET type = 'bogus'").run()).toThrow(/CHECK/);
  });

  it("лишняя колонка projects — отказ до копии, база v4 не изменилась", async () => {
    upTo4(db);
    db.exec("ALTER TABLE projects ADD COLUMN extra TEXT");
    await expect(migrate(db, quiet)).rejects.toThrow(/схема projects не та/);
    expect(db.pragma("user_version", { simple: true })).toBe(4);
  });

  it("таблицы сценария", async () => {
    await migrate(db, quiet);
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all() as string[];
    for (const t of ["scripts", "script_revisions", "script_batches", "script_scenes", "script_packages"]) expect(names, t).toContain(t);
  });
});
