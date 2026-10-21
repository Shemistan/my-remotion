// StorageSupervisor (ADR 0006/0007): режим `storage_offline`. Хранилище пропало — раннер
// на паузе, попытки прерваны, БД закрыта, реестр процессов живёт в памяти. Вернулось —
// owner-lock на новом монтировании (`fcntl` привязан к vnode старого), `quick_check`,
// переоткрытие БД, тот же разбор задач, что при старте (причина `storage_unavailable`),
// и только затем раннер снова захватывает задачи.
import { type StorageStatus, watchStorage } from "@ms/core";
import type { Db } from "../db/open.js";
import { quickCheck } from "../db/meta.js";
import type { SqliteProcessRegistry } from "./process-registry.js";
import type { RecoveryReport } from "./recovery.js";
import type { JobRunner } from "./runner.js";

export type StorageMode = "online" | "storage_offline";

export interface StorageSupervisorDeps {
  check: () => Promise<StorageStatus>;
  runner: JobRunner;
  registry: SqliteProcessRegistry;
  /** Открывает `studio.db` заново (миграции, сверка `store_id`); `quick_check` делает супервизор. */
  reopen: () => Db;
  /** Текущая база (закрывается при сбое). */
  db: Db;
  /** Период проверки, мс (10 000); окончательный отказ — offline сразу, неокончательный (`storage_watch_timeout`, `volume_probe_failed`) — после серии подряд (`watchStorage`). */
  intervalMs?: number;
  /** Взять или проверить `run/owner.lock` на новом монтировании; `OwnerBusyError` — остаться offline. */
  verifyOwner?: () => Promise<void>;
  /** Разбор задач после возврата (`recoverOnStart` с причиной `storage_unavailable`). */
  recover?: (db: Db) => Promise<RecoveryReport>;
  /** Новая база — остальным частям ядра (SceneRepo и т. п.). */
  onDb?: (db: Db) => void;
  /** Сколько ждать прерванные попытки перед закрытием БД, мс (50 000 > таймаута abort раннера). */
  settleMs?: number;
  /** Журнал переходов режима. */
  log?: (line: string) => void;
}

export class StorageSupervisor {
  private current: StorageMode = "online";
  private why: string | undefined;
  private dbRef: Db;
  private watch: ReturnType<typeof watchStorage> | undefined;
  private poll: NodeJS.Timeout | undefined;
  private busy: Promise<void> | undefined;
  private stopped = false;
  private recovery: RecoveryReport | undefined;
  private readonly intervalMs: number;

  constructor(private readonly deps: StorageSupervisorDeps) {
    this.dbRef = deps.db;
    this.intervalMs = deps.intervalMs ?? 10_000;
  }

  mode(): StorageMode {
    return this.current;
  }

  /** Причина `storage_offline` (или последнего неудачного возврата). */
  reason(): string | undefined {
    return this.why;
  }

  db(): Db {
    return this.dbRef;
  }

  lastRecovery(): RecoveryReport | undefined {
    return this.recovery;
  }

  start(): void {
    if (this.stopped || this.watch || this.poll) return;
    this.watchOnline();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.watch?.stop();
    this.watch = undefined;
    if (this.poll) clearInterval(this.poll);
    this.poll = undefined;
    await this.busy?.catch(() => undefined);
  }

  private watchOnline(): void {
    const w = watchStorage(this.deps.check, this.intervalMs);
    this.watch = w;
    w.signal.addEventListener("abort", () => {
      if (this.watch !== w || this.stopped) return;
      this.watch = undefined;
      const f = w.lastFailure();
      const reason = f && !f.ok ? `${f.reason}: ${f.detail}` : String(w.signal.reason);
      this.run(() => this.goOffline(reason));
    }, { once: true });
  }

  private run(fn: () => Promise<void>): void {
    if (this.busy) return;
    this.busy = fn()
      .catch((e: unknown) => this.deps.log?.(`storage supervisor: ${(e as Error).message}`))
      .finally(() => {
        this.busy = undefined;
      });
  }

  private async goOffline(reason: string): Promise<void> {
    const { runner, registry } = this.deps;
    this.current = "storage_offline";
    this.why = reason;
    this.deps.log?.(`storage_offline: ${reason}`);
    runner.pause();
    for (const a of runner.running()) a.controller.abort(new Error(`storage_unavailable: ${reason}`));
    // попытки прерваны: их процессы убивает spawnTracked, `end` уходит в память реестра
    await runner.settle(this.deps.settleMs ?? 50_000);
    registry.detach();
    try {
      this.dbRef.close();
    } catch {
      // база уже недоступна — закрыта настолько, насколько возможно
    }
    if (this.stopped) return;
    this.poll = setInterval(() => this.run(() => this.tryOnline()), this.intervalMs);
    this.poll.unref();
  }

  private async tryOnline(): Promise<void> {
    if (this.stopped || this.current === "online") return;
    let st: StorageStatus;
    try {
      st = await this.deps.check();
    } catch (e) {
      this.why = `проверка хранилища упала: ${(e as Error).message}`;
      return;
    }
    if (!st.ok) {
      this.why = `${st.reason}: ${st.detail}`;
      return;
    }
    try {
      await this.deps.verifyOwner?.();
    } catch (e) {
      // замок на новом монтировании у другого процесса: не возобновляемся
      this.why = (e as Error).message;
      this.deps.log?.(`storage_offline: ${this.why}`);
      return;
    }
    let db: Db;
    try {
      db = this.deps.reopen();
    } catch (e) {
      this.why = `studio.db не открылась: ${(e as Error).message}`;
      return;
    }
    let problem: string | undefined;
    try {
      if (!quickCheck(db)) problem = "quick_check: studio.db повреждена";
    } catch (e) {
      problem = `quick_check упал: ${(e as Error).message}`;
    }
    if (problem) {
      this.why = problem;
      try {
        db.close();
      } catch {
        // уже закрыта
      }
      return;
    }
    // переключение на новую базу целиком или никак: сбой любого шага — закрыть её,
    // реестр снова в память, остаться в storage_offline и повторить на следующем опросе
    try {
      this.dbRef = db;
      this.deps.registry.attach(db);
      this.deps.runner.useDb(db);
      this.deps.onDb?.(db);
      if (this.deps.recover) this.recovery = await this.deps.recover(db);
    } catch (e) {
      this.why = `возврат хранилища не удался: ${(e as Error).message}`;
      this.deps.log?.(`storage_offline: ${this.why}`);
      this.deps.registry.detach();
      try {
        db.close();
      } catch {
        // уже закрыта
      }
      return;
    }
    if (this.poll) clearInterval(this.poll);
    this.poll = undefined;
    this.current = "online";
    this.why = undefined;
    this.deps.log?.("storage online");
    this.deps.runner.resume();
    if (!this.stopped) this.watchOnline();
  }
}
