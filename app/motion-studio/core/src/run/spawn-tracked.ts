import { spawn } from "node:child_process";
import type { Writable } from "node:stream";
import { procInfo } from "./proc-info.js";
import { type ProcessRegistry, type TrackedProcess, assertRunRef, fileProcessRegistry, killGroup } from "./processes.js";

export interface SpawnTrackedOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  stdin?: string;
  /** Пауза между SIGTERM и SIGKILL группе после `signal`, мс (5000). */
  killGraceMs?: number;
  registry?: ProcessRegistry;
}

export interface SpawnTrackedResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

// Шлюз: sh ждёт строку на fd 3 и только потом exec-ает команду (pid, группа и время
// старта сохраняются). Так команда не начинает работу, пока запись не легла в реестр.
// Закрытый без строки fd 3 (родитель упал) — выход 125, команда не запускается.
const GATE = 'read -r _ <&3 || exit 125; exec 3<&-; exec "$@"';
// Сколько ждать закрытия stdout/stderr после выхода лидера и SIGKILL группе.
const STDIO_DRAIN_MS = 2000;

/**
 * Запускает команду в своей группе процессов (`detached: true`) с записью в реестре
 * (ADR 0007, п. 3). По `signal` — SIGTERM группе, через `killGraceMs` — SIGKILL.
 * После выхода лидера остатки группы добиваются SIGKILL, и только потом запись
 * удаляется из реестра. Команда не найдена — код 127 от sh, а не исключение.
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

  const child = spawn("/bin/sh", ["-c", GATE, "ms-gate", cmd, ...args], {
    cwd: opts.cwd,
    env: opts.env,
    detached: true,
    stdio: ["pipe", "pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout!.setEncoding("utf8").on("data", (d: string) => (stdout += d));
  child.stderr!.setEncoding("utf8").on("data", (d: string) => (stderr += d));
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
    record = { ...ref, pid, pgid: pid, startedAt: info.startedAt, cmd: [cmd, ...args].join(" ") };
    await registry.add(record);
  } catch (e) {
    killGroup(pid, "SIGKILL");
    await exited.catch(() => undefined);
    if (record) await registry.remove(record).catch(() => undefined);
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
    // ошибка здесь — выход не подтверждён, запись остаётся для reapStale
    res = await exited;
  } finally {
    clearTimeout(graceTimer);
    opts.signal.removeEventListener("abort", onAbort);
  }
  // остатки группы (внуки) не переживают лидера
  killGroup(pid, "SIGKILL");
  let drainTimer: NodeJS.Timeout | undefined;
  await Promise.race([closed, new Promise((r) => (drainTimer = setTimeout(r, STDIO_DRAIN_MS)))]);
  clearTimeout(drainTimer);
  child.stdout!.destroy();
  child.stderr!.destroy();
  await registry.remove(record);
  return { ...res, stdout, stderr };
}
