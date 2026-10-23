// Адаптер ASR (Task 26): CLI-воркер ai-platform `asr_worker.py` подпроцессом. ai-platform не
// меняется и не импортируется: только запуск python окружения mlx-audio с путём воркера и
// аргументами массивом (без shell). Процесс — через spawnTracked: своя группа, запись в реестре
// попытки, отмена — SIGTERM группе и SIGKILL после паузы (ADR 0007). Env — allowlist childEnv +
// PYTHONNOUSERSITE и офлайн-флаги Hugging Face; веса — только локальный каталог модели.
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { type ProcessRegistry, spawnTracked } from "@ms/core";
import { childEnv } from "../agents/env.js";
import type { AsrConfig } from "../config.js";
import { type AsrWorkerOutput, parseAsrOutput } from "./asr-contract.js";
import type { RunRef } from "./ffmpeg.js";

/** Путь воркера в ai-platform (контракт закреплён sha256 этого файла). */
export const WORKER_REL = "app/platform/aiplatform/montage/asr_worker.py";
export const workerPath = (cfg: Pick<AsrConfig, "aiPlatformRoot">): string => join(cfg.aiPlatformRoot, WORKER_REL);
export const modelDir = (cfg: Pick<AsrConfig, "modelsDir">, model: AsrConfig["model"]): string => join(cfg.modelsDir, "asr", model);

/** Вход задачи не годится для воркера (hotwords, язык, пути) — отказ до запуска. */
export class AsrInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsrInputError";
  }
}

export const MAX_HOTWORDS = 50;
export const MAX_HOTWORD_CHARS = 64;
/** Разделитель hotwords воркера (`--hotwords "a|b"`). */
const HOTWORDS_SEP = "|";

/**
 * Hotwords: пробелы по краям обрезаются, пустые выкидываются; запрещены `|` (разделитель
 * воркера), управляющие символы, ведущий `-` (argparse принял бы за флаг); ≤ 64 символов,
 * не больше 50 слов.
 */
export function checkHotwords(list: string[]): string[] {
  const out = list.map((w) => w.normalize("NFC").trim()).filter((w) => w !== "");
  if (out.length > MAX_HOTWORDS) throw new AsrInputError(`hotwords: не больше ${MAX_HOTWORDS} (передано ${out.length})`);
  for (const w of out) {
    if (w.includes(HOTWORDS_SEP)) throw new AsrInputError(`hotwords: «|» — разделитель воркера, в слове недопустим: ${JSON.stringify(w)}`);
    if (/\p{Cc}|\p{Cf}/u.test(w)) throw new AsrInputError(`hotwords: управляющие символы недопустимы: ${JSON.stringify(w)}`);
    if (w.startsWith("-")) throw new AsrInputError(`hotwords: слово не может начинаться с «-»: ${JSON.stringify(w)}`);
    if ([...w].length > MAX_HOTWORD_CHARS) throw new AsrInputError(`hotwords: слово длиннее ${MAX_HOTWORD_CHARS} символов: ${JSON.stringify(w.slice(0, 80))}`);
  }
  return out;
}

/** Код языка whisper: 2–3 строчные латинские буквы (`ru`, `en`). */
export function checkLanguage(lang: string): string {
  if (!/^[a-z]{2,3}$/.test(lang)) throw new AsrInputError(`язык ASR — код из 2–3 латинских строчных букв (ru, en): ${JSON.stringify(lang)}`);
  return lang;
}

/** Секунды разреза — до мс, без хвоста нулей. */
const fmtSec = (x: number) => String(Math.round(x * 1000) / 1000);

export interface AsrArgsInput {
  audio: string;
  out: string;
  language: string;
  splits: number[];
  hotwords: string[];
  model?: AsrConfig["model"];
}

/**
 * Аргументы python: `[<воркер>, --kind whisper, --model <modelsDir>/asr/<модель>, --audio, --out,
 * --language, (--splits a,b), (--hotwords x|y)]`. Пути — только абсолютные; язык и hotwords
 * проверяются (`checkLanguage`, `checkHotwords`).
 */
export function buildAsrArgs(cfg: AsrConfig, i: AsrArgsInput): string[] {
  for (const [k, p] of [["audio", i.audio], ["out", i.out]] as const) {
    if (!isAbsolute(p)) throw new AsrInputError(`путь ${k} для воркера ASR должен быть абсолютным: ${JSON.stringify(p)}`);
  }
  const lang = checkLanguage(i.language);
  const hot = checkHotwords(i.hotwords);
  for (const s of i.splits) if (!Number.isFinite(s) || s <= 0) throw new AsrInputError(`разрез ASR не годится: ${s}`);
  return [
    workerPath(cfg), "--kind", "whisper", "--model", modelDir(cfg, i.model ?? cfg.model),
    "--audio", i.audio, "--out", i.out, "--language", lang,
    ...(i.splits.length > 0 ? ["--splits", i.splits.map(fmtSec).join(",")] : []),
    ...(hot.length > 0 ? ["--hotwords", hot.join(HOTWORDS_SEP)] : []),
  ];
}

/**
 * Окружение воркера: allowlist `childEnv` (PATH, HOME, USER, LANG… — без токенов и PYTHONPATH),
 * TMPDIR попытки в хранилище, `PYTHONNOUSERSITE` (без user site-packages),
 * `PYTHONDONTWRITEBYTECODE` (ничего не писать рядом с исходниками ai-platform), офлайн-режим
 * Hugging Face (веса — локальный каталог, сеть воркеру не нужна).
 */
export function asrEnv(parent: NodeJS.ProcessEnv, tmpdir: string): NodeJS.ProcessEnv {
  return {
    ...childEnv(parent, tmpdir),
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONUNBUFFERED: "1",
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    HF_DATASETS_OFFLINE: "1",
  };
}

const PROGRESS_RE = /^PROGRESS\s+(\d+(?:\.\d+)?)\s*(.*)$/;

/** `PROGRESS 42.5 кусок 2 из 3` → `{ percent: 42.5, stage }` (процент ≤ 100); прочее — undefined. */
export function parseProgress(line: string): { percent: number; stage: string } | undefined {
  const m = PROGRESS_RE.exec(line.trim());
  if (!m) return undefined;
  const p = Number(m[1]);
  if (!Number.isFinite(p)) return undefined;
  return { percent: Math.min(100, p), stage: m[2]!.trim() };
}

/** Строки прогресса из кусков stdout. */
export class ProgressParser {
  private buf = "";
  constructor(private readonly on: (percent: number, stage: string) => void) {}
  push(chunk: string): void {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 1);
      const p = parseProgress(line);
      if (p) this.on(p.percent, p.stage);
    }
    if (this.buf.length > 64 * 1024) this.buf = "";
  }
}

export type AsrRunErrorKind = "aborted" | "timeout" | "no_output" | "failed" | "orphaned";

/** Запуск воркера не удался: отмена, таймауты, код ≠ 0, группа не исчезла (`orphaned`). */
export class AsrRunError extends Error {
  constructor(readonly kind: AsrRunErrorKind, message: string, readonly stderrTail = "", readonly pids: number[] = []) {
    super(message);
    this.name = "AsrRunError";
  }
}

export interface TranscribeInput {
  audio16k: string;
  /** Длительность звука, который получит воркер (из заголовка wav), с. */
  audioDurationS: number;
  language: string;
  hotwords: string[];
  splits: number[];
  model?: AsrConfig["model"];
  /** Каталог попытки: cwd воркера, `words.json`, TMPDIR. */
  workdir: string;
  tmpdir: string;
  run: RunRef;
  signal: AbortSignal;
  registry?: ProcessRegistry;
  onProgress(percent: number, stage: string): void;
}

export interface TranscribeResult {
  output: AsrWorkerOutput;
  /** Сырой вывод воркера (`words.json`). */
  raw: string;
  outPath: string;
  splits: number[];
  elapsedMs: number;
  stderrTail: string;
}

const STDERR_TAIL = 4000;

export class AsrAdapter {
  constructor(
    private readonly cfg: AsrConfig,
    private readonly deps: { spawn?: typeof spawnTracked; killGraceMs?: number; parentEnv?: NodeJS.ProcessEnv } = {},
  ) {}

  /**
   * Воркер на `audio16k` → проверенный вывод (`parseAsrOutput`; нарушение — `AsrContractError`
   * с началом вывода). Общий таймаут `timeoutMs`, без вывода в stdout/stderr дольше
   * `noOutputTimeoutMs` — остановка группы (`AsrRunError` timeout / no_output).
   */
  async transcribe(i: TranscribeInput): Promise<TranscribeResult> {
    i.signal.throwIfAborted();
    const outPath = join(i.workdir, "words.json");
    const args = buildAsrArgs(this.cfg, { audio: i.audio16k, out: outPath, language: i.language, splits: i.splits, hotwords: i.hotwords, ...(i.model ? { model: i.model } : {}) });
    const ac = new AbortController();
    let why: "timeout" | "no_output" | "aborted" | undefined;
    const stop = (w: NonNullable<typeof why>) => {
      why ??= w;
      ac.abort();
    };
    const total = setTimeout(() => stop("timeout"), this.cfg.timeoutMs);
    let silent: NodeJS.Timeout = setTimeout(() => stop("no_output"), this.cfg.noOutputTimeoutMs);
    const alive = () => {
      clearTimeout(silent);
      silent = setTimeout(() => stop("no_output"), this.cfg.noOutputTimeoutMs);
    };
    const onAbort = () => stop("aborted");
    i.signal.addEventListener("abort", onAbort, { once: true });
    const progress = new ProgressParser((p, st) => i.onProgress(p, st));
    const registry = i.registry ?? i.run.registry;
    const t0 = Date.now();
    let r: Awaited<ReturnType<typeof spawnTracked>>;
    try {
      r = await (this.deps.spawn ?? spawnTracked)(i.run.root, { runId: i.run.runId, attempt: i.run.attempt }, this.cfg.python, args, {
        cwd: i.workdir,
        env: asrEnv(this.deps.parentEnv ?? process.env, i.tmpdir),
        signal: ac.signal,
        killGraceMs: this.deps.killGraceMs ?? 5000,
        ...(registry ? { registry } : {}),
        maxOutputChars: 1024 * 1024,
        onStdout: (d) => {
          alive();
          progress.push(d);
        },
        onStderr: () => alive(),
      });
    } finally {
      clearTimeout(total);
      clearTimeout(silent);
      i.signal.removeEventListener("abort", onAbort);
    }
    const elapsedMs = Date.now() - t0;
    const stderrTail = r.stderr.slice(-STDERR_TAIL);
    if (r.orphaned) throw new AsrRunError("orphaned", "группа воркера ASR не исчезла после SIGKILL; запись оставлена в реестре (stale_process)", stderrTail);
    if (why === "aborted") throw new AsrRunError("aborted", "воркер ASR остановлен: попытка прервана", stderrTail);
    if (why === "timeout") throw new AsrRunError("timeout", `воркер ASR не уложился в ${Math.round(this.cfg.timeoutMs / 1000)} с (asr.timeoutMs)`, stderrTail);
    if (why === "no_output") throw new AsrRunError("no_output", `воркер ASR: нет вывода ${Math.round(this.cfg.noOutputTimeoutMs / 1000)} с (asr.noOutputTimeoutMs) — остановлен`, stderrTail);
    if (r.code !== 0) {
      const how = r.code === null ? `сигнал ${r.signal}` : `код ${r.code}`;
      throw new AsrRunError("failed", `воркер ASR завершился: ${how}: ${stderrTail.trim().slice(-1500) || "stderr пуст"}`, stderrTail);
    }
    const raw = await readFile(outPath, "utf8").catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return "";
      throw e;
    });
    const output = parseAsrOutput(raw, { audioDurationS: i.audioDurationS });
    return { output, raw, outPath, splits: i.splits, elapsedMs, stderrTail };
  }
}
