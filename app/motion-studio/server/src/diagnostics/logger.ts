// Журнал сервера (Task 48): JSONL `<хранилище>/logs/server-YYYY-MM-DD.jsonl`, запись — `ts, level,
// msg` и корреляционные поля (проект, сцена, версия, задача, попытка, запуск агента, рендер);
// каждая запись проходит `redactDeep`. Ротация: файл больше `maxBytes` (10 МБ) уходит в
// `server-YYYY-MM-DD.<n>.jsonl`, всего файлов не больше `maxFiles` (10) — старшие удаляются.
// Запись асинхронная, по очереди; сбой записи (хранилище пропало) журнал не роняет — строки
// теряются. Каталог — только через `safeMkdir` (ADR 0006).
import { appendFile, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { safeMkdir } from "@ms/core";
import { LOG_LEVELS, type LogEntry, type LogLevel, LOGS_MAX_LIMIT, type LogsQuery } from "@ms/contracts/diagnostics";
import { redactDeep } from "./redact.js";

export const LOG_DIR = "logs";
export const LOG_MAX_BYTES = 10 * 1024 * 1024;
export const LOG_MAX_FILES = 10;

export type LogFields = Partial<Omit<LogEntry, "ts" | "level" | "msg">>;

export interface Logger {
  log(level: LogLevel, msg: string, fields?: LogFields): void;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Дождаться записи всех строк (тесты, архив диагностики). */
  flush(): Promise<void>;
}

export interface LoggerOptions {
  maxBytes?: number;
  maxFiles?: number;
  now?: () => Date;
}

const FILE_RE = /^server-(\d{4}-\d{2}-\d{2})(?:\.(\d+))?\.jsonl$/;

/** Порядок файлов от старых к новым: по дате, внутри даты — ротированные по номеру, текущий последним. */
function fileKey(name: string): [string, number] | undefined {
  const m = FILE_RE.exec(name);
  return m ? [m[1]!, m[2] === undefined ? Number.POSITIVE_INFINITY : Number(m[2])] : undefined;
}

function sortFiles(names: string[]): string[] {
  return names
    .map((n) => [n, fileKey(n)] as const)
    .filter((x): x is readonly [string, [string, number]] => x[1] !== undefined)
    .sort((a, b) => (a[1][0] === b[1][0] ? a[1][1] - b[1][1] : a[1][0] < b[1][0] ? -1 : 1))
    .map((x) => x[0]);
}

/** Файлы журнала сервера от старых к новым (полные пути). */
export async function logFiles(root: string): Promise<string[]> {
  const dir = join(root, LOG_DIR);
  const names = await readdir(dir).catch(() => [] as string[]);
  return sortFiles(names).map((n) => join(dir, n));
}

export function createLogger(root: string, opts: LoggerOptions = {}): Logger {
  const maxBytes = opts.maxBytes ?? LOG_MAX_BYTES;
  const maxFiles = opts.maxFiles ?? LOG_MAX_FILES;
  const now = opts.now ?? (() => new Date());
  let pending: { day: string; line: string }[] = [];
  let chain: Promise<void> = Promise.resolve();
  let dir: string | undefined;
  /** Размер текущего файла дня (после первого stat — в памяти). */
  const sizes = new Map<string, number>();

  const currentName = (day: string) => `server-${day}.jsonl`;

  async function rotate(day: string): Promise<void> {
    const names = await readdir(dir!);
    const nums = names.map((n) => FILE_RE.exec(n)).filter((m) => m && m[1] === day && m[2] !== undefined).map((m) => Number(m![2]));
    const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
    await rename(join(dir!, currentName(day)), join(dir!, `server-${day}.${next}.jsonl`));
    sizes.set(day, 0);
  }

  async function prune(): Promise<void> {
    const files = sortFiles(await readdir(dir!));
    for (const f of files.slice(0, Math.max(0, files.length - maxFiles))) await unlink(join(dir!, f)).catch(() => undefined);
  }

  async function size(day: string): Promise<number> {
    const known = sizes.get(day);
    if (known !== undefined) return known;
    const s = await stat(join(dir!, currentName(day))).then((x) => x.size, () => 0);
    sizes.set(day, s);
    return s;
  }

  async function drain(): Promise<void> {
    const batch = pending;
    pending = [];
    if (batch.length === 0) return;
    dir ??= await safeMkdir(root, LOG_DIR);
    let buf = "";
    let bufDay = batch[0]!.day;
    let created = false;
    const write = async () => {
      if (!buf) return;
      const isNew = (await size(bufDay)) === 0;
      await appendFile(join(dir!, currentName(bufDay)), buf);
      sizes.set(bufDay, (sizes.get(bufDay) ?? 0) + Buffer.byteLength(buf));
      created ||= isNew;
      buf = "";
    };
    for (const { day, line } of batch) {
      if (day !== bufDay) {
        await write();
        bufDay = day;
      }
      const cur = (await size(day)) + Buffer.byteLength(buf);
      const len = Buffer.byteLength(line);
      if (cur > 0 && cur + len > maxBytes) {
        await write();
        await rotate(day);
        created = true;
      }
      buf += line;
    }
    await write();
    if (created) await prune();
  }

  const log = (level: LogLevel, msg: string, fields: LogFields = {}) => {
    const d = now();
    const entry = redactDeep({ ts: d.toISOString(), level, msg, ...fields });
    let line: string;
    try {
      line = JSON.stringify(entry) + "\n";
    } catch {
      line = JSON.stringify({ ts: entry.ts, level, msg: redactDeep(msg) }) + "\n";
    }
    pending.push({ day: d.toISOString().slice(0, 10), line });
    if (pending.length === 1) {
      chain = chain.then(drain).catch(() => {
        // хранилище недоступно: строки этой порции потеряны, следующая попробует снова
        dir = undefined;
        sizes.clear();
      });
    }
  };

  return {
    log,
    debug: (m, f) => log("debug", m, f),
    info: (m, f) => log("info", m, f),
    warn: (m, f) => log("warn", m, f),
    error: (m, f) => log("error", m, f),
    flush: async () => {
      // строки, добавленные во время записи, уходят следующей порцией — ждём и её
      for (;;) {
        const c = chain;
        await c;
        if (c === chain && pending.length === 0) return;
      }
    },
  };
}

const RANK: Record<LogLevel, number> = Object.fromEntries(LOG_LEVELS.map((l, i) => [l, i])) as Record<LogLevel, number>;

/**
 * Записи журнала по фильтрам (`GET /api/logs`): уровень — не ниже заданного, задача, проект,
 * `since` (ts ≥); последние `limit` (≤ 1000) по времени, от старых к новым. Файлы читаются
 * от новых к старым и только пока не набран лимит.
 */
export async function readLogs(root: string, q: LogsQuery): Promise<LogEntry[]> {
  const limit = Math.min(q.limit ?? 200, LOGS_MAX_LIMIT);
  const min = q.level ? RANK[q.level] : 0;
  const since = q.since ? Date.parse(q.since) : undefined;
  const out: LogEntry[] = [];
  const files = (await logFiles(root)).reverse();
  for (const f of files) {
    const text = await readFile(f, "utf8").catch(() => "");
    const lines = text.split("\n");
    let older = false;
    for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
      const s = lines[i]!.trim();
      if (!s) continue;
      let e: LogEntry;
      try {
        e = JSON.parse(s) as LogEntry;
      } catch {
        continue; // оборванная строка (сбой посреди записи)
      }
      if (since !== undefined && Date.parse(e.ts) < since) {
        older = true;
        continue;
      }
      if ((RANK[e.level] ?? 0) < min) continue;
      if (q.jobId && e.job_id !== q.jobId) continue;
      if (q.projectId && e.project_id !== q.projectId) continue;
      out.push(e);
    }
    if (out.length >= limit || older) break;
  }
  return out.reverse();
}
