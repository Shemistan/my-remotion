// Восстановление задач (ADR 0007 п. 4–5): при старте и при возврате из `storage_offline`.
// Задача становится `pending` только после подтверждённого завершения всех процессов
// прежней попытки; иначе — `blocked(stale_process)` без автоповтора.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Job, JobError } from "@ms/contracts";
import { type ProcessRegistry, reapAttempt } from "@ms/core";
import type { Db } from "../db/open.js";
import * as jobEvents from "../db/repos/job-events.js";
import * as jobs from "../db/repos/jobs.js";
import * as versions from "../db/repos/versions.js";
import { nowIso } from "../db/repos/util.js";
import { tx } from "../db/tx.js";
import type { SceneRepo } from "../scenes/repo.js";
import { QUARANTINE, quarantineDir } from "../scenes/store.js";
import type { EventBus } from "./events.js";
import { releaseLocks } from "./locks.js";
import { attemptAlive, finish } from "./queue.js";

export interface RecoveryReport {
  /** Снова `pending` (процессы подтверждённо мертвы, прерываний меньше `max_attempts`). */
  requeued: string[];
  /** `failed(interrupted)`: прерывания исчерпаны (M16). */
  failed: string[];
  /** `blocked(stale_process)`: процессы прежней попытки не завершились. */
  blocked: { jobId: string; pids: number[]; cmds: string[] }[];
  /** Удалены `cleanupDrafts` (карантин `cancelled`/`abandoned`/`interrupted`). */
  draftsRemoved: string[];
  /** Ruling P3: версия этой попытки уже опубликована (сбой между публикацией и `finish`). */
  completed: string[];
  /** Отмена была запрошена до сбоя. */
  cancelled: string[];
  /** Задачи не в работе (`blocked`, `cancelled`, …), чьи замки сняты: их процессы исчезли. */
  locksReleased: string[];
}

export interface RecoveryDeps {
  db: Db;
  repo: SceneRepo;
  /** Сервер: слияние `job_processes` и бокового файлового реестра Chrome. */
  registry: ProcessRegistry;
  reap?: typeof reapAttempt;
  /**
   * `interrupted` — рестарт (прерывание считается в `interrupts`, M16);
   * `storage_unavailable` — возврат из `storage_offline` (хранилище не вина задачи, не считается).
   */
  reason?: "interrupted" | "storage_unavailable";
  /** Шина событий (SSE); без неё события пишутся в `job_events` напрямую. */
  events?: EventBus;
  /** Убрать одноразовые draft в конце (`cleanupDrafts`, H6); по умолчанию да. */
  cleanup?: boolean;
}

type Level = "info" | "warn" | "error";

/**
 * Разбор задач без живой попытки в этом процессе. Для каждой `running`: `reap` процессов
 * её попытки (SIGTERM → 5 с → SIGKILL → до 30 с) →
 * - не чисто → `blocked(stale_process)` с PID и командами, draft попытки — `.quarantined`,
 *   замки держатся;
 * - чисто, версия этой попытки уже есть (`manifest.job`, ruling P3) → `completed`;
 * - чисто, отмена была запрошена → `cancelled`;
 * - чисто → draft попытки в карантин `interrupted`; `interrupts += 1` (только рестарт) и
 *   `pending` (`error.code` = причина) или `failed(interrupted)`, если прерывания исчерпаны.
 * Затем задачи не в работе, держащие замки (отменённая `blocked` и т. п.): процессы исчезли —
 * замки сняты. В конце `cleanupDrafts` (H6).
 */
export async function recoverOnStart(deps: RecoveryDeps): Promise<RecoveryReport> {
  const { db, repo, registry } = deps;
  const reap = deps.reap ?? reapAttempt;
  const reason = deps.reason ?? "interrupted";
  const report: RecoveryReport = { requeued: [], failed: [], blocked: [], draftsRemoved: [], completed: [], cancelled: [], locksReleased: [] };
  const event = (jobId: string, level: Level, kind: string, message: string, data?: unknown) => {
    const ev = { job_id: jobId, level, kind, message, ...(data === undefined ? {} : { data }) };
    if (deps.events) deps.events.emit(db, ev);
    else jobEvents.insert(db, ev);
  };

  for (const job of jobs.list(db, { status: "running" })) {
    const draft = join(repo.root, "workspace/drafts", `${job.id}-a${job.attempt}`);
    const r = await reap(registry, { runId: job.id, attempt: job.attempt });
    if (!r.clean) {
      const pids = r.alive.map((p) => p.pid);
      const cmds = r.alive.map((p) => p.cmd);
      const error: JobError = {
        code: "stale_process",
        stage: "orphaned",
        message: `процессы попытки ${job.attempt} не завершились после SIGKILL: ${r.alive.map((p) => `pid ${p.pid} (${p.cmd})`).join("; ")}`,
        pids,
        cmds,
      };
      // draft не переиспользуется и не удаляется, пока процессы живы (карантин не одноразовый)
      if (existsSync(draft)) await quarantineDir(draft, `stale_process: ${error.message}`);
      tx(db, () => {
        jobs.update(db, job.id, { status: "blocked", error, lease_owner: null, lease_until: null });
        event(job.id, "error", "blocked", error.message, { pids, cmds });
      });
      report.blocked.push({ jobId: job.id, pids, cmds });
      continue;
    }

    const version = await publishedBy(db, repo.root, job);
    if (version) {
      finish(db, job.id, job.attempt, { status: "completed", outputRefs: { version_id: version, recovered: true } });
      event(job.id, "info", "recovered_completed", `версия ${version} попытки ${job.attempt} уже опубликована — задача завершена без повтора`, { version_id: version });
      report.completed.push(job.id);
      continue;
    }
    if (existsSync(draft) && !existsSync(join(draft, QUARANTINE))) {
      await quarantineDir(draft, job.cancel_requested ? "cancelled: попытка прервана, отмена запрошена" : `interrupted: ${reason}`);
    }
    if (job.cancel_requested) {
      finish(db, job.id, job.attempt, { status: "cancelled", error: { code: "cancelled", stage: "cancelled", message: "задача отменена" } });
      event(job.id, "info", "cancelled", "задача отменена (попытка прервана)");
      report.cancelled.push(job.id);
      continue;
    }
    tx(db, () => {
      const interrupts = job.interrupts + (reason === "interrupted" ? 1 : 0);
      const error: JobError =
        reason === "interrupted"
          ? { code: "interrupted", stage: "interrupted", message: `попытка ${job.attempt} прервана рестартом` }
          : { code: "storage_unavailable", stage: "storage", message: `попытка ${job.attempt} прервана: хранилище было недоступно` };
      const base = { lease_owner: null, lease_until: null, interrupts, error };
      if (interrupts < job.max_attempts) {
        const next = jobs.update(db, job.id, { ...base, status: "pending" });
        releaseLocks(db, next);
        event(job.id, "warn", "interrupted", error.message, { code: error.code, interrupts });
        event(job.id, "info", "requeued", `задача снова в очереди (прерываний ${interrupts} из ${job.max_attempts})`, { code: error.code, interrupts });
        report.requeued.push(job.id);
      } else {
        const failed = { code: "interrupted", stage: "interrupted", message: `прерываний ${interrupts} из ${job.max_attempts}: ${error.message}` } as const;
        const next = jobs.update(db, job.id, { ...base, error: failed, status: "failed", finished_at: nowIso() });
        releaseLocks(db, next);
        event(job.id, "error", "failed", failed.message, { code: failed.code, interrupts });
        report.failed.push(job.id);
      }
    });
  }

  // Замки задач не в работе (Task 12: отменённая `blocked` держит их, пока процессы живы).
  for (const id of lockHolders(db)) {
    const job = jobs.get(db, id);
    if (!job || job.status === "running" || job.status === "pending") continue;
    const r = await reap(registry, { runId: job.id, attempt: job.attempt });
    if (!r.clean) continue;
    tx(db, () => releaseLocks(db, jobs.get(db, id)!));
    event(id, "info", "locks_released", "процессы прежней попытки завершены — замки сняты");
    report.locksReleased.push(id);
  }

  if (deps.cleanup !== false) report.draftsRemoved = (await repo.cleanupDrafts([])).removed;
  return report;
}

/** Ruling P3: id версии, опубликованной этой попыткой (`manifest.job` = задача и попытка). */
async function publishedBy(db: Db, root: string, job: Job): Promise<string | undefined> {
  for (const v of versions.listByJob(db, job.id)) {
    if (v.broken_reason) continue;
    try {
      const m = JSON.parse(await readFile(join(root, v.path, "manifest.json"), "utf8")) as { job?: { id?: string; attempt?: number } };
      if (m.job?.id === job.id && m.job.attempt === job.attempt) return v.id;
    } catch {
      // manifest не читается — версия не засчитывается
    }
  }
  return undefined;
}

/** Задачи, которые держат замок сцены или ресурса. */
function lockHolders(db: Db): string[] {
  return (db.prepare("SELECT job_id FROM scene_locks UNION SELECT job_id FROM resource_locks").pluck().all() as string[]).sort();
}

/**
 * Периодическая уборка замков во время работы (fix round 1): задачи не в работе
 * (`cancelled`, `blocked`, …), которые держат замки, пока живы процессы их попытки
 * (Task 12). Здесь процессы НЕ убиваются — только проверяется, что они исчезли (человек
 * добил, сами вышли); тогда записи закрываются и замки снимаются. Возвращает id задач.
 */
export async function releaseStaleLocks(db: Db, registry: ProcessRegistry, events?: EventBus): Promise<string[]> {
  const released: string[] = [];
  for (const id of lockHolders(db)) {
    const job = jobs.get(db, id);
    if (!job || job.status === "running" || job.status === "pending") continue;
    if (await attemptAlive(registry, job.id, job.attempt)) continue;
    tx(db, () => {
      const cur = jobs.get(db, id)!;
      // проверялась попытка job.attempt: сменилась (повтор, новый захват) — её процессы не проверены
      if (cur.status === "running" || cur.status === "pending" || cur.attempt !== job.attempt) return;
      releaseLocks(db, cur);
      const ev = { job_id: id, level: "info" as const, kind: "locks_released", message: "процессы прежней попытки завершены — замки сняты" };
      if (events) events.emit(db, ev);
      else jobEvents.insert(db, ev);
      released.push(id);
    });
  }
  return released;
}
