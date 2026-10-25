// Задачи дозаполнения сцен плана сценария (S16a F2/F3, ревью I1): `script.plan` со входом `fill`.
// Сцена с `fill: pending` не должна застревать: задача ставится при любой правке плана и по кнопке
// «Повторить дозаполнение», если есть ожидающие сцены, а активной задачи дозаполнения у проекта нет
// (прошлая упала, отменена, ушла в `blocked` или не была поставлена). Задача сама берёт все
// ожидающие сцены текущей ревизии, поэтому одна активная покрывает все.
import type { Job, JobStatus, ScriptPlanRevisionDoc } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import { tx } from "../db/tx.js";
import { enqueue } from "../jobs/queue.js";

/** Задача ещё может дописать сцены. */
const ACTIVE: readonly JobStatus[] = ["pending", "running", "awaiting_approval", "awaiting_input"];

export const isFillJob = (j: Job): boolean => j.type === "script.plan" && !!(j.input as { fill?: unknown } | null)?.fill;

const fillPlanId = (j: Job): string | undefined => (j.input as { fill?: { plan_id?: string } } | null)?.fill?.plan_id;

/** Задачи дозаполнения проекта (по времени постановки). */
export const fillJobs = (db: Db, projectId: string): Job[] => jobs.list(db, { projectId }).filter(isFillJob);

/** Последняя задача дозаполнения плана `planId` — для `ScriptStateDto.fill_job`. */
export function lastFillJob(db: Db, projectId: string, planId: string): Job | null {
  return fillJobs(db, projectId).filter((j) => fillPlanId(j) === planId).at(-1) ?? null;
}

/** В ревизии есть принятые сцены, ждущие дозаполнения. */
export const hasPendingFill = (doc: ScriptPlanRevisionDoc): boolean => doc.items.some((x) => x.status === "accepted" && x.fill === "pending");

/**
 * Ставит задачу дозаполнения ревизии `doc`, если есть ожидающие сцены и нет активной задачи.
 * Итог: `created` — новая задача; иначе активная (`created: false`); ожидающих сцен нет — null.
 */
export function ensureFillJob(db: Db, projectId: string, doc: ScriptPlanRevisionDoc): { job: Job; created: boolean } | null {
  if (!hasPendingFill(doc)) return null;
  return tx(db, () => {
    const all = fillJobs(db, projectId);
    const active = all.find((j) => ACTIVE.includes(j.status));
    if (active) return { job: active, created: false };
    // повтор той же ревизии — новый ключ (прошлый уже занят упавшей задачей)
    const input = { projectId, fill: { plan_id: doc.plan_id, revision: doc.revision } };
    return enqueue(db, { type: "script.plan", projectId, input, idempotencyKey: `script.fill:${doc.plan_id}@r${doc.revision}#${all.length + 1}` });
  });
}
