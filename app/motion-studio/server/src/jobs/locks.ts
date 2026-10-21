// Замки оркестратора: замок сцены (ADR 0007, `scene_locks`) и замки ресурсов проекта
// (ruling V8, `resource_locks`). Берутся в транзакции захвата, снимаются в `finish`.
import type { Job, JobType } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as resourceLocks from "../db/repos/resource-locks.js";
import * as sceneLocks from "../db/repos/scene-locks.js";

/** Типы, которые пишут в сцену: над одной сценой не выполняются одновременно. */
export const SCENE_WRITING_TYPES: readonly JobType[] = ["playground.generate", "playground.edit", "scene.restore"];

/** Ключ замка ресурса задачи; `undefined` — задача замка ресурса не берёт. */
export type LockKeyFor = (job: Job) => string | undefined;

/** Сцена, замок которой нужен задаче (`scene.export` читает иммутабельную версию — не нужен). */
export function sceneLockFor(job: Job): string | undefined {
  return SCENE_WRITING_TYPES.includes(job.type) ? job.scene_id ?? undefined : undefined;
}

/**
 * Ключ замка ресурса проекта. Типы Phase 1 его не берут (им хватает замка сцены);
 * Phase 2 (Task 24) добавляет ключи для своих типов (`project:<id>:<ресурс>`).
 */
export function lockKeyFor(job: Job): string | undefined {
  switch (job.type) {
    case "playground.generate":
    case "playground.edit":
    case "scene.restore":
    case "scene.export":
      return undefined;
  }
}

/** Кто держит ресурс — для синхронных правок API (409, пока задача идёт). */
export function resourceBusy(db: Db, key: string): { jobId: string } | undefined {
  const jobId = resourceLocks.holder(db, key);
  return jobId === undefined ? undefined : { jobId };
}

/** Замки задачи свободны (или уже её). Вызывать внутри транзакции захвата. */
export function locksFree(db: Db, job: Job, keyFor: LockKeyFor): boolean {
  const scene = sceneLockFor(job);
  if (scene !== undefined && (sceneLocks.holder(db, scene) ?? job.id) !== job.id) return false;
  const key = keyFor(job);
  return key === undefined || (resourceLocks.holder(db, key) ?? job.id) === job.id;
}

/** Берёт замки задачи; перед этим `locksFree` в той же транзакции. */
export function takeLocks(db: Db, job: Job, keyFor: LockKeyFor): void {
  const scene = sceneLockFor(job);
  if (scene !== undefined && !sceneLocks.acquire(db, scene, job.id)) throw new Error(`jobs: замок сцены ${scene} занят`);
  const key = keyFor(job);
  if (key !== undefined && !resourceLocks.acquire(db, key, job.id)) throw new Error(`jobs: ресурс ${key} занят`);
}

/** Снимает все замки задачи (только свои). */
export function releaseLocks(db: Db, job: Job): void {
  if (job.scene_id) sceneLocks.release(db, job.scene_id, job.id);
  resourceLocks.releaseAll(db, job.id);
}
