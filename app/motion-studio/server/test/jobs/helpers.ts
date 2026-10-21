import type { JobType } from "@ms/contracts";
import { openDb, type Db } from "../../src/db/open.js";
import { migrate } from "../../src/db/migrate.js";
import * as scenes from "../../src/db/repos/scenes.js";
import type { EnqueueRequest } from "../../src/jobs/queue.js";
import { makeStore, removeStore, type TestStore } from "../db/helpers.js";

export interface JobsEnv {
  s: TestStore;
  db: Db;
}

/** Хранилище в `tmp/`, база с миграциями и сценами `scn_1`, `scn_2`. */
export async function setupDb(prefix: string): Promise<JobsEnv> {
  const s = await makeStore(prefix);
  const db = openDb(s.root);
  migrate(db);
  scenes.create(db, { id: "scn_1", project_id: "playground", title: "Первая" });
  scenes.create(db, { id: "scn_2", project_id: "playground", title: "Вторая" });
  return { s, db };
}

export async function teardownDb(env: JobsEnv): Promise<void> {
  env.db.close();
  await removeStore(env.s);
}

export const idle = { running: 0, maxRunning: 2 };

export function req(over: Partial<EnqueueRequest> = {}): EnqueueRequest {
  return { type: "playground.generate", projectId: "playground", sceneId: "scn_1", input: { prompt: "p" }, idempotencyKey: "k", ...over };
}

export function job(type: JobType, sceneId: string, key: string, input: unknown = { key }): EnqueueRequest {
  return { type, projectId: "playground", sceneId, input, idempotencyKey: key };
}

export const edit = (sceneId: string, key: string): EnqueueRequest => job("playground.edit", sceneId, key);

/** Ждёт условие (реальные таймеры раннера), иначе ошибка с описанием. */
export async function until(cond: () => boolean, what: string, timeoutMs = 2000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`не дождались: ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Обещание, которое тест разрешает вручную. */
export function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
