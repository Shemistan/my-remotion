// Архив диагностики (Task 48): zip в `<хранилище>/diagnostics/diag-<ts>.zip` — журналы сервера за
// 7 дней, `doctor.json`, `db.json` (`PRAGMA user_version`, число строк), последние 2000
// `job_events`, `boot_reports`, `stderr.log` вызовов агентов за 7 дней; промпты агентов
// (`prompt.md`) — только при `includePrompts`. Без медиа, превью и вывода агентов. Всё текстовое
// проходит `redact`. Zip пишется своим кодом (deflate из `node:zlib`) — без зависимости `yazl`.
import { open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { crc32, deflateRaw } from "node:zlib";
import { safeMkdir, type StorageStatus } from "@ms/core";
import type { DoctorReportDto } from "@ms/contracts";
import type { Db } from "../db/open.js";
import { runDoctor } from "./doctor-checks.js";
import { logFiles } from "./logger.js";
import { redact, redactDeep } from "./redact.js";

export const BUNDLE_DIR = "diagnostics";
export const BUNDLE_DAYS = 7;
export const BUNDLE_EVENTS = 2_000;
/** Каталог журналов вызовов агентов (`ClaudeCodeRuntime.logRoot`, boot.ts). */
const AGENT_LOGS = join("logs", "agent-runs");

export interface BundleCore {
  root: string;
  db: Db;
  storageCheck?: () => Promise<StorageStatus>;
}

export interface BundleOptions {
  includePrompts: boolean;
  /** Отчёт doctor (по умолчанию быстрый `runDoctor` с базой сервера). */
  doctor?: () => Promise<DoctorReportDto>;
  now?: () => Date;
  /** Имя, заранее выданное клиенту (`POST /api/diagnostics/bundle`); занято — ошибка. */
  name?: string;
}

const deflate = promisify(deflateRaw);

/** Имя архива по времени: `diag-YYYYMMDDTHHMMSS.zip`. */
export function bundleName(d: Date, n = 0): string {
  const ts = d.toISOString().replace(/[-:]/g, "").slice(0, 15);
  return `diag-${ts}${n > 0 ? `-${n}` : ""}.zip`;
}

export async function diagnosticBundle(core: BundleCore, opts: BundleOptions): Promise<{ path: string; name: string; bytes: number }> {
  const now = (opts.now ?? (() => new Date()))();
  const since = now.getTime() - BUNDLE_DAYS * 24 * 3600 * 1000;
  const entries: { name: string; data: Buffer }[] = [];
  const add = (name: string, text: string) => entries.push({ name, data: Buffer.from(text, "utf8") });

  // журналы сервера за 7 дней
  for (const f of await logFiles(core.root)) {
    const s = await stat(f).catch(() => undefined);
    if (!s || s.mtimeMs < since) continue;
    add(`logs/${basename(f)}`, redact(await readFile(f, "utf8")));
  }

  // doctor
  let doctor: unknown;
  try {
    doctor = await (opts.doctor ?? (() => runDoctor({ fast: true, db: core.db, env: { ...process.env, MS_DATA_DIR: core.root }, ...(core.storageCheck ? { storage: core.storageCheck } : {}) })))();
  } catch (e) {
    doctor = { error: (e as Error).message };
  }
  add("doctor.json", JSON.stringify(redactDeep(doctor), null, 2));

  // база: версия схемы и размеры таблиц
  const tables = core.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").pluck().all() as string[];
  add("db.json", JSON.stringify({
    user_version: core.db.pragma("user_version", { simple: true }),
    tables: Object.fromEntries(tables.map((t) => [t, core.db.prepare(`SELECT count(*) FROM "${t.replace(/"/g, '""')}"`).pluck().get()])),
  }, null, 2));

  // последние 2000 событий задач и отчёты старта
  const events = (core.db.prepare("SELECT * FROM job_events ORDER BY id DESC LIMIT ?").all(BUNDLE_EVENTS) as Record<string, unknown>[]).reverse();
  add("job_events.jsonl", events.map((e) => JSON.stringify(redactDeep(e))).join("\n") + (events.length > 0 ? "\n" : ""));
  add("boot_reports.json", JSON.stringify(redactDeep(core.db.prepare("SELECT * FROM boot_reports ORDER BY created_at").all()), null, 2));

  // вызовы агентов за 7 дней: stderr, промпт — по флагу
  const agentRoot = join(core.root, AGENT_LOGS);
  for (const run of await readdir(agentRoot).catch(() => [] as string[])) {
    for (const leaf of await readdir(join(agentRoot, run)).catch(() => [] as string[])) {
      const dir = join(agentRoot, run, leaf);
      const s = await stat(dir).catch(() => undefined);
      if (!s?.isDirectory() || s.mtimeMs < since) continue;
      for (const file of ["stderr.log", ...(opts.includePrompts ? ["prompt.md"] : [])]) {
        const text = await readFile(join(dir, file), "utf8").catch(() => undefined);
        if (text !== undefined) add(`agent-runs/${run}/${leaf}/${file}`, redact(text));
      }
    }
  }

  add("manifest.json", JSON.stringify({ created_at: now.toISOString(), include_prompts: opts.includePrompts, days: BUNDLE_DAYS, entries: entries.map((e) => e.name) }, null, 2));

  const zip = await buildZip(entries, now);
  const dir = await safeMkdir(core.root, BUNDLE_DIR);
  // имя занимается файлом `.part` с флагом `wx`: два архива в одну секунду не сталкиваются
  for (let n = 0; ; n++) {
    if (opts.name && n > 0) throw new Error(`diagnostics: архив ${opts.name} уже есть`);
    const name = opts.name ?? bundleName(now, n);
    const path = join(dir, name);
    if (await stat(path).then(() => true, () => false)) continue;
    let fh;
    try {
      fh = await open(`${path}.part`, "wx");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw e;
    }
    try {
      await fh.writeFile(zip);
      await fh.sync();
    } catch (e) {
      await fh.close();
      await rm(`${path}.part`, { force: true });
      throw e;
    }
    await fh.close();
    await rename(`${path}.part`, path);
    return { path, name, bytes: zip.length };
  }
}

/** DOS-время записи zip. */
function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Zip (deflate, имена UTF-8, без zip64: архив диагностики меньше 4 ГБ). */
export async function buildZip(entries: { name: string; data: Buffer }[], at: Date): Promise<Buffer> {
  const { time, date } = dosTime(at);
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const packed = await deflate(e.data);
    const crc = crc32(e.data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6);
    h.writeUInt16LE(8, 8);
    h.writeUInt16LE(time, 10);
    h.writeUInt16LE(date, 12);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(packed.length, 18);
    h.writeUInt32LE(e.data.length, 22);
    h.writeUInt16LE(name.length, 26);
    h.writeUInt16LE(0, 28);
    local.push(h, name, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(e.data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += h.length + name.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}
