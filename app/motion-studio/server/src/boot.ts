// Старт ядра сервера и CLI (ADR 0007 п. 5): owner_lock → storage → db → registry → reap →
// sweep_drafts → relock_versions → reconcile_versions → recovery → runner. Новые задачи
// захватываются только после разбора реестра процессов и восстановления.
import { isAbsolute, join } from "node:path";
import {
  type OwnerLock,
  type ProcessRegistry,
  StorageError,
  type TrackedProcess,
  type VolumeProbe,
  acquireOwnerLock,
  checkStorage,
  fileProcessRegistry,
  macosProbe,
  reapAttempt,
  verifyOwnerLock,
} from "@ms/core";
import { type Proc, reapStrayRenderers } from "@ms/render";
import { ClaudeCodeRuntime } from "./agents/claude-code.js";
import { loadPrompt } from "./agents/prompts.js";
import type { AgentRuntimeAdapter } from "./agents/runtime.js";
import { type AppConfig, loadConfig, readConfigFile } from "./config.js";
import { bindStoreId, quickCheck } from "./db/meta.js";
import { migrate } from "./db/migrate.js";
import { type Db, openDb } from "./db/open.js";
import { EventBus } from "./jobs/events.js";
import { SqliteProcessRegistry, mergeRegistries } from "./jobs/process-registry.js";
import { type RecoveryReport, recoverOnStart, releaseStaleLocks } from "./jobs/recovery.js";
import { JobRunner, type JobRunnerOptions } from "./jobs/runner.js";
import { StorageSupervisor } from "./jobs/storage-mode.js";
import type { Handlers } from "./jobs/types.js";
import { KnowledgeAdapter } from "./knowledge/adapter.js";
import { type ImportReport, type MissingReport, reconcileVersions } from "./scenes/import-slice.js";
import { SceneRepo } from "./scenes/repo.js";
import { relockVersions, sweepAbandonedDrafts } from "./scenes/store.js";

export const BOOT_STEPS = [
  "owner_lock", "storage", "db", "registry", "reap", "sweep_drafts", "relock_versions", "reconcile_versions", "recovery", "runner",
] as const;
export type BootStep = (typeof BOOT_STEPS)[number];

/** Части ядра, готовые до раннера (для фабрики обработчиков). */
export interface CoreServices {
  root: string;
  config: AppConfig;
  repo: SceneRepo;
  kb: KnowledgeAdapter;
  agents: AgentRuntimeAdapter;
  /** Слияние `job_processes` и бокового файлового реестра Chrome. */
  processes: ProcessRegistry;
  storageCheck: () => ReturnType<typeof checkStorage>;
}

export interface BootOptions {
  env: NodeJS.ProcessEnv;
  kind: "server" | "cli";
  probe?: VolumeProbe;
  handlers?: Handlers | ((svc: CoreServices) => Handlers);
  /** Шаг выполнен (порядок — `BOOT_STEPS`). */
  log?: (step: BootStep) => void;
  /** Подмены для тестов. */
  reap?: typeof reapAttempt;
  reapStrays?: (root: string) => Promise<Proc[]>;
  kb?: KnowledgeAdapter;
  agents?: AgentRuntimeAdapter;
  runner?: Partial<Omit<JobRunnerOptions, "db" | "root" | "handlers" | "registry" | "events">>;
  storageIntervalMs?: number;
  /** Переходы режима хранилища (`storage_offline`, возврат) — журнал CLI и сервера. */
  storageLog?: (line: string) => void;
  /** Период уборки замков задач, чьи процессы исчезли (`releaseStaleLocks`), мс (30 000). */
  lockSweepMs?: number;
}

/** Отчёт шагов загрузки до восстановления (CLI печатает предупреждения). */
export interface BootReport {
  swept: { quarantined: string[]; skipped: string[] };
  relock: { relocked: string[]; broken: { dir: string; error: string }[] };
  /** `missing.broken` — версии с `broken_reason`: каталог пропал, восстановить нельзя. */
  reconcile: ImportReport & { missing: MissingReport };
}

export interface Core {
  root: string;
  config: AppConfig;
  /** Текущая база (после `storage_offline` переоткрывается). */
  readonly db: Db;
  repo: SceneRepo;
  kb: KnowledgeAdapter;
  agents: AgentRuntimeAdapter;
  runner: JobRunner;
  storage: StorageSupervisor;
  registry: SqliteProcessRegistry;
  /** Слияние `registry` и бокового `run/processes/` — для разбора и повтора задач. */
  processes: ProcessRegistry;
  events: EventBus;
  recovery: RecoveryReport;
  /** Шаг `reap`: процессы, не завершившиеся после SIGKILL, и выжившие рендеры без записи. */
  reaped: { alive: TrackedProcess[]; strays: Proc[] };
  boot: BootReport;
  close(): Promise<void>;
}

export async function bootCore(opts: BootOptions): Promise<Core> {
  const log = opts.log ?? (() => undefined);
  const probe = opts.probe ?? macosProbe;
  const reap = opts.reap ?? reapAttempt;

  // owner_lock: замок лежит в корне хранилища, поэтому без MS_DATA_DIR дальше не идём (L4)
  const root = opts.env.MS_DATA_DIR?.trim();
  if (!root) throw new StorageError("env_missing", "MS_DATA_DIR не задан");
  if (!isAbsolute(root)) throw new StorageError("env_missing", `MS_DATA_DIR должен быть абсолютным путём: ${root}`);
  let lock: OwnerLock = await acquireOwnerLock(root, opts.kind);
  log("owner_lock");

  let db: Db | undefined;
  let runner: JobRunner | undefined;
  let storage: StorageSupervisor | undefined;
  try {
    const env = { ...opts.env, MS_DATA_DIR: root };
    const status = await checkStorage(env, probe);
    if (!status.ok) throw new StorageError(status.reason, status.detail);
    const storeId = status.marker.store_id;
    const storageCheck = () => checkStorage(env, probe, storeId);
    log("storage");

    const reopen = (): Db => {
      const d = openDb(root);
      try {
        migrate(d);
        bindStoreId(d, status.marker);
      } catch (e) {
        d.close();
        throw e;
      }
      return d;
    };
    db = reopen();
    if (!quickCheck(db)) throw new Error("db: quick_check не прошёл — studio.db повреждена");
    const config = loadConfig(env, await readConfigFile(root));
    log("db");

    const registry = new SqliteProcessRegistry(db);
    const processes = mergeRegistries(registry, fileProcessRegistry(root));
    log("registry");

    // reap: каждая уникальная пара (runId, attempt) обоих реестров, затем рендеры без записи (M6)
    const reaped = new Map<string, Awaited<ReturnType<typeof reapAttempt>>>();
    const alive: TrackedProcess[] = [];
    for (const p of await processes.live()) {
      const key = `${p.runId}\u0000${p.attempt}`;
      if (reaped.has(key)) continue;
      const r = await reap(processes, { runId: p.runId, attempt: p.attempt });
      reaped.set(key, r);
      alive.push(...r.alive);
    }
    const strays = await (opts.reapStrays ?? reapStrayRenderers)(root);
    log("reap");

    const swept = await sweepAbandonedDrafts(root, processes);
    log("sweep_drafts");
    const relock = await relockVersions(root);
    log("relock_versions");
    const current = { db };
    const repo = new SceneRepo({ root, db, guard: storageCheck, registry: processes });
    // каталоги версий без строки в БД — до захвата задач: nextNumber считает только строки (H9)
    const reconcile = await reconcileVersions(repo, root);
    log("reconcile_versions");

    const events = new EventBus(() => current.db);
    // разбор шага reap переиспользуется: неубиваемый процесс не ждём второй раз
    const cachedReap: typeof reapAttempt = (r, f, o) => {
      const hit = f.attempt === undefined ? undefined : reaped.get(`${f.runId}\u0000${f.attempt}`);
      return hit && !hit.clean ? Promise.resolve(hit) : reap(r, f, o);
    };
    const recovery = await recoverOnStart({ db, repo, registry: processes, reap: cachedReap, events });
    log("recovery");

    const kb = opts.kb ?? (await KnowledgeAdapter.load({ kbRoot: config.kb.root, sourceRoot: config.kb.sourceRoot }));
    const agents = opts.agents ?? new ClaudeCodeRuntime({ bin: config.claudeBin, logRoot: join(root, "logs", "agent-runs"), promptLoader: loadPrompt });
    const svc: CoreServices = { root, config, repo, kb, agents, processes, storageCheck };
    const handlers = typeof opts.handlers === "function" ? opts.handlers(svc) : (opts.handlers ?? {});
    runner = new JobRunner({ ...opts.runner, db, root, owner: `${opts.kind}:${process.pid}`, handlers, registry: processes, events });
    const kind = opts.kind;
    storage = new StorageSupervisor({
      check: storageCheck,
      runner,
      registry,
      db,
      reopen,
      intervalMs: opts.storageIntervalMs,
      log: opts.storageLog,
      verifyOwner: async () => {
        lock = await verifyOwnerLock(root, kind, lock);
      },
      recover: (d) => recoverOnStart({ db: d, repo, registry: processes, reap, events, reason: "storage_unavailable" }),
      onDb: (d) => {
        current.db = d;
        repo.useDb(d);
      },
    });
    runner.start();
    storage.start();
    // отменённая/blocked задача держит замки, пока живы её процессы (Task 12): как только
    // они исчезли, замки снимаются без рестарта (при возврате хранилища — через recover)
    let sweeping = false;
    const st0 = storage;
    const lockSweep = setInterval(() => {
      if (sweeping || st0.mode() !== "online") return;
      sweeping = true;
      releaseStaleLocks(current.db, processes, events)
        .catch(() => undefined)
        .finally(() => {
          sweeping = false;
        });
    }, opts.lockSweepMs ?? 30_000);
    lockSweep.unref();
    log("runner");

    const r = runner;
    const st = storage;
    let closed = false;
    return {
      root,
      config,
      get db() {
        return current.db;
      },
      repo,
      kb,
      agents,
      runner: r,
      storage: st,
      registry,
      processes,
      events,
      recovery,
      reaped: { alive, strays },
      boot: { swept, relock, reconcile },
      async close() {
        if (closed) return;
        closed = true;
        clearInterval(lockSweep);
        await st.stop();
        await r.stop({ abortRunning: true });
        try {
          if (current.db.open) current.db.close();
        } finally {
          await lock.release();
        }
      },
    };
  } catch (e) {
    await storage?.stop().catch(() => undefined);
    await runner?.stop({ abortRunning: true }).catch(() => undefined);
    if (db?.open) db.close();
    await lock.release();
    throw e;
  }
}
