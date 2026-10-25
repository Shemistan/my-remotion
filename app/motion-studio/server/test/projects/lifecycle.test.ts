// Переименование и архив проекта (Task 47): название 1–120 символов после trim, архивный проект
// скрыт из списка по умолчанию и задач не принимает (`project_archived`), архив занятого — 409.
import { afterEach, beforeEach, expect, it } from "vitest";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import { archiveProject, lifecycleOf, listProjects, renameProject, unarchiveProject } from "../../src/projects/lifecycle.js";
import { enqueue } from "../../src/jobs/queue.js";
import { retryJob } from "../../src/jobs/retry.js";
import { SqliteProcessRegistry } from "../../src/jobs/process-registry.js";
import { type Env, cancelAll, genJob, seedProject, setup, teardown } from "./helpers.js";

let env: Env;
beforeEach(async () => {
  env = await setup("ms-proj-life-");
  seedProject(env, "p1", "Мой ролик");
  seedProject(env, "p2", "Второй", "script");
});
afterEach(async () => teardown(env));

it("rename: trim, 1–120 символов, иначе invalid_title", () => {
  expect(renameProject(env.db, "p1", "  Новое имя  ").title).toBe("Новое имя");
  expect(projects.get(env.db, "p1")!.title).toBe("Новое имя");
  expect(() => renameProject(env.db, "p1", "   ")).toThrow(/invalid_title/);
  expect(() => renameProject(env.db, "p1", "x".repeat(121))).toThrow(/invalid_title/);
  expect(renameProject(env.db, "p1", "y".repeat(120)).title).toHaveLength(120);
  expect(() => renameProject(env.db, "nope", "x")).toThrow(/project_not_found/);
});

it("archive: скрыт из списка по умолчанию, задачи не ставятся; unarchive возвращает", () => {
  const dto = archiveProject(env.db, "p2");
  expect(dto.archived_at).not.toBeNull();
  expect(listProjects(env.db, "active").map((p) => p.id)).not.toContain("p2");
  expect(listProjects(env.db, "archived").map((p) => p.id)).toEqual(["p2"]);
  expect(() => enqueue(env.db, genJob("p2"))).toThrow(/project_archived/);
  // повтор архивации — без ошибки, время прежнее
  expect(archiveProject(env.db, "p2").archived_at).toBe(dto.archived_at);
  unarchiveProject(env.db, "p2");
  expect(lifecycleOf(env.db, "p2")!.archived_at).toBeNull();
  expect(enqueue(env.db, genJob("p2")).created).toBe(true);
});

it("archive занятого проекта (идущая задача сценарного пакета) — project_busy с id задач", () => {
  const { job } = enqueue(env.db, genJob("p2"));
  let err: unknown;
  try {
    archiveProject(env.db, "p2");
  } catch (e) {
    err = e;
  }
  expect(String(err)).toMatch(/project_busy/);
  expect((err as { extra: { job_ids: string[] } }).extra.job_ids).toEqual([job.id]);
  cancelAll(env.db, "p2");
  expect(archiveProject(env.db, "p2").archived_at).not.toBeNull();
});

it("Playground по умолчанию не архивируется (project_protected), но переименовывается", () => {
  expect(() => archiveProject(env.db, "playground")).toThrow(/project_protected/);
  expect(renameProject(env.db, "playground", "Песочница").title).toBe("Песочница");
});

it("повтор упавшей задачи архивного проекта — project_archived", async () => {
  const { job } = enqueue(env.db, genJob("p1"));
  jobs.update(env.db, job.id, { status: "failed", error: { code: "pipeline", stage: "render", message: "x" } });
  archiveProject(env.db, "p1");
  await expect(retryJob(env.db, job.id, new SqliteProcessRegistry(env.db))).rejects.toThrow(/project_archived/);
});

it("идемпотентный повтор уже поставленной задачи архивного проекта отдаёт ту же задачу", () => {
  const req = genJob("p1", "same-key");
  const { job } = enqueue(env.db, req);
  jobs.update(env.db, job.id, { status: "completed", finished_at: new Date().toISOString() });
  archiveProject(env.db, "p1");
  expect(enqueue(env.db, req)).toMatchObject({ created: false, job: { id: job.id } });
});
