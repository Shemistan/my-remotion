// Вызовы системных ffmpeg/ffprobe для медиа видеопроекта (Task 25). С `run` — через
// spawnTracked (своя группа процессов, запись в реестре попытки, по `signal` SIGTERM группе и
// SIGKILL через 2 с); без `run` (тесты, CLI-утилиты) — обычный дочерний процесс с отменой.
// Прогресс — `-progress pipe:1 -nostats` (`out_time_us=` в stdout). Сеть не нужна: входы
// вызывающие передают как `file:<абсолютный путь>` с `-protocol_whitelist file`.
import { spawn } from "node:child_process";
import { type ProcessRegistry, spawnTracked } from "@ms/core";
import { FfmpegError, findOnPath } from "@ms/render";

export { FfmpegError };

/** Контекст попытки (как `JobContext.run`). */
export interface RunRef {
  root: string;
  runId: string;
  attempt: number;
  registry?: ProcessRegistry;
}

export interface ToolOptions {
  run?: RunRef;
  signal?: AbortSignal;
  /** По умолчанию 4 ч. */
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  /** Подмена для тестов. */
  spawn?: typeof spawnTracked;
}

export interface ToolResult {
  code: number;
  stdout: string;
  stderrTail: string;
}

const STDERR_TAIL = 4000;
const DEFAULT_TIMEOUT_MS = 4 * 60 * 60_000;

async function bin(name: "ffmpeg" | "ffprobe"): Promise<string> {
  const b = await findOnPath(name);
  if (!b) throw new FfmpegError("failed", `${name} не найден в PATH (brew install ffmpeg)`);
  return b;
}

function env(): NodeJS.ProcessEnv {
  const e: NodeJS.ProcessEnv = { LANG: process.env.LANG ?? "en_US.UTF-8" };
  if (process.env.PATH !== undefined) e.PATH = process.env.PATH;
  return e;
}

/**
 * ffmpeg или ffprobe с аргументами `args`. Код выхода возвращается (решает вызывающий);
 * исключение `FfmpegError` — отмена (`aborted`), таймаут, нет бинарника и `orphaned`
 * (группа не исчезла после SIGKILL — запись остаётся в реестре, rulings п. 13).
 */
export async function runTool(name: "ffmpeg" | "ffprobe", args: string[], o: ToolOptions = {}): Promise<ToolResult> {
  if (o.signal?.aborted) throw new FfmpegError("aborted", `${name}: отменено до запуска`);
  const path = await bin(name);
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ac = new AbortController();
  let why: "timeout" | "aborted" | undefined;
  const timer = setTimeout(() => {
    why ??= "timeout";
    ac.abort();
  }, timeoutMs);
  const onAbort = () => {
    why ??= "aborted";
    ac.abort();
  };
  o.signal?.addEventListener("abort", onAbort, { once: true });
  if (o.signal?.aborted) onAbort();
  const onStdout = (d: string) => {
    try {
      o.onStdout?.(d);
    } catch {
      // ошибка наблюдателя прогресса не должна ронять процесс
    }
  };
  try {
    let r: { code: number | null; stdout: string; stderr: string; orphaned: boolean };
    if (o.run) {
      r = await (o.spawn ?? spawnTracked)(o.run.root, { runId: o.run.runId, attempt: o.run.attempt }, path, args, {
        cwd: o.run.root, env: env(), signal: ac.signal, registry: o.run.registry, killGraceMs: 2000, onStdout, maxOutputChars: 4 * 1024 * 1024,
      });
    } else {
      r = await plain(path, args, ac.signal, onStdout);
    }
    if (r.orphaned) throw new FfmpegError("orphaned", `группа ${name} не исчезла после SIGKILL; запись оставлена в реестре (stale_process)`);
    if (why) throw new FfmpegError(why, why === "timeout" ? `${name} не уложился в ${timeoutMs} мс` : `${name} отменён`);
    return { code: r.code ?? -1, stdout: r.stdout, stderrTail: r.stderr.slice(-STDERR_TAIL) };
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener("abort", onAbort);
  }
}

function plain(path: string, args: string[], signal: AbortSignal, onStdout: (d: string) => void) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; orphaned: boolean }>((resolve, reject) => {
    const child = spawn(path, args, { env: env(), stdio: ["ignore", "pipe", "pipe"], signal, killSignal: "SIGKILL" });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (d: string) => {
      stdout += d;
      onStdout(d);
    });
    child.stderr.setEncoding("utf8").on("data", (d: string) => {
      stderr = (stderr + d).slice(-STDERR_TAIL * 4);
    });
    child.on("error", (e) => {
      if ((e as { name?: string }).name === "AbortError") return; // итог — по close
      reject(e);
    });
    child.on("close", (code) => resolve({ code, stdout, stderr, orphaned: false }));
  });
}

/** `out_time_us=…` строки `-progress` → µs; прочее и `N/A` — `undefined`. */
export function parseFfmpegProgress(line: string): number | undefined {
  const m = /^out_time_us=(-?\d+)\s*$/.exec(line.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Сборка строк `-progress` из кусков stdout. */
export class ProgressLines {
  private buf = "";
  constructor(private readonly onUs: (us: number) => void) {}
  push(chunk: string): void {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 1);
      const us = parseFfmpegProgress(line);
      if (us !== undefined) this.onUs(us);
    }
  }
}

export interface FfmpegRunOptions {
  run?: RunRef;
  signal: AbortSignal;
  /** Длительность выхода (µs) — для доли прогресса. */
  durationUs?: number;
  onProgress?: (p: number) => void;
  timeoutMs?: number;
  spawn?: typeof spawnTracked;
}

/**
 * ffmpeg с прогрессом: `-hide_banner -nostdin -progress pipe:1 -nostats` + `args`.
 * Ненулевой код — `FfmpegError("failed")` с хвостом stderr.
 */
export async function runFfmpeg(args: string[], o: FfmpegRunOptions): Promise<{ code: number; stderrTail: string }> {
  const lines = new ProgressLines((us) => {
    if (o.durationUs && o.durationUs > 0) o.onProgress?.(Math.min(1, us / o.durationUs));
  });
  const r = await runTool("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-progress", "pipe:1", "-nostats", ...args], {
    ...(o.run ? { run: o.run } : {}),
    signal: o.signal,
    ...(o.timeoutMs ? { timeoutMs: o.timeoutMs } : {}),
    ...(o.spawn ? { spawn: o.spawn } : {}),
    onStdout: (d) => lines.push(d),
  });
  if (r.code !== 0) throw new FfmpegError("failed", `ffmpeg: код ${r.code}: ${r.stderrTail.trim().slice(-2000)}`);
  return { code: r.code, stderrTail: r.stderrTail };
}
