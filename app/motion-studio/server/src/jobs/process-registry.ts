// Реестр дочерних процессов сервера (ADR 0007 п. 3): таблица `job_processes` + копия в
// памяти. В `storage_offline` база закрыта — реестр работает по копии и досинхронизирует
// записи и `ended_at` после возврата хранилища (`attach`).
import { type ProcessExit, type ProcessOwner, type ProcessRegistry, type RegistryFilter, type TrackedProcess, assertRunRef, matches, trackedRecord } from "@ms/core";
import type { Db } from "../db/open.js";
import * as jobProcesses from "../db/repos/job-processes.js";
import { nowIso } from "../db/repos/util.js";
import { isStorageError } from "./runner.js";

interface Entry {
  p: TrackedProcess;
  /** Подтверждённое завершение (в памяти); в БД — `ended_at`. */
  ended?: { at: string; exit: ProcessExit };
  /** Запись или завершение ещё не легли в БД (база была закрыта). */
  pendingInsert: boolean;
  pendingEnd: boolean;
}

const keyOf = (p: Pick<TrackedProcess, "runId" | "attempt" | "pid">): string => `${p.runId}\u0000${p.attempt}\u0000${p.pid}`;

const rowOf = (p: TrackedProcess) => ({
  job_id: p.runId, attempt: p.attempt, pid: p.pid, pgid: p.pgid, started_at: p.startedAt, cmd: p.cmd,
  owner_pid: p.owner?.pid ?? null, owner_started_at: p.owner?.startedAt ?? null, owner_nonce: p.owner?.nonce ?? null,
});

export class SqliteProcessRegistry implements ProcessRegistry {
  private db: Db | undefined;
  private readonly entries = new Map<string, Entry>();

  private readonly owner: () => ProcessOwner | undefined;

  /**
   * Поднимает копию незавершённых процессов из `job_processes`. `owner` (S20) — владелец
   * owner-lock этого процесса: пишется в каждую запись без своего `owner`.
   */
  constructor(db: Db, opts: { owner?: () => ProcessOwner | undefined } = {}) {
    this.db = db;
    this.owner = opts.owner ?? (() => undefined);
    this.reload();
  }

  async add(p: TrackedProcess): Promise<void> {
    assertRunRef(p);
    const owner = p.owner ?? this.owner();
    const rec = trackedRecord(owner ? { ...p, owner } : p);
    const e: Entry = { p: rec, pendingInsert: true, pendingEnd: false };
    if (this.online()) {
      try {
        jobProcesses.insert(this.db!, rowOf(rec));
        e.pendingInsert = false;
      } catch (err) {
        // не хранилище (ошибка в коде, ограничение) — процесс не должен стартовать без учёта
        if (!isStorageError(err)) throw err;
      }
    }
    this.entries.set(keyOf(rec), e);
  }

  async end(p: TrackedProcess, exit: ProcessExit): Promise<void> {
    const e = this.entries.get(keyOf(p));
    const at = nowIso();
    if (e) {
      if (e.ended) return;
      e.ended = { at, exit };
      e.pendingEnd = true;
    }
    if (this.online()) {
      try {
        if (e) this.syncEntry(e);
        else jobProcesses.end(this.db!, { job_id: p.runId, attempt: p.attempt, pid: p.pid }, { exit_code: exit.code, ended_at: at });
      } catch (err) {
        if (!isStorageError(err)) throw err;
      }
    }
    if (e && !e.pendingInsert && !e.pendingEnd) this.entries.delete(keyOf(p));
  }

  async live(filter?: RegistryFilter): Promise<TrackedProcess[]> {
    return [...this.entries.values()]
      .filter((e) => !e.ended && matches(e.p, filter))
      .map((e) => e.p)
      .sort((a, b) => (a.runId === b.runId ? a.attempt - b.attempt || a.pid - b.pid : a.runId < b.runId ? -1 : 1));
  }

  /** S20: процесс чужого живого сервера — пометка в БД; запись остаётся живой (не `ended_at`). */
  async markForeign(p: TrackedProcess, ownerPid: number): Promise<void> {
    if (!this.online()) return;
    try {
      jobProcesses.markForeign(this.db!, { job_id: p.runId, attempt: p.attempt, pid: p.pid }, ownerPid);
    } catch (err) {
      if (!isStorageError(err)) throw err;
    }
  }

  /** `storage_offline`: база закрывается, дальше — только копия в памяти. */
  detach(): void {
    this.db = undefined;
  }

  /** Хранилище вернулось: досинхронизировать накопленное и перечитать копию из БД. */
  attach(db: Db): void {
    this.db = db;
    for (const e of this.entries.values()) this.syncEntry(e);
    this.reload();
  }

  private online(): boolean {
    return this.db !== undefined && this.db.open;
  }

  /** Записывает в БД то, что не записалось, пока она была закрыта. */
  private syncEntry(e: Entry): void {
    const db = this.db!;
    const { p } = e;
    if (e.pendingInsert) {
      jobProcesses.insert(db, rowOf(p), { ignoreExisting: true });
      e.pendingInsert = false;
    }
    if (e.pendingEnd && e.ended) {
      jobProcesses.end(db, { job_id: p.runId, attempt: p.attempt, pid: p.pid }, { exit_code: e.ended.exit.code, ended_at: e.ended.at });
      e.pendingEnd = false;
    }
  }

  /** Копия = незавершённые строки БД (записи, ещё не досинхронизированные, сохраняются). */
  private reload(): void {
    for (const [k, e] of this.entries) if (!e.pendingInsert && !e.pendingEnd) this.entries.delete(k);
    for (const r of jobProcesses.listLive(this.db!)) {
      const p: TrackedProcess = { runId: r.job_id, attempt: r.attempt, pid: r.pid, pgid: r.pgid, startedAt: r.started_at, cmd: r.cmd };
      if (r.owner_pid !== null && r.owner_started_at !== null) p.owner = { pid: r.owner_pid, startedAt: r.owner_started_at, nonce: r.owner_nonce ?? "" };
      if (!this.entries.has(keyOf(p))) this.entries.set(keyOf(p), { p, pendingInsert: false, pendingEnd: false });
    }
  }
}

/**
 * Слияние реестра сервера и бокового файлового (Chrome пишет `run/processes/` сам,
 * chrome-wrapper.sh): `live` — объединение по `(runId, attempt, pid)`, `add` — в основной,
 * `end` — в оба (отсутствующая запись — не ошибка).
 */
export function mergeRegistries(primary: ProcessRegistry, side: ProcessRegistry): ProcessRegistry {
  return {
    add: (p) => primary.add(p),
    // отметку хранит только основной (SQLite): у бокового файлового её нет
    markForeign: async (p, ownerPid) => {
      await primary.markForeign?.(p, ownerPid);
      await side.markForeign?.(p, ownerPid);
    },
    async end(p, exit) {
      await primary.end(p, exit);
      await side.end(p, exit);
    },
    async live(filter) {
      const seen = new Set<string>();
      const out: TrackedProcess[] = [];
      for (const p of [...(await primary.live(filter)), ...(await side.live(filter))]) {
        if (seen.has(keyOf(p))) continue;
        seen.add(keyOf(p));
        out.push(p);
      }
      return out;
    },
  };
}
