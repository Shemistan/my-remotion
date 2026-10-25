// Task 35′ (Phase 4–6 v2): миграция 006_video_production — типы задач Phase 4–6, approvals с
// subject_key (rowid сохранён: порядок latestActive), projects.archived_at/deleted_at, таблицы
// видеосцен, таймлайна, финала, корзины и отчётов старта.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as approvals from "../../src/db/repos/approvals.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as plans from "../../src/db/repos/plans.js";
import * as projects from "../../src/db/repos/projects.js";
import { scriptBatches } from "../../src/db/repos/script.js";
import { enqueue } from "../../src/jobs/queue.js";
import { makeStore, removeStore, type TestStore } from "./helpers.js";

const quiet = { log: () => undefined };
const sql = (f: string) => readFileSync(new URL(`../../src/db/migrations/${f}`, import.meta.url), "utf8");
const FILES = ["001_phase1.sql", "002_resource_locks.sql", "003_video.sql", "004_phase1_kind.sql", "005_script.sql"];
const H = (c: string) => c.repeat(64);

/** База версии 5 (до 006), FK выключены на время пересборок — как в migrate(). */
function upTo5(db: Db): void {
  db.pragma("foreign_keys = OFF");
  FILES.forEach((f, i) => {
    db.exec(sql(f));
    db.pragma(`user_version = ${i + 1}`);
  });
  db.pragma("foreign_keys = ON");
}

/** Approval напрямую в таблицу v5 (без subject_key) — `decided_at` задан явно. */
function rawApproval(db: Db, id: string, kind: string, ref: string, decided: string, status = "valid"): void {
  db.prepare("INSERT INTO approvals (id, project_id, kind, subject_ref, subject_hash, status, stale_reason, decided_at) VALUES (?, 'p1', ?, ?, ?, ?, NULL, ?)")
    .run(id, kind, ref, H("a"), status, decided);
}

const count = (db: Db, t: string) => db.prepare(`SELECT count(*) FROM ${t}`).pluck().get() as number;

let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-db-migrate6-");
  db = openDb(s.root);
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

describe("006_video_production", () => {
  it("v5 с задачами и approvals → 6 без потерь: rowid и порядок latestActive сохранены, FK целы", async () => {
    upTo5(db);
    projects.create(db, { id: "p1", kind: "video", title: "Видео" });
    plans.create(db, { id: "pln_1", project_id: "p1" });
    const j1 = enqueue(db, { type: "plan.visual", projectId: "p1", input: { projectId: "p1" }, idempotencyKey: "k1" }).job;
    // часы машины шли назад: rowid-порядок ≠ порядку decided_at
    rawApproval(db, "apr_b1", "B", "plan:pln_1@r1", "2026-10-25T10:00:00.000Z", "revoked");
    rawApproval(db, "apr_b2", "B", "plan:pln_1@r2", "2026-10-25T09:00:00.000Z");
    rawApproval(db, "apr_a1", "A", "edl:edl_1@r3", "2026-10-25T08:00:00.000Z");
    scriptBatches.insert(db, { id: "sb_1", project_id: "p1", plan_id: "pln_1", plan_revision: 2, aspect: "16:9", approval_id: "apr_b2" });
    const rowids = db.prepare("SELECT id, rowid FROM approvals ORDER BY rowid").all();
    const latestB = approvals.latestActive(db, "p1", "B");
    const nJobs = count(db, "jobs");
    const nApprovals = count(db, "approvals");

    expect(await migrate(db, quiet)).toMatchObject({ from: 5, to: 6 });
    expect(db.pragma("user_version", { simple: true })).toBe(6);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(count(db, "jobs")).toBe(nJobs);
    expect(count(db, "approvals")).toBe(nApprovals);
    expect(jobs.get(db, j1.id)).toEqual(j1);
    expect(db.prepare("SELECT id, rowid FROM approvals ORDER BY rowid").all()).toEqual(rowids);
    expect(approvals.latestActive(db, "p1", "B")).toEqual(latestB);
    expect(latestB!.id).toBe("apr_b2");
    expect(db.prepare("SELECT id, subject_key FROM approvals ORDER BY rowid").all()).toEqual([
      { id: "apr_b1", subject_key: "plan:pln_1" }, { id: "apr_b2", subject_key: "plan:pln_1" }, { id: "apr_a1", subject_key: "edl:edl_1" },
    ]);
    // ссылка script_batches.approval_id — на пересобранную таблицу
    expect(scriptBatches.get(db, "sb_1")!.approval_id).toBe("apr_b2");
    expect(() => scriptBatches.insert(db, { id: "sb_2", project_id: "p1", plan_id: "pln_1", plan_revision: 2, aspect: "16:9", approval_id: "apr_nope" })).toThrow(/FOREIGN KEY/);
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('jobs', 'approvals')").pluck().all() as string[];
    expect(idx).toEqual(expect.arrayContaining(["jobs_status", "jobs_scene", "jobs_project", "approvals_project", "approvals_subject"]));
    // projects: новые колонки пустые, строки на месте
    expect(db.prepare("SELECT archived_at, deleted_at FROM projects WHERE id = 'p1'").get()).toEqual({ archived_at: null, deleted_at: null });
  });

  it("типы задач Phase 4–6 проходят CHECK, production.* — нет; причины устаревания C/final", async () => {
    await migrate(db, quiet);
    projects.create(db, { id: "p1", kind: "video", title: "v" });
    for (const [i, type] of (["video.package", "timeline.build", "final.render", "trash.purge", "cache.gc"] as const).entries()) {
      expect(enqueue(db, { type, projectId: "p1", input: { projectId: "p1" }, idempotencyKey: `k${i}` }).job.type).toBe(type);
    }
    expect(() => db.prepare("UPDATE jobs SET type = 'production.generate'").run()).toThrow(/CHECK/);
    approvals.insert(db, { id: "apr_1", project_id: "p1", kind: "C", subject_ref: "scene:scn_1@r1", subject_hash: H("a"), status: "valid", decided_at: "2026-10-25T00:00:00.000Z" });
    expect(db.prepare("SELECT subject_key FROM approvals WHERE id = 'apr_1'").pluck().get()).toBe("scene:scn_1");
    expect(() => db.prepare("UPDATE approvals SET status = 'stale', stale_reason = 'version_changed' WHERE id = 'apr_1'").run()).not.toThrow();
    expect(() => db.prepare("UPDATE approvals SET stale_reason = 'nope' WHERE id = 'apr_1'").run()).toThrow(/CHECK/);
  });

  it("таблицы Phase 4–6 и статус финала", async () => {
    await migrate(db, quiet);
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all() as string[];
    for (const t of ["video_batches", "video_scenes", "video_packages", "video_timelines", "video_timeline_revisions", "final_exports", "trash", "boot_reports"]) {
      expect(names, t).toContain(t);
    }
    const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    expect(cols("final_exports")).toEqual(expect.arrayContaining(["status", "request_json", "inputs_hash", "approval_id"]));
    expect(cols("projects")).toEqual(["id", "kind", "title", "settings_json", "created_at", "updated_at", "archived_at", "deleted_at"]);
  });

  it("лишняя колонка approvals — отказ до копии, база v5 не изменилась", async () => {
    upTo5(db);
    db.exec("ALTER TABLE approvals ADD COLUMN extra TEXT");
    await expect(migrate(db, quiet)).rejects.toThrow(/схема approvals не та/);
    expect(db.pragma("user_version", { simple: true })).toBe(5);
  });
});
