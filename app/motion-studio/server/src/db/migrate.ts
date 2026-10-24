// Миграции — пронумерованные SQL-файлы `migrations/NNN_*.sql`, версия в PRAGMA user_version.
import { readFileSync, readdirSync, rmSync, statSync, statfsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import type { Db } from "./open.js";

const DIR = fileURLToPath(new URL("./migrations/", import.meta.url));

/** Сколько собственных резервных копий `studio.db.bak-v*` оставлять (новейшие по mtime). */
export const KEEP_BACKUPS = 3;

interface Migration {
  version: number;
  file: string;
}

function migrations(): Migration[] {
  const out: Migration[] = [];
  for (const file of readdirSync(DIR)) {
    const m = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(file);
    if (!m) continue;
    out.push({ version: Number(m[1]), file });
  }
  out.sort((a, b) => a.version - b.version);
  out.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`db: миграции должны идти подряд с 001: ${m.file}`);
  });
  return out;
}

/** Колонки `jobs` после 001–002 — ровно те, что 003 переносит в `jobs_new`. */
const JOBS_V2_COLUMNS = [
  "id", "type", "project_id", "scene_id", "version_id", "parent_job_id", "status", "progress", "stage", "attempt",
  "max_attempts", "interrupts", "input_refs_json", "input_hash", "output_refs_json", "error_json",
  "idempotency_key", "lease_owner", "lease_until", "cancel_requested", "created_at", "started_at", "finished_at",
];

/**
 * Сверка схемы перед миграцией: пересборка таблицы переносит явный список колонок, и
 * колонка, добавленная задним числом правкой ранней миграции, пропала бы молча на DROP.
 * Расхождение — отказ без изменений. Только чтение; выполняется до резервной копии (все
 * недостающие версии разом — постоянный отказ не плодит копии) и ещё раз в транзакции
 * миграции. Поэтому сверяемая таблица не должна меняться предыдущими миграциями из тех,
 * что могут оказаться недостающими (для 3: `002` таблицу `jobs` не трогает).
 */
/** Колонки `projects` после 001 — те, что 005 переносит в `projects_new`. */
const PROJECTS_V1_COLUMNS = ["id", "kind", "title", "settings_json", "created_at", "updated_at"];

/** 005 пересобирает `jobs` с теми же колонками, что 003, и `projects` (не менялась с 001). */
const PRECHECKS: Record<number, (db: Db) => void> = {
  3: (db) => expectColumns(db, "jobs", JOBS_V2_COLUMNS),
  5: (db) => {
    expectColumns(db, "jobs", JOBS_V2_COLUMNS);
    expectColumns(db, "projects", PROJECTS_V1_COLUMNS);
  },
};

function expectColumns(db: Db, table: string, want: string[]): void {
  const have = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  const extra = have.filter((c) => !want.includes(c));
  const missing = want.filter((c) => !have.includes(c));
  if (extra.length || missing.length) {
    throw new Error(
      `db: схема ${table} не та, что ожидает миграция (лишние: ${extra.join(", ") || "—"}; нет: ${missing.join(", ") || "—"}) — ` +
        "миграция не начата, база не изменена; нужна ручная сверка",
    );
  }
}

export interface MigrateOptions {
  /** Журнал (путь резервной копии, ротация); по умолчанию stderr. */
  log?: (line: string) => void;
  /** Сколько собственных копий оставлять (по умолчанию `KEEP_BACKUPS`). */
  keepBackups?: number;
  /** Свободно байт в каталоге базы (по умолчанию `statfs`); подмена — для тестов. */
  freeBytes?: (dir: string) => number;
}

/** Запас свободного места сверх размера базы и WAL перед резервной копией. */
export const BACKUP_SPARE_BYTES = 64 * 1024 * 1024;

export interface MigrateResult {
  from: number;
  to: number;
  /** Резервная копия базы версии `from` (только при from > 0 и наличии миграций). */
  backup?: string;
}

/**
 * Применяет недостающие миграции; каждая — в своей транзакции вместе с user_version.
 * Перед первой из них у непустой базы (from > 0) — резервная копия
 * `<каталог базы>/studio.db.bak-v<from>-<время>` через online backup SQLite (согласованный
 * снимок вместе с WAL); не создалась (в том числе мало места: база + WAL + запас) —
 * миграция не начинается, недописанный файл удалён. Сверки `PRECHECKS` — до копии. Хранятся последние
 * `keepBackups` собственных копий (`<имя базы>.bak-v*`), другие файлы не трогаются.
 * Внешние ключи на время миграций выключены (вне транзакции — иначе PRAGMA не действует):
 * пересборка таблицы (`CREATE new → INSERT … SELECT → DROP → RENAME`, 003 для `jobs.type`)
 * с включёнными ключами упала бы на DROP родителя. Целостность проверяет
 * `foreign_key_check` в той же транзакции до COMMIT; ключи включаются обратно всегда.
 * Асинхронна только из-за копии: вызывать под owner lock, пока базу никто не пишет.
 */
export async function migrate(db: Db, opts: MigrateOptions = {}): Promise<MigrateResult> {
  const log = opts.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  const all = migrations();
  const latest = all.at(-1)?.version ?? 0;
  const from = db.pragma("user_version", { simple: true }) as number;
  if (from > latest) throw new Error(`db: studio.db версии ${from} новее приложения (знает до ${latest})`);
  if (from === latest) return { from, to: from };
  if (db.inTransaction) throw new Error("db: migrate внутри транзакции — внешние ключи не выключить");

  let backup: string | undefined;
  if (from > 0) {
    // сверки только читают: постоянный отказ — до копии, без новых файлов
    for (const m of all) if (m.version > from) PRECHECKS[m.version]?.(db);
    backup = await backupDb(db, from, latest, opts.freeBytes ?? statfsFree);
    log(`db: резервная копия studio.db (v${from}) перед миграцией до v${latest}: ${backup}`);
    rotateBackups(db, backup, opts.keepBackups ?? KEEP_BACKUPS, log);
  }

  const fk = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");
  try {
    for (const m of all) {
      if (m.version <= from) continue;
      const sql = readFileSync(join(DIR, m.file), "utf8");
      db.transaction(() => {
        PRECHECKS[m.version]?.(db);
        db.exec(sql);
        const broken = db.pragma("foreign_key_check") as unknown[];
        if (broken.length > 0) throw new Error(`db: миграция ${m.file} нарушает внешние ключи: ${JSON.stringify(broken.slice(0, 5))}`);
        db.pragma(`user_version = ${m.version}`);
      }).immediate();
    }
  } finally {
    db.pragma(`foreign_keys = ${fk ? "ON" : "OFF"}`);
  }
  return backup === undefined ? { from, to: latest } : { from, to: latest, backup };
}

function statfsFree(dir: string): number {
  const st = statfsSync(dir);
  return st.bavail * st.bsize;
}

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

/**
 * Копия базы: до неё — свободного места не меньше базы + WAL + запас; сбой посреди
 * копии — недописанный файл удаляется (не оставлять обрезанную «копию» в ротации).
 */
async function backupDb(db: Db, from: number, to: number, freeBytes: (dir: string) => number): Promise<string> {
  const target = db.memory ? undefined : join(dirname(db.name), `${basename(db.name)}.bak-v${from}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  let started = false;
  try {
    if (!target) throw new Error("база в памяти — копировать некуда");
    const need = sizeOf(db.name) + sizeOf(`${db.name}-wal`) + BACKUP_SPARE_BYTES;
    const free = freeBytes(dirname(db.name));
    if (free < need) throw new Error(`мало места: свободно ${free} байт, нужно не меньше ${need} (база + WAL + запас)`);
    started = true;
    await db.backup(target);
    return target;
  } catch (e) {
    if (started && target) {
      try {
        rmSync(target, { force: true });
      } catch (u) {
        (e as Error).message += `; недописанная копия не удалена: ${(u as Error).message}`;
      }
    }
    throw new Error(
      `db: резервная копия studio.db (v${from}) перед миграцией до v${to} не создана${target ? ` (${target})` : ""}: ` +
        `${(e as Error).message} — миграция не начата`,
      { cause: e },
    );
  }
}

/** Оставляет `keep` новейших собственных копий; сбой уборки — только запись в журнал. */
function rotateBackups(db: Db, current: string, keep: number, log: (line: string) => void): void {
  const dir = dirname(db.name);
  const own = new RegExp(`^${basename(db.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.bak-v\\d+-`);
  try {
    const copies = readdirSync(dir)
      .filter((n) => own.test(n))
      .map((n) => ({ path: join(dir, n), mtime: statSync(join(dir, n)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime || (a.path === current ? -1 : b.path === current ? 1 : 0));
    for (const old of copies.slice(Math.max(keep, 1))) {
      if (old.path === current) continue;
      rmSync(old.path, { force: true });
      log(`db: старая резервная копия удалена: ${old.path}`);
    }
  } catch (e) {
    log(`db: ротация резервных копий не удалась: ${(e as Error).message}`);
  }
}
