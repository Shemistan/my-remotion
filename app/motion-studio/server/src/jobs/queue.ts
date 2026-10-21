// Durable-очередь задач (ADR 0002, 0007): идемпотентность, захват с lease, fencing по
// `jobs.attempt`, замки сцены и ресурсов. Всё синхронно (better-sqlite3), каждый переход —
// транзакция `BEGIN IMMEDIATE` (внутри транзакции вызывающего — savepoint).
import type { Job, JobError, JobType } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import { nowIso } from "../db/repos/util.js";
import { tx } from "../db/tx.js";
import { sha256 } from "../scenes/hash.js";
import { newId } from "../scenes/ids.js";
import { LEASE_MS, MAX_ATTEMPTS } from "./limits.js";
import { SCENE_WRITING_TYPES, lockKeyFor, locksFree, releaseLocks, takeLocks, type LockKeyFor } from "./locks.js";
import type { Busy, Claim, HandlerResult } from "./types.js";

export { SCENE_WRITING_TYPES };

export interface EnqueueRequest {
  type: JobType;
  projectId: string;
  sceneId?: string;
  versionId?: string;
  parentJobId?: string;
  input: unknown;
  idempotencyKey: string;
  maxAttempts?: number;
}

/** Тот же `Idempotency-Key` с другим входом (M15) — API отвечает 422. */
export class IdempotencyKeyReusedError extends Error {
  readonly code = "idempotency_key_reused";
  constructor(readonly key: string, readonly jobId: string) {
    super(`idempotency_key_reused: ключ ${key} уже использован задачей ${jobId} с другим входом`);
  }
}

/** JSON с ключами объектов по алфавиту на любой глубине (`undefined` отбрасывается, как в JSON). */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) => {
    if (val === null || typeof val !== "object" || Array.isArray(val)) return val;
    const o = val as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  }) ?? "null";
}

export function inputHash(type: JobType, input: unknown): string {
  return sha256(type + canonicalJson(input));
}

const iso = (ms: number): string => new Date(ms).toISOString();

/**
 * Ставит задачу. Сначала ищет ключ: тот же ключ и тот же `input_hash` — существующая
 * задача (`created: false`), другой хеш — `IdempotencyKeyReusedError`. Вызывать внутри
 * `tx` вызывающего, чтобы сцена или сообщение и задача писались одной транзакцией.
 */
export function enqueue(db: Db, req: EnqueueRequest): { job: Job; created: boolean } {
  const hash = inputHash(req.type, req.input);
  return tx(db, () => {
    const existing = jobs.findByIdempotencyKey(db, req.idempotencyKey);
    if (existing) {
      if (existing.input_hash !== hash) throw new IdempotencyKeyReusedError(req.idempotencyKey, existing.id);
      return { job: existing, created: false };
    }
    if (SCENE_WRITING_TYPES.includes(req.type) && !req.sceneId) throw new Error(`jobs: ${req.type} требует scene_id (замок сцены)`);
    const job = jobs.insert(db, {
      id: newId("job"),
      type: req.type,
      project_id: req.projectId,
      scene_id: req.sceneId ?? null,
      version_id: req.versionId ?? null,
      parent_job_id: req.parentJobId ?? null,
      input: req.input,
      input_hash: hash,
      idempotency_key: req.idempotencyKey,
      max_attempts: req.maxAttempts ?? MAX_ATTEMPTS,
    });
    return { job, created: true };
  });
}

export interface ClaimOptions {
  /** Брать только эти типы (те, для которых у раннера есть обработчик). */
  types?: readonly JobType[];
  /** Ключ замка ресурса; по умолчанию `lockKeyFor`. */
  lockKeyFor?: LockKeyFor;
}

/**
 * Захватывает самую старую `pending`, чьи замки свободны: `running`, `attempt += 1`
 * (fencing; с `max_attempts` сравниваются только `interrupts`, M16), lease, замки — в одной
 * транзакции. Нет свободного слота или подходящей задачи — `undefined`.
 */
export function claimNext(db: Db, owner: string, now: number, busy: Busy, opts: ClaimOptions = {}): Claim | undefined {
  if (busy.running >= busy.maxRunning) return undefined;
  const keyFor = opts.lockKeyFor ?? lockKeyFor;
  return tx(db, () => {
    const ids = db.prepare("SELECT id FROM jobs WHERE status = 'pending' ORDER BY created_at, rowid").pluck().all() as string[];
    for (const id of ids) {
      const cand = jobs.get(db, id)!;
      if (opts.types && !opts.types.includes(cand.type)) continue;
      if (!locksFree(db, cand, keyFor)) continue;
      const attempt = cand.attempt + 1;
      const job = jobs.update(db, id, {
        status: "running",
        attempt,
        lease_owner: owner,
        lease_until: iso(now + LEASE_MS),
        started_at: iso(now),
        error: null,
      });
      takeLocks(db, job, keyFor);
      return { job, attempt };
    }
    return undefined;
  });
}

/** Попытка всё ещё текущая: задача `running` и `jobs.attempt` равен её номеру. */
export function fenceOk(db: Db, jobId: string, attempt: number): boolean {
  return db.prepare("SELECT 1 FROM jobs WHERE id = ? AND attempt = ? AND status = 'running'").get(jobId, attempt) !== undefined;
}

/** Продлевает lease; `false` — попытка устарела (fencing). */
export function heartbeat(db: Db, jobId: string, attempt: number, now: number): boolean {
  return db.prepare("UPDATE jobs SET lease_until = ? WHERE id = ? AND attempt = ? AND status = 'running'")
    .run(iso(now + LEASE_MS), jobId, attempt).changes === 1;
}

/** Прогресс попытки; устаревшая попытка ничего не пишет. */
export function setProgress(db: Db, jobId: string, attempt: number, progress: number, stage: string): boolean {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return db.prepare("UPDATE jobs SET progress = ?, stage = ? WHERE id = ? AND attempt = ? AND status = 'running'")
    .run(p, stage, jobId, attempt).changes === 1;
}

const CANCELLED: JobError = { code: "cancelled", stage: "cancelled", message: "задача отменена" };

/**
 * Пишет итог попытки, если она текущая (fencing в той же транзакции), и снимает замки —
 * в том числе для `awaiting_input`: сцена свободна, задача ждёт ответа. Запрошенная отмена
 * превращает `awaiting_input` в `cancelled`.
 */
export function finish(db: Db, jobId: string, attempt: number, result: HandlerResult): boolean {
  return tx(db, () => {
    if (!fenceOk(db, jobId, attempt)) return false;
    const cur = jobs.get(db, jobId)!;
    const done = { lease_owner: null, lease_until: null, finished_at: nowIso() };
    let next: Job;
    if (result.status === "completed") {
      next = jobs.update(db, jobId, { ...done, status: "completed", output_refs: result.outputRefs ?? null, error: null, progress: 1 });
    } else if (result.status === "awaiting_input" && !cur.cancel_requested) {
      next = jobs.update(db, jobId, { ...done, finished_at: null, status: "awaiting_input", output_refs: { questions: result.questions } });
    } else if (result.status === "awaiting_input") {
      next = jobs.update(db, jobId, { ...done, status: "cancelled", error: CANCELLED });
    } else {
      next = jobs.update(db, jobId, { ...done, status: result.status, error: result.error });
    }
    releaseLocks(db, next);
    return true;
  });
}

function mustGet(db: Db, jobId: string): Job {
  const j = jobs.get(db, jobId);
  if (!j) throw new Error(`job_not_found: ${jobId}`);
  return j;
}

/** Ответы на уточнения: `awaiting_input → pending`, ответы в `input.answers`. */
export function provideInput(db: Db, jobId: string, answers: Record<string, string> | "skip"): Job {
  return tx(db, () => {
    const j = mustGet(db, jobId);
    if (j.status !== "awaiting_input") throw new Error(`job_not_awaiting_input: ${jobId} в статусе ${j.status}`);
    const input = j.input !== null && typeof j.input === "object" && !Array.isArray(j.input) ? (j.input as Record<string, unknown>) : { value: j.input };
    return jobs.update(db, jobId, { status: "pending", input: { ...input, answers } });
  });
}

/**
 * Отмена. `running` — `cancel_requested = 1` (раннер прерывает попытку через `AbortSignal`);
 * задача без живой попытки (`pending`, `awaiting_input`, `awaiting_approval`, `blocked`) —
 * сразу `cancelled`; завершённая — без изменений.
 */
export function requestCancel(db: Db, jobId: string): Job {
  return tx(db, () => {
    const j = mustGet(db, jobId);
    switch (j.status) {
      case "running":
        return jobs.update(db, jobId, { cancel_requested: true });
      case "pending":
      case "awaiting_input":
      case "awaiting_approval":
      case "blocked": {
        const next = jobs.update(db, jobId, { status: "cancelled", cancel_requested: true, error: CANCELLED, finished_at: nowIso(), lease_owner: null, lease_until: null });
        releaseLocks(db, next);
        return next;
      }
      case "completed":
      case "failed":
      case "cancelled":
        return j;
    }
  });
}
