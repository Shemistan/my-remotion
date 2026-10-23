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

/** Ресурс проекта, который пишет задача Phase 2–3. */
export type ProjectResource = "media" | "transcript" | "edl" | "footage" | "semantic" | "plan";

/** Ключ замка ресурса проекта: `project:<id>:<ресурс>`. */
export const projectLockKey = (projectId: string, resource: ProjectResource): string => `project:${projectId}:${resource}`;

/**
 * Ключ замка ресурса проекта. Типы Phase 1 его не берут: их сериализует замок сцены
 * (`scene_locks`, `sceneLockFor`) — поведение Task 12 не меняется. Задачи Phase 2–3, пишущие
 * артефакт, — `project:<id>:<ресурс>`; `roughcut.preview` читает иммутабельные ревизии — без замка.
 */
export function lockKeyFor(job: Job): string | undefined {
  const key = (r: ProjectResource) => projectLockKey(job.project_id, r);
  switch (job.type) {
    case "playground.generate":
    case "playground.edit":
    case "scene.restore":
    case "scene.export":
    case "roughcut.preview":
      return undefined;
    case "media.import":
      return key("media");
    case "asr.transcribe":
      return key("transcript");
    case "roughcut.propose":
      return key("edl");
    case "footage.analyze":
      return key("footage");
    case "semantic.analyze":
      return key("semantic");
    case "plan.visual":
    case "plan.recheck":
      return key("plan");
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
