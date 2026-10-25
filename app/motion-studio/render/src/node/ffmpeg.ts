// Разовые вызовы ffmpeg (S19: `.deps/ffmpeg`, иначе PATH) (проверки экспорта: альфа угла, сверка темпа). С `run` —
// через spawnTracked: процесс в реестре попытки, отменяется её сигналом (правило Task 13
// «все дочерние процессы через реестр»); без `run` (CLI, тесты) — execFile.
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTool, safeMkdir, spawnTracked } from "@ms/core";
import type { RunRef } from "./render-version.js";

export const FFMPEG_TIMEOUT_MS = 60_000;

export interface FfmpegOptions {
  /** Контекст попытки: процесс ffmpeg регистрируется в её реестре. */
  run?: RunRef;
  /** Отмена вызывающего: группа ffmpeg убивается. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Подмена для юнит-тестов. */
  spawn?: typeof spawnTracked;
}

/**
 * Сбой вызова ffmpeg: `orphaned` — группа не исчезла после SIGKILL (stale_process), `aborted` —
 * сигнал вызывающего, `timeout` — не уложился, `failed` — ненулевой код или нет ffmpeg.
 */
export class FfmpegError extends Error {
  constructor(readonly kind: "orphaned" | "aborted" | "timeout" | "failed", message: string) {
    super(message);
  }
}

/** ffmpeg: закреплённая сборка `.deps/ffmpeg` (S19), иначе системный из PATH. */
export async function ffmpegBin(): Promise<string> {
  const t = resolveTool("ffmpeg");
  if (!t) throw new FfmpegError("failed", "render: ffmpeg не найден ни в .deps/ffmpeg, ни в PATH (./setup ставит закреплённую сборку в .deps/ffmpeg)");
  return t.path;
}

/** Временный каталог проверки: у попытки — в `run/tmp` хранилища, иначе системный. */
export async function scratchDir(o: FfmpegOptions, tag: string): Promise<string> {
  if (!o.run) return mkdtemp(join(tmpdir(), `ms-${tag}-`));
  const base = await safeMkdir(o.run.root, "run/tmp");
  return mkdtemp(join(base, `${o.run.runId}-a${o.run.attempt}-${tag}-`));
}

export async function removeScratch(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

/** ffmpeg с аргументами `args` (вывод — в файлы из `args`); бросает `FfmpegError`. */
export async function runFfmpeg(args: string[], cwd: string, o: FfmpegOptions = {}): Promise<void> {
  if (o.signal?.aborted) throw new FfmpegError("aborted", "ffmpeg: отменено до запуска");
  const bin = await ffmpegBin();
  const timeoutMs = o.timeoutMs ?? FFMPEG_TIMEOUT_MS;
  if (!o.run) {
    await new Promise<void>((resolve, reject) => {
      execFile(bin, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024, signal: o.signal }, (err, _out, stderr) => {
        if (!err) return resolve();
        const kind = o.signal?.aborted ? "aborted" : (err as { killed?: boolean }).killed ? "timeout" : "failed";
        reject(new FfmpegError(kind, `ffmpeg: ${String(stderr).trim() || err.message}`));
      });
    });
    return;
  }
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
  try {
    const env: NodeJS.ProcessEnv = { LANG: process.env.LANG ?? "en_US.UTF-8", TMPDIR: cwd };
    if (process.env.PATH !== undefined) env.PATH = process.env.PATH;
    const r = await (o.spawn ?? spawnTracked)(o.run.root, { runId: o.run.runId, attempt: o.run.attempt }, bin, args, {
      cwd, env, signal: ac.signal, registry: o.run.registry, killGraceMs: 2000,
    });
    if (r.orphaned) throw new FfmpegError("orphaned", "группа ffmpeg не исчезла после SIGKILL; запись оставлена в реестре (stale_process)");
    if (why) throw new FfmpegError(why, why === "timeout" ? `ffmpeg не уложился в ${timeoutMs} мс` : "ffmpeg отменён");
    if (r.code !== 0) throw new FfmpegError("failed", `ffmpeg: код ${r.code}: ${r.stderr.trim().slice(-2000)}`);
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener("abort", onAbort);
  }
}
