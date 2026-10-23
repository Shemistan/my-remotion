// Task 24: миграция 003_video — таблицы видеопроекта и типы задач Phase 2–3 в `jobs`.
// (План называл её 002_video; номер 002 занят 002_resource_locks Phase 1.)
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as media from "../../src/db/repos/media.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as transcripts from "../../src/db/repos/transcripts.js";
import * as edls from "../../src/db/repos/edls.js";
import * as plans from "../../src/db/repos/plans.js";
import * as styles from "../../src/db/repos/styles.js";
import * as footage from "../../src/db/repos/footage.js";
import * as semantic from "../../src/db/repos/semantic.js";
import { enqueue } from "../../src/jobs/queue.js";
import { makeStore, removeStore, type TestStore } from "./helpers.js";
import { SHA, asset } from "./video-fixtures.js";

const sql = (f: string) => readFileSync(new URL(`../../src/db/migrations/${f}`, import.meta.url), "utf8");

let s: TestStore;
let db: Db;
beforeEach(async () => {
  s = await makeStore("ms-db-migrate3-");
  db = openDb(s.root);
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

describe("003_video", () => {
  it("база версии 2 (Phase 1) доводится до 3; данные jobs и ссылки на них сохраняются", () => {
    db.exec(sql("001_phase1.sql"));
    db.pragma("user_version = 1");
    db.exec(sql("002_resource_locks.sql"));
    db.pragma("user_version = 2");
    scenes.create(db, { id: "scn_1", project_id: "playground", title: "x" });
    const j = enqueue(db, { type: "playground.generate", projectId: "playground", sceneId: "scn_1", input: { a: 1 }, idempotencyKey: "k1" }).job;
    db.prepare("INSERT INTO job_events (job_id, ts, level, kind, message) VALUES (?, ?, 'info', 'x', 'y')").run(j.id, new Date().toISOString());
    db.prepare("INSERT INTO resource_locks (resource, job_id, acquired_at) VALUES ('r', ?, 'now')").run(j.id);

    expect(migrate(db)).toEqual({ from: 2, to: 3 });
    expect(jobs.get(db, j.id)).toEqual(j);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    // FK детей по-прежнему указывают на jobs
    expect(() => db.prepare("INSERT INTO job_events (job_id, ts, level, kind, message) VALUES ('nope', 'now', 'info', 'x', 'y')").run()).toThrow(/FOREIGN KEY/);
    const idx = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'jobs'").pluck().all() as string[]);
    expect(idx).toEqual(expect.arrayContaining(["jobs_status", "jobs_scene"]));
  });

  it("типы задач Phase 2–3 проходят CHECK jobs.type", () => {
    migrate(db);
    projects.create(db, { id: "p1", kind: "video", title: "Видео" });
    for (const type of ["media.import", "asr.transcribe", "roughcut.propose", "roughcut.preview", "footage.analyze", "semantic.analyze", "plan.visual", "plan.recheck"] as const) {
      expect(enqueue(db, { type, projectId: "p1", input: {}, idempotencyKey: type }).job.type).toBe(type);
    }
    expect(() => db.prepare("UPDATE jobs SET type = 'bogus'").run()).toThrow(/CHECK/);
  });

  it("таблицы видеопроекта", () => {
    migrate(db);
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all() as string[];
    for (const t of [
      "media_assets", "media_derivatives", "transcripts", "transcript_revisions", "transcript_words", "transcript_segments",
      "edls", "edl_revisions", "edit_decisions", "timelines", "timeline_clips", "approvals", "footage_analyses",
      "semantic_analyses", "semantic_chapters", "style_bibles", "style_revisions", "visual_plans", "visual_plan_revisions",
      "visual_opportunities", "scene_plans", "resource_locks",
    ]) expect(names, t).toContain(t);
  });

  it("сбой посреди 003 откатывается, внешние ключи включены обратно", () => {
    db.exec(sql("001_phase1.sql"));
    db.pragma("user_version = 1");
    db.exec(sql("002_resource_locks.sql"));
    db.pragma("user_version = 2");
    db.exec("CREATE TABLE approvals (x INTEGER)"); // конфликт с 003
    expect(() => migrate(db)).toThrow();
    expect(db.pragma("user_version", { simple: true })).toBe(2);
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(db.prepare("SELECT count(*) FROM sqlite_master WHERE name = 'media_assets'").pluck().get()).toBe(0);
    expect(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'jobs'").pluck().get()).not.toMatch(/media\.import/);
  });
});

describe("репозитории видеопроекта", () => {
  beforeEach(() => {
    migrate(db);
    projects.create(db, { id: "p1", kind: "video", title: "Видео" });
  });

  it("медиа: один исходник на проект; производные", () => {
    const a = asset();
    media.insert(db, a);
    expect(media.get(db, "med_1")).toEqual(a);
    expect(media.byProject(db, "p1")).toEqual(a);
    expect(() => media.insert(db, asset({ project_id: "p1", id: "med_2" }))).toThrow(/UNIQUE/); // второй исходник в проект
    media.setDerivative(db, "med_1", { kind: "proxy", rel_path: "workspace/projects/p1/proxy/med_1/proxy.mp4", sha256: SHA, params: { short: 720 } });
    media.setDerivative(db, "med_1", { kind: "proxy", rel_path: "workspace/projects/p1/proxy/med_1/proxy2.mp4", sha256: SHA, params: { short: 720 } });
    expect(media.derivatives(db, "med_1")).toEqual([{ kind: "proxy", rel_path: "workspace/projects/p1/proxy/med_1/proxy2.mp4", sha256: SHA, params: { short: 720 } }]);
  });

  it("транскрипт: ревизия со словами и сегментами, current_revision", () => {
    media.insert(db, asset());
    transcripts.create(db, { id: "trn_1", project_id: "p1", media_id: "med_1", language: "ru" });
    const word = (id: string, t: string, a: number) => ({ id, text: t, start_us: a, end_us: a + 100_000, timing: "asr" as const, confidence: null });
    const doc = {
      schema_version: 1 as const, transcript_id: "trn_1", revision: 1, media_sha256: SHA, language: "ru", author: "asr" as const,
      words: [word("w_000001", "Привет", 0), word("w_000002", "мир", 200_000)],
      segments: [{ id: "seg_0001", word_ids: ["w_000001", "w_000002"], start_us: 0, end_us: 300_000 }],
      removed_word_ids: [],
    };
    transcripts.insertRevision(db, { doc, rel_path: "workspace/projects/p1/transcript/trn_1/r1", sha256: SHA });
    expect(transcripts.get(db, "trn_1")).toMatchObject({ current_revision: 1 });
    expect(transcripts.words(db, "trn_1", 1).map((w) => w.word_id)).toEqual(["w_000001", "w_000002"]);
    expect(() => transcripts.insertRevision(db, { doc, rel_path: "x", sha256: SHA })).toThrow(/UNIQUE|PRIMARY/);
  });

  it("EDL: ревизия, решения, таймлайн", () => {
    media.insert(db, asset());
    transcripts.create(db, { id: "trn_1", project_id: "p1", media_id: "med_1", language: "ru" });
    edls.create(db, { id: "edl_1", project_id: "p1", media_id: "med_1", transcript_id: "trn_1" });
    const doc = {
      schema_version: 1 as const, edl_id: "edl_1", revision: 1, media_id: "med_1", media_sha256: SHA, transcript_id: "trn_1",
      timeline_fps: { num: 30, den: 1 },
      decisions: [{ id: "d1", reason: "pause" as const, origin: "detector" as const, status: "accepted" as const, source_start_us: 1_000_000, source_end_us: 2_000_000, confidence: 0.9, explanation: "пауза" }],
    };
    const timeline = { fps: { num: 30, den: 1 }, source_duration_us: 10_000_000, duration_us: 9_000_000, clips: [
      { idx: 0, source_start_us: 0, source_end_us: 1_000_000, edited_start_us: 0 },
      { idx: 1, source_start_us: 2_000_000, source_end_us: 10_000_000, edited_start_us: 1_000_000 }] };
    edls.insertRevision(db, { doc, rel_path: "workspace/projects/p1/edits/edl_1/r1", sha256: SHA, hash: SHA, timeline });
    expect(edls.get(db, "edl_1")).toMatchObject({ current_revision: 1 });
    expect(edls.byProject(db, "p1")?.id).toBe("edl_1");
    expect(edls.revision(db, "edl_1", 1)).toMatchObject({ hash: SHA, rel_path: "workspace/projects/p1/edits/edl_1/r1" });
    expect(edls.timeline(db, "edl_1", 1)).toEqual(timeline);
    expect(edls.decisions(db, "edl_1", 1)).toEqual([expect.objectContaining({ decision_id: "d1", status: "accepted" })]);
  });

  it("стиль, план, footage, semantic: индексы ревизий", () => {
    media.insert(db, asset());
    styles.create(db, { id: "sty_1", project_id: "p1" });
    styles.insertRevision(db, { style_id: "sty_1", revision: 1, rel_path: "workspace/projects/p1/style/sty_1/r1", sha256: SHA, hash: SHA, author: "agent" });
    expect(styles.get(db, "sty_1")).toMatchObject({ current_revision: 1 });
    expect(styles.revision(db, "sty_1", 1)).toMatchObject({ hash: SHA });
    plans.create(db, { id: "pln_1", project_id: "p1" });
    plans.insertRevision(db, { plan_id: "pln_1", revision: 1, rel_path: "workspace/projects/p1/plan/pln_1/r1", sha256: SHA, hash: SHA, items: [], opportunities: [] });
    expect(plans.byProject(db, "p1")).toMatchObject({ id: "pln_1", current_revision: 1 });
    footage.insert(db, { id: "ftg_1", project_id: "p1", media_id: "med_1", mode: "vision", rel_path: "workspace/projects/p1/analysis/footage/ftg_1", sha256: SHA });
    expect(footage.latest(db, "p1")).toMatchObject({ id: "ftg_1", mode: "vision" });
    transcripts.create(db, { id: "trn_1", project_id: "p1", media_id: "med_1", language: "ru" });
    edls.create(db, { id: "edl_1", project_id: "p1", media_id: "med_1", transcript_id: "trn_1" });
    semantic.insert(db, {
      id: "sem_1", project_id: "p1", transcript_id: "trn_1", transcript_revision: 1, edl_id: "edl_1", edl_revision: 1,
      rel_path: "workspace/projects/p1/analysis/semantic/sem_1", sha256: SHA,
      chapters: [{ chapter_id: "ch_1", title: "Глава", start_word_id: "w_000001", end_word_id: "w_000002" }],
    });
    expect(semantic.latest(db, "p1")).toMatchObject({ id: "sem_1" });
    expect(semantic.chapters(db, "sem_1")).toHaveLength(1);
  });
});
