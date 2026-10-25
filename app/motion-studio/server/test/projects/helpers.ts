// Общее для тестов управления проектами (Task 47): tmp-хранилище с миграциями, проекты разных
// видов с каталогами на диске, задачи генерации — только во временном хранилище.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectDto } from "@ms/contracts";
import { migrate } from "../../src/db/migrate.js";
import { type Db, openDb } from "../../src/db/open.js";
import * as jobs from "../../src/db/repos/jobs.js";
import * as projects from "../../src/db/repos/projects.js";
import * as scenes from "../../src/db/repos/scenes.js";
import { type EnqueueRequest, requestCancel } from "../../src/jobs/queue.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

export interface Env {
  s: TestStore;
  db: Db;
  root: string;
  core: { root: string; db: Db };
}

export async function setup(prefix: string): Promise<Env> {
  const s = await makeStore(prefix);
  const db = openDb(s.root);
  await migrate(db);
  return { s, db, root: s.root, core: { root: s.root, db } };
}

export async function teardown(env: Env): Promise<void> {
  if (env.db.open) env.db.close();
  await removeStore(env.s);
}

/** Проект с каталогом: сцена (файл), экспорт-каталог, папки пакетов. */
export function seedProject(env: Env, id: string, title: string, kind: ProjectDto["kind"] = "playground", opts: { packages?: number } = {}): void {
  projects.create(env.db, { id, title, kind });
  scenes.create(env.db, { id: `scn_${id}`, project_id: id, title: "сцена" });
  const dir = join(env.root, "workspace/projects", id);
  mkdirSync(join(dir, "scenes", `scn_${id}`), { recursive: true });
  writeFileSync(join(dir, "scenes", `scn_${id}`, "brief.json"), "{\"prompt\":\"x\"}\n");
  for (let i = 0; i < (opts.packages ?? 0); i++) {
    mkdirSync(join(dir, "packages", `pkg_${i}`), { recursive: true });
    writeFileSync(join(dir, "packages", `pkg_${i}`, "01.mp4"), "x".repeat(100));
  }
}

/** Задача генерации сцены проекта (как сценарный пакет: `playground.generate` по сцене). */
export const genJob = (projectId: string, key = `k-${projectId}-${Math.random()}`): EnqueueRequest => ({
  type: "playground.generate", projectId, sceneId: `scn_${projectId}`, input: { prompt: "p", key }, idempotencyKey: key,
});

/** Отменяет все незавершённые задачи проекта. */
export function cancelAll(db: Db, projectId: string): void {
  for (const j of jobs.list(db, { projectId })) requestCancel(db, j.id);
}
