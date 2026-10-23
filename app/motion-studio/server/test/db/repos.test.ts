import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultSettings } from "@ms/contracts";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import { tx } from "../../src/db/tx.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import * as versions from "../../src/db/repos/versions.js";
import * as chat from "../../src/db/repos/chat.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as jobEvents from "../../src/db/repos/job-events.js";
import * as sceneLocks from "../../src/db/repos/scene-locks.js";
import * as agentRuns from "../../src/db/repos/agent-runs.js";
import * as renderJobs from "../../src/db/repos/render-jobs.js";
import * as qaReports from "../../src/db/repos/qa-reports.js";
import * as knowledgeRefs from "../../src/db/repos/knowledge-refs.js";
import * as exportsRepo from "../../src/db/repos/exports.js";
import * as componentTests from "../../src/db/repos/component-tests.js";
import * as jobProcesses from "../../src/db/repos/job-processes.js";
import { makeStore, removeStore, type TestStore } from "./helpers.js";

let s: TestStore;
let db: Db;
const sha = "c".repeat(64);
const job = { id: "job_1", type: "playground.generate" as const, project_id: "playground", scene_id: "scn_1", input: { prompt: "p" } };

function version(id: string, number: number, status: "ready" | "failed" = "ready") {
  return {
    id, scene_id: "scn_1", parent_version_id: null, number, status, prompt: "p", edit_plan: null,
    settings: defaultSettings(), path: `workspace/projects/playground/scenes/scn_1/versions/${id}`,
    manifest_sha256: sha, created_by_job_id: null, created_at: "2026-10-21T00:00:00.000Z",
  };
}

beforeEach(async () => {
  s = await makeStore("ms-db-repos-");
  db = openDb(s.root);
  await migrate(db);
  scenes.create(db, { id: "scn_1", project_id: "playground", title: "Сцена" });
});
afterEach(async () => {
  db.close();
  await removeStore(s);
});

describe("projects и scenes", () => {
  it("create/get/list", () => {
    const p = projects.create(db, { title: "Видео", settings: defaultSettings() });
    expect(p).toMatchObject({ kind: "video", title: "Видео", settings: defaultSettings() });
    expect(p.id).toMatch(/^prj_/);
    expect(projects.get(db, p.id)).toEqual(p);
    expect(projects.list(db).map((x) => x.id)).toEqual(["playground", p.id]);
    expect(projects.get(db, "nope")).toBeUndefined();
  });
  it("сцена: listByProject, setCurrent, FK на проект", () => {
    const sc = scenes.create(db, { project_id: "playground", title: "Вторая" });
    expect(sc.id).toMatch(/^scn_/);
    expect(scenes.listByProject(db, "playground").map((x) => x.id)).toEqual(["scn_1", sc.id]);
    expect(() => scenes.create(db, { project_id: "prj_nope", title: "x" })).toThrow(/FOREIGN KEY/);
    versions.insert(db, version("ver_1", 1));
    scenes.setCurrent(db, "scn_1", "ver_1");
    expect(scenes.get(db, "scn_1")!.current_version_id).toBe("ver_1");
    expect(() => scenes.setCurrent(db, "scn_1", "ver_nope")).toThrow(/FOREIGN KEY/);
  });

  it("служебные проекты харнесса: bench-<run> и старый префикс прогонов до переименования", () => {
    expect(projects.isBenchProject("bench-s5-e0d174b")).toBe(true);
    expect(projects.isBenchProject("eval-s3-6ef1f76")).toBe(true);
    expect(projects.isBenchProject("prj_abc")).toBe(false);
    expect(projects.isBenchProject("playground")).toBe(false);
  });
});

describe("versions", () => {
  it("insert/get/listByScene/nextNumber, номер уникален в сцене", () => {
    expect(versions.nextNumber(db, "scn_1")).toBe(1);
    versions.insert(db, version("ver_1", 1));
    versions.insert(db, { ...version("ver_2", 2, "failed"), parent_version_id: "ver_1", edit_plan: { kind: "restore", base_version_id: "ver_1" } });
    expect(versions.nextNumber(db, "scn_1")).toBe(3);
    expect(versions.get(db, "ver_2")).toMatchObject({ status: "failed", parent_version_id: "ver_1", edit_plan: { kind: "restore" }, settings: defaultSettings() });
    expect(versions.listByScene(db, "scn_1").map((v) => v.number)).toEqual([1, 2]);
    expect(() => versions.insert(db, version("ver_3", 2))).toThrow(/UNIQUE/);
  });
});

describe("chat", () => {
  it("add/list по порядку", () => {
    const a = chat.add(db, { scene_id: "scn_1", role: "user", text: "медленнее" });
    const b = chat.add(db, { scene_id: "scn_1", role: "assistant", text: "ок", job_id: undefined });
    expect(a.id).toMatch(/^msg_/);
    expect(a).not.toHaveProperty("version_id");
    expect(chat.list(db, "scn_1").map((m) => m.id)).toEqual([a.id, b.id]);
  });
});

describe("jobs", () => {
  it("insert с умолчаниями, get, idempotency_key UNIQUE, findByIdempotencyKey", () => {
    expect(() => jobs.insert(db, { ...job, idempotency_key: "k1" })).not.toThrow();
    expect(() => jobs.insert(db, { ...job, id: "job_2", idempotency_key: "k1" })).toThrow(/UNIQUE/);
    const j = jobs.get(db, "job_1")!;
    expect(j).toMatchObject({ status: "pending", attempt: 0, max_attempts: 3, interrupts: 0, progress: 0, cancel_requested: false, input: { prompt: "p" }, error: null });
    expect(jobs.findByIdempotencyKey(db, "k1")!.id).toBe("job_1");
    expect(jobs.findByIdempotencyKey(db, "k2")).toBeUndefined();
  });
  it("update меняет поля и проверяет схему", () => {
    jobs.insert(db, job);
    const u = jobs.update(db, "job_1", { status: "failed", attempt: 2, cancel_requested: true, error: { code: "pipeline", message: "x", stage: "qa" }, output_refs: { a: 1 } });
    expect(u).toMatchObject({ status: "failed", attempt: 2, cancel_requested: true, error: { code: "pipeline", stage: "qa" }, output_refs: { a: 1 } });
    expect(jobs.get(db, "job_1")).toEqual(u);
    expect(() => jobs.update(db, "job_1", { progress: 2 })).toThrow();
    expect(() => jobs.update(db, "job_nope", { attempt: 1 })).toThrow(/job_nope/);
  });
  it("list по статусу и сцене", () => {
    jobs.insert(db, job);
    jobs.insert(db, { ...job, id: "job_2", scene_id: null, type: "scene.export" });
    jobs.update(db, "job_2", { status: "running" });
    expect(jobs.list(db).map((j) => j.id)).toEqual(["job_1", "job_2"]);
    expect(jobs.list(db, { status: "running" }).map((j) => j.id)).toEqual(["job_2"]);
    expect(jobs.list(db, { sceneId: "scn_1" }).map((j) => j.id)).toEqual(["job_1"]);
  });
  it("tx откатывает всё при исключении", () => {
    expect(() => tx(db, () => {
      jobs.insert(db, job);
      throw new Error("boom");
    })).toThrow("boom");
    expect(jobs.get(db, "job_1")).toBeUndefined();
  });
});

describe("job_events, scene_locks, job_processes", () => {
  it("события монотонны, listSince", () => {
    jobs.insert(db, job);
    const e1 = jobEvents.insert(db, { job_id: "job_1", level: "info", kind: "stage", message: "director" });
    const e2 = jobEvents.insert(db, { job_id: "job_1", level: "warn", kind: "log", message: "x", data: { a: 1 } });
    expect(e2.id).toBeGreaterThan(e1.id);
    expect(jobEvents.listSince(db, 0).map((e) => e.id)).toEqual([e1.id, e2.id]);
    expect(jobEvents.listSince(db, e1.id)).toEqual([e2]);
    expect(e2.data).toEqual({ a: 1 });
    expect(e1).not.toHaveProperty("data");
  });
  it("замок сцены: один держатель", () => {
    jobs.insert(db, job);
    jobs.insert(db, { ...job, id: "job_2" });
    expect(sceneLocks.acquire(db, "scn_1", "job_1")).toBe(true);
    expect(sceneLocks.acquire(db, "scn_1", "job_1")).toBe(true);
    expect(sceneLocks.acquire(db, "scn_1", "job_2")).toBe(false);
    expect(sceneLocks.holder(db, "scn_1")).toBe("job_1");
    expect(sceneLocks.release(db, "scn_1", "job_2")).toBe(false);
    expect(sceneLocks.release(db, "scn_1", "job_1")).toBe(true);
    expect(sceneLocks.holder(db, "scn_1")).toBeUndefined();
    expect(sceneLocks.acquire(db, "scn_1", "job_2")).toBe(true);
  });
  it("реестр процессов: insert/end/listLive", () => {
    const p = { job_id: "job_1", attempt: 1, pid: 100, pgid: 100, started_at: "Mon Oct 21 01:00:00 2026", cmd: "claude -p" };
    jobProcesses.insert(db, p);
    jobProcesses.insert(db, { ...p, pid: 101, attempt: 2 });
    expect(jobProcesses.listLive(db).map((x) => x.pid)).toEqual([100, 101]);
    expect(jobProcesses.listLive(db, { jobId: "job_1", attempt: 2 }).map((x) => x.pid)).toEqual([101]);
    jobProcesses.end(db, p, { exit_code: 0 });
    expect(jobProcesses.listLive(db).map((x) => x.pid)).toEqual([101]);
  });
});

describe("agent_runs, render_jobs, qa_reports, knowledge_refs, exports, component_tests", () => {
  beforeEach(() => {
    jobs.insert(db, job);
    versions.insert(db, version("ver_1", 1));
  });
  it("agent_runs insert/finish", () => {
    agentRuns.insert(db, { id: "run_1", job_id: "job_1", role: "engineer", model: "opus", log_dir: "logs/x" });
    agentRuns.finish(db, "run_1", { status: "completed", input_tokens: 10, output_tokens: 5, cost_usd: 0.5, session_id: "s", permission_denials: [] });
    expect(db.prepare("SELECT status, cost_usd, finished_at IS NOT NULL AS done FROM agent_runs").get()).toEqual({ status: "completed", cost_usd: 0.5, done: 1 });
  });
  it("render_jobs, qa_reports, knowledge_refs", () => {
    renderJobs.insert(db, { job_id: "job_1", version_id: "ver_1", kind: "preview", codec: "h264", width: 960, height: 540, fps: { num: 30, den: 1 }, frames: 180, output_path: "preview.mp4" });
    qaReports.insert(db, { version_id: "ver_1", attempt: 1, technical: "pass", visual: "warn", semantic: "pass", style: "pass", report_path: "qa.json" });
    knowledgeRefs.insertMany(db, "ver_1", [{ kb_id: "a/b", repository: "a", repository_url: "u", commit: "c", license: "MIT", license_class: "permissive", strategy: "adapt", source_paths: ["x.tsx"] }]);
    expect(db.prepare("SELECT kb_id, license_class FROM knowledge_refs").all()).toEqual([{ kb_id: "a/b", license_class: "permissive" }]);
    expect(() => qaReports.insert(db, { version_id: "ver_1", attempt: 1, technical: "ok" as never, visual: "pass", semantic: "pass", style: "pass", report_path: "" })).toThrow(/CHECK/);
  });
  it("exports insert/get", () => {
    const e = exportsRepo.insert(db, { version_id: "ver_1", job_id: "job_1", format: "mp4", path: "exports/x.mp4", sha256: sha });
    expect(e.id).toMatch(/^exp_/);
    expect(exportsRepo.get(db, e.id)).toEqual(e);
  });
  it("component_tests upsert: rendered-ok | rendered-fail", () => {
    componentTests.upsert(db, { kb_id: "a/b", remotion_version: "4.0.537", result: "rendered-fail", version_id: "ver_1" });
    componentTests.upsert(db, { kb_id: "a/b", remotion_version: "4.0.537", result: "rendered-ok", version_id: "ver_1" });
    expect(db.prepare("SELECT result FROM component_tests").all()).toEqual([{ result: "rendered-ok" }]);
    expect(() => componentTests.upsert(db, { kb_id: "a/b", remotion_version: "4", result: "ok" as never, version_id: null })).toThrow(/CHECK/);
  });
});
