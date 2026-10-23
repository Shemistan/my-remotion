import { spawn } from "node:child_process";
import type { Writable } from "node:stream";
import { procInfo } from "./proc-info.js";
import {
  type ProcessRegistry,
  type TrackedProcess,
  assertRunRef,
  fileProcessRegistry,
  groupExists,
  killGroup,
} from "./processes.js";

export interface SpawnTrackedOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  stdin?: string;
  /** Пауза между SIGTERM и SIGKILL группе после `signal`, мс (5000). */
  killGraceMs?: number;
  registry?: ProcessRegistry;
  /** Сколько ждать исчезновения группы после выхода лидера и SIGKILL, мс (30000). */
  groupWaitMs?: number;
  /** Проверка «группа ещё есть»; подменяется в тестах. По умолчанию `kill(-pgid, 0)`. */
  groupAlive?: (pgid: number) => boolean;
  /**
   * Сколько последних символов stdout и stderr хранить (8 Ми на поток): зависший агент
   * или Chrome с потоком логов иначе съест память сервера. Обрезанный поток начинается
   * строкой `…[обрезано N символов]`.
   */
  maxOutputChars?: number;
  /** Куски stdout по мере поступления (прогресс `ffmpeg -progress pipe:1`); хвост копится как обычно. */
  onStdout?: (chunk: string) => void;
}

/** Хвост потока ограниченной длины; амортизированно O(1) на кусок. */
class Tail {
  private buf = "";
  private dropped = 0;
  constructor(private readonly max: number) {}
  push(d: string): void {
    this.buf += d;
    if (this.buf.length > 2 * this.max) this.trim();
  }
  private trim(): void {
    if (this.buf.length <= this.max) return;
    this.dropped += this.buf.length - this.max;
    this.buf = this.buf.slice(-this.max);
  }
  text(): string {
    this.trim();
    return this.dropped > 0 ? `…[обрезано ${this.dropped} символов]\n${this.buf}` : this.buf;
  }
}

const MAX_OUTPUT_CHARS = 8 * 1024 * 1024;

export interface SpawnTrackedResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  /**
   * Группа не исчезла за `groupWaitMs` после выхода лидера (например, процесс висит в
   * непрерываемом вводе-выводе на отключённом диске). Запись осталась в реестре;
   * вызывающий обязан считать попытку незавершённой (`stale_process`).
   */
  orphaned: boolean;
}

// Шлюз: sh ждёт строку на fd 3 и только потом exec-ает команду (pid, группа и время
// старта сохраняются). Так команда не начинает работу, пока запись не легла в реестр.
// Закрытый без строки fd 3 (родитель упал) — выход 125, команда не запускается.
const GATE = 'read -r _ <&3 || exit 125; exec 3<&-; exec "$@"';
// Сколько ждать закрытия stdout/stderr после выхода лидера и SIGKILL группе.
const STDIO_DRAIN_MS = 2000;

/**
 * Запускает команду в своей группе процессов (`detached: true`) с записью в реестре
 * (ADR 0007, п. 3; `opts.registry`, по умолчанию файловый — только CLI и тесты). По
 * `signal` — SIGTERM группе, через `killGraceMs` — SIGKILL. После выхода лидера остатки
 * группы добиваются SIGKILL; `registry.end` — только когда группа подтверждённо исчезла,
 * иначе `orphaned: true` и запись остаётся. `ref` может нести лишние поля (`root`,
 * `registry` контекста прогона) — в запись идут только `runId` и `attempt`.
 *
 * Команда не найдена — код 127 от sh, а не исключение; но 127 может вернуть и сама
 * команда, поэтому бинарник вызывающий проверяет заранее (doctor). `cmd` и `args`
 * пишутся в `run/processes/` открытым текстом — секреты аргументами не передавать.
 */
export async function spawnTracked(
  root: string,
  ref: { runId: string; attempt: number },
  cmd: string,
  args: string[],
  opts: SpawnTrackedOptions,
): Promise<SpawnTrackedResult> {
  assertRunRef(ref);
  opts.signal.throwIfAborted();
  const registry = opts.registry ?? fileProcessRegistry(root);
  const killGraceMs = opts.killGraceMs ?? 5000;
  const groupWaitMs = opts.groupWaitMs ?? 30_000;
  const groupAlive = opts.groupAlive ?? groupExists;

  const child = spawn("/bin/sh", ["-c", GATE, "ms-gate", cmd, ...args], {
    cwd: opts.cwd,
    env: opts.env,
    detached: true,
    stdio: ["pipe", "pipe", "pipe", "pipe"],
  });

  const maxOut = opts.maxOutputChars ?? MAX_OUTPUT_CHARS;
  const stdout = new Tail(maxOut);
  const stderr = new Tail(maxOut);
  child.stdout!.setEncoding("utf8").on("data", (d: string) => {
    stdout.push(d);
    try {
      opts.onStdout?.(d);
    } catch {
      // ошибка наблюдателя (прогресс) не должна ронять процесс сервера и терять вывод
    }
  });
  child.stderr!.setEncoding("utf8").on("data", (d: string) => stderr.push(d));
  const gate = child.stdio[3] as Writable;
  // EPIPE и т.п., если процесс умер раньше, — не повод ронять сервер
  child.stdin!.on("error", () => undefined);
  gate.on("error", () => undefined);

  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));

  const pid = child.pid;
  if (pid === undefined) {
    // spawn не удался (например, нет cwd) — процесса и группы нет
    await exited;
    throw new Error(`spawnTracked: не удалось запустить ${cmd}`);
  }

  let record: TrackedProcess | undefined;
  try {
    const info = await procInfo(pid);
    if (!info) throw new Error(`spawnTracked: процесс ${pid} исчез до регистрации`);
    record = { runId: ref.runId, attempt: ref.attempt, pid, pgid: pid, startedAt: info.startedAt, cmd: [cmd, ...args].join(" ") };
    await registry.add(record);
  } catch (e) {
    killGroup(pid, "SIGKILL");
    await exited.catch(() => undefined);
    // группа убита и лидер вышел; остатков быть не может — шлюз не открывался
    if (record && !groupAlive(pid)) await registry.end(record, { code: null, signal: "SIGKILL" }).catch(() => undefined);
    throw e;
  }

  let graceTimer: NodeJS.Timeout | undefined;
  const onAbort = () => {
    killGroup(pid, "SIGTERM");
    graceTimer = setTimeout(() => killGroup(pid, "SIGKILL"), killGraceMs);
  };
  if (opts.signal.aborted) onAbort();
  else opts.signal.addEventListener("abort", onAbort, { once: true });

  // запись в реестре есть — открываем шлюз и отдаём stdin
  gate.end("go\n");
  child.stdin!.end(opts.stdin ?? "");

  let res: { code: number | null; signal: string | null };
  try {
    // ошибка здесь — выход не подтверждён, запись остаётся для reapAttempt
    res = await exited;
  } finally {
    clearTimeout(graceTimer);
    opts.signal.removeEventListener("abort", onAbort);
  }
  // остатки группы (внуки) не переживают лидера; проверка до сигнала сужает окно,
  // в котором pgid мог бы достаться чужой группе
  let orphaned = false;
  if (groupAlive(pid)) {
    killGroup(pid, "SIGKILL");
    orphaned = !(await waitGroupGone(pid, groupAlive, groupWaitMs));
  }
  let drainTimer: NodeJS.Timeout | undefined;
  await Promise.race([closed, new Promise((r) => (drainTimer = setTimeout(r, STDIO_DRAIN_MS)))]);
  clearTimeout(drainTimer);
  child.stdout!.destroy();
  child.stderr!.destroy();
  // группа жива — запись остаётся для reapAttempt
  if (!orphaned) await registry.end(record, res);
  return { ...res, stdout: stdout.text(), stderr: stderr.text(), orphaned };
}

async function waitGroupGone(pgid: number, alive: (pgid: number) => boolean, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (alive(pgid)) {
    if (Date.now() >= until) return false;
    await new Promise((r) => setTimeout(r, Math.min(50, Math.max(1, until - Date.now()))));
  }
  return true;
}
