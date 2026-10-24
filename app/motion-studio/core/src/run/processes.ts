import { readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { StorageError, rootProblem } from "../storage/guard.js";
import { safeMkdir } from "../storage/safe-mkdir.js";
import { procInfo } from "./proc-info.js";

/** Дочерний процесс попытки прогона (ADR 0007, п. 3). */
export interface TrackedProcess {
  runId: string;
  attempt: number;
  pid: number;
  pgid: number;
  startedAt: string;
  /**
   * Команда с аргументами — для диагностики (UI показывает PID и команду). Пишется на
   * диск открытым текстом: секреты (токены, ключи) передавать только через env/stdin,
   * никогда аргументами.
   */
  cmd: string;
}

/** Итог процесса для `ProcessRegistry.end` (неизвестен — оба `null`). */
export interface ProcessExit {
  code: number | null;
  signal: string | null;
}

/** Фильтр записей реестра: прогон (= задача) и, при необходимости, попытка. */
export interface RegistryFilter {
  runId?: string;
  attempt?: number;
}

/**
 * Реестр дочерних процессов (ADR 0007, п. 3). Реализации: `fileProcessRegistry`
 * (`run/processes/`, CLI, тесты, «боковой» реестр Chrome) и `SqliteProcessRegistry`
 * сервера (`job_processes` + копия в памяти).
 */
export interface ProcessRegistry {
  /** Запись до начала работы процесса; сбой — процесс не запускается. */
  add(p: TrackedProcess): Promise<void>;
  /**
   * Процесс (вся его группа) подтверждённо завершён. Вызывать только после исчезновения
   * группы; повтор или отсутствующая запись — не ошибка.
   */
  end(p: TrackedProcess, exit: ProcessExit): Promise<void>;
  /** Записи без подтверждённого завершения (живы ли процессы — проверяет вызывающий). */
  live(filter?: RegistryFilter): Promise<TrackedProcess[]>;
}

/** Совпадает ли запись с фильтром. */
export function matches(p: TrackedProcess, filter: RegistryFilter = {}): boolean {
  return (filter.runId === undefined || p.runId === filter.runId) && (filter.attempt === undefined || p.attempt === filter.attempt);
}

/** Только поля записи (ref может нести `root`, `registry` и т. п. — в реестр они не идут). */
export function trackedRecord(p: TrackedProcess): TrackedProcess {
  return { runId: p.runId, attempt: p.attempt, pid: p.pid, pgid: p.pgid, startedAt: p.startedAt, cmd: p.cmd };
}

const PROCESSES_DIR = "run/processes";
export const SAFE_ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

export function assertRunRef(ref: { runId: string; attempt: number }): void {
  if (!SAFE_ID.test(ref.runId)) throw new Error(`runId не годится для имени файла: ${JSON.stringify(ref.runId)}`);
  if (!Number.isInteger(ref.attempt) || ref.attempt < 1) throw new Error(`attempt должен быть ≥ 1: ${ref.attempt}`);
}

function fileName(p: TrackedProcess): string {
  return `${p.runId}-a${p.attempt}-${p.pid}.json`;
}

/**
 * Реестр в файлах `run/processes/<runId>-a<attempt>-<pid>.json`. `end` удаляет файл:
 * истории здесь нет, только незавершённые процессы.
 */
export function fileProcessRegistry(root: string): ProcessRegistry {
  const dirPath = join(root, PROCESSES_DIR);
  return {
    async add(p) {
      assertRunRef(p);
      const rec = trackedRecord(p);
      const dir = await safeMkdir(root, PROCESSES_DIR);
      const file = join(dir, fileName(rec));
      // запись атомарна: читатель видит либо целый файл, либо никакого
      const tmp = join(dir, `.${fileName(rec)}.tmp`);
      await writeFile(tmp, JSON.stringify(rec, null, 2) + "\n");
      await rename(tmp, file);
    },
    async end(p) {
      assertRunRef(p);
      await rm(join(dirPath, fileName(p)), { force: true });
    },
    async live(filter) {
      let names: string[];
      try {
        names = await readdir(dirPath);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        // нет каталога — записей нет, но только если само хранилище на месте:
        // пропавший диск не должен выглядеть как «процессов нет»
        const problem = await rootProblem(root);
        if (problem) throw new StorageError("not_found", `корень хранилища недоступен: ${problem}`);
        return [];
      }
      const out: TrackedProcess[] = [];
      for (const n of names.sort()) {
        if (n.startsWith(".") || !n.endsWith(".json")) continue;
        // битая запись — ошибка, а не «процесса нет»
        const p = JSON.parse(await readFile(join(dirPath, n), "utf8")) as TrackedProcess;
        if (matches(p, filter)) out.push(p);
      }
      return out;
    },
  };
}

export type KillFn = (pid: number, signal: NodeJS.Signals) => void;

/**
 * Сигнал всей группе; группы уже нет — не ошибка. EPERM тоже глотаем: macOS отдаёт его,
 * когда в группе остались только зомби. Смерть процессов вызывающий проверяет отдельно.
 */
export function killGroup(pgid: number, signal: NodeJS.Signals, kill: KillFn = process.kill): void {
  try {
    kill(-pgid, signal);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== "ESRCH" && code !== "EPERM") throw e;
  }
}

export interface ReapOptions {
  registry?: ProcessRegistry;
  /** Подменяется в тестах; по умолчанию `process.kill`. */
  kill?: KillFn;
  /** Пауза между SIGTERM и SIGKILL, мс (5000). */
  graceMs?: number;
  /** Сколько ждать выхода после SIGKILL, мс (30000). */
  waitMs?: number;
}

/**
 * Разбирает реестр попытки (или всех попыток прогона, если `attempt` не задан) перед
 * повторным запуском (ADR 0007, п. 4). Мёртвые записи (или с другим `startedAt` — pid
 * переиспользован) закрываются `end`; живым группам — SIGTERM, через `graceMs` —
 * SIGKILL, затем ожидание выхода до `waitMs`. `clean: false` — кто-то остался жив; их
 * записи остаются в реестре.
 */
export async function reapAttempt(
  registry: ProcessRegistry,
  filter: { runId: string; attempt?: number },
  opts: Omit<ReapOptions, "registry"> = {},
): Promise<{ clean: boolean; alive: TrackedProcess[] }> {
  const kill = opts.kill ?? process.kill;
  const graceMs = opts.graceMs ?? 5000;
  const waitMs = opts.waitMs ?? 30_000;

  let alive = await dropDead(registry, await registry.live(filter));
  if (alive.length === 0) return { clean: true, alive: [] };

  for (const p of alive) killGroup(p.pgid, "SIGTERM", kill);
  alive = await waitDead(registry, alive, graceMs);
  if (alive.length > 0) {
    for (const p of alive) killGroup(p.pgid, "SIGKILL", kill);
    alive = await waitDead(registry, alive, waitMs);
  }
  return { clean: alive.length === 0, alive };
}

/** Срез: все попытки прогона по файловому реестру (или `opts.registry`). */
export function reapStale(root: string, runId: string, opts: ReapOptions = {}): Promise<{ clean: boolean; alive: TrackedProcess[] }> {
  return reapAttempt(opts.registry ?? fileProcessRegistry(root), { runId }, opts);
}

/**
 * Жива ли попытка: лидер с тем же `startedAt` или, если лидера нет, остатки его группы.
 * pid лидера занят другим процессом — значит, группы уже нет (pgid не переиспользуется,
 * пока группа существует).
 */
export async function isTrackedAlive(p: TrackedProcess): Promise<boolean> {
  const info = await procInfo(p.pid);
  if (info) return info.startedAt === p.startedAt;
  return groupExists(p.pgid);
}

/** Есть ли ещё процессы в группе (EPERM — есть, но сигнал не доставить, например зомби). */
export function groupExists(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** Удаляет записи завершившихся процессов, возвращает живые. */
async function dropDead(registry: ProcessRegistry, ps: TrackedProcess[]): Promise<TrackedProcess[]> {
  const alive: TrackedProcess[] = [];
  for (const p of ps) {
    if (await isTrackedAlive(p)) alive.push(p);
    else await registry.end(p, { code: null, signal: null });
  }
  return alive;
}

async function waitDead(registry: ProcessRegistry, ps: TrackedProcess[], ms: number): Promise<TrackedProcess[]> {
  const until = Date.now() + ms;
  let alive = await dropDead(registry, ps);
  while (alive.length > 0 && Date.now() < until) {
    await new Promise((r) => setTimeout(r, Math.min(100, Math.max(1, until - Date.now()))));
    alive = await dropDead(registry, alive);
  }
  return alive;
}
