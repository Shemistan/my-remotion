// Повтор задачи действием человека (ADR 0007 п. 4): только после подтверждённого
// завершения всех процессов прежних попыток.
import type { Job } from "@ms/contracts";
import { type ProcessRegistry, isTrackedAlive } from "@ms/core";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import { tx } from "../db/tx.js";
import { releaseLocks } from "./locks.js";

const RETRYABLE = new Set<Job["status"]>(["failed", "cancelled", "blocked"]);

/** Процессы прежней попытки ещё живы — повтор запрещён (API: 409 с PID и командами). */
export class StaleProcessAliveError extends Error {
  readonly code = "stale_process_alive";
  constructor(
    readonly jobId: string,
    readonly pids: number[],
    readonly cmds: string[],
  ) {
    super(`stale_process_alive: процессы прежней попытки задачи ${jobId} живы: ${pids.map((p, i) => `pid ${p} (${cmds[i]})`).join("; ")}`);
    this.name = "StaleProcessAliveError";
  }
}

/**
 * `failed | cancelled | blocked` → `pending`. Записи реестра задачи проверяются на
 * живость (pid + время старта, остатки группы): мёртвые закрываются `end`, живые —
 * `StaleProcessAliveError`. `attempt` не меняется (его увеличит захват); `interrupts`
 * обнуляется — повтор человеком даёт новый запас автоповторов (M16); замки снимаются
 * (захват возьмёт их снова).
 */
export async function retryJob(db: Db, jobId: string, registry: ProcessRegistry): Promise<Job> {
  const before = jobs.get(db, jobId);
  if (!before) throw new Error(`job_not_found: ${jobId}`);
  if (!RETRYABLE.has(before.status)) throw new Error(`job_not_retryable: задача ${jobId} в статусе ${before.status}`);
  const alive = [];
  for (const p of await registry.live({ runId: jobId })) {
    if (await isTrackedAlive(p)) alive.push(p);
    else await registry.end(p, { code: null, signal: null });
  }
  if (alive.length > 0) throw new StaleProcessAliveError(jobId, alive.map((p) => p.pid), alive.map((p) => p.cmd));
  return tx(db, () => {
    const j = jobs.get(db, jobId)!;
    if (!RETRYABLE.has(j.status)) throw new Error(`job_not_retryable: задача ${jobId} в статусе ${j.status}`);
    const next = jobs.update(db, jobId, {
      status: "pending",
      error: null,
      cancel_requested: false,
      finished_at: null,
      lease_owner: null,
      lease_until: null,
      progress: 0,
      stage: null,
      interrupts: 0,
    });
    releaseLocks(db, next);
    return next;
  });
}
