import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Database from "better-sqlite3";
import { safeMkdir } from "../storage/safe-mkdir.js";
import { procInfo } from "./proc-info.js";

export type OwnerKind = "server" | "cli";

/** Содержимое `run/owner.json` — только диагностика; истина — блокировка ОС. */
export interface OwnerInfo {
  pid: number;
  startedAt: string;
  kind: OwnerKind;
}

/** Хранилище уже занято другим владельцем (сервером или CLI). */
export class OwnerBusyError extends Error {
  readonly code = "owner_busy";
  constructor(
    readonly pid: number | undefined,
    readonly owner: OwnerInfo | undefined,
  ) {
    const who = owner ? `${owner.kind}, pid ${owner.pid}` : "владелец неизвестен";
    super(`owner_busy: хранилище занято другим процессом (${who})`);
    this.name = "OwnerBusyError";
  }
}

export interface OwnerLock {
  release(): Promise<void>;
  /** Файл замка (`dev`, `ino`), на котором держится блокировка ОС. */
  readonly file: { dev: number; ino: number };
}

// Держит соединения до release: иначе брошенный вызывающим результат соберёт GC,
// деструктор better-sqlite3 закроет базу и fcntl-lock молча снимется.
const held = new Set<Database.Database>();

/**
 * Берёт эксклюзивную блокировку ОС на `run/owner.lock` (ADR 0007, п. 1).
 *
 * SQLite с `locking_mode=EXCLUSIVE` и открытой `BEGIN EXCLUSIVE` держит POSIX
 * `fcntl`-lock на файле, пока жив процесс; ядро снимает его при смерти процесса, так
 * что брошенной блокировки не бывает. Занято — `OwnerBusyError` с pid из `owner.json`.
 */
export async function acquireOwnerLock(root: string, kind: OwnerKind): Promise<OwnerLock> {
  const dir = await safeMkdir(root, "run");
  const ownerFile = join(dir, "owner.json");
  // timeout: 0 — не ждать освобождения (по умолчанию better-sqlite3 ждёт 5 с)
  const lockPath = join(dir, "owner.lock");
  const db = new Database(lockPath, { timeout: 0 });
  try {
    db.pragma("locking_mode = EXCLUSIVE");
    db.exec("BEGIN EXCLUSIVE");
  } catch (e) {
    db.close();
    if ((e as { code?: string }).code === "SQLITE_BUSY") {
      const owner = await readOwner(ownerFile);
      throw new OwnerBusyError(owner?.pid, owner);
    }
    throw e;
  }
  held.add(db);

  let released = false;
  let file: { dev: number; ino: number };
  try {
    // ровно тот файл, что под замком: соединение уже открыто, подмена пути его не меняет
    const st = await stat(lockPath);
    file = { dev: st.dev, ino: st.ino };
    const me = await procInfo(process.pid);
    const info: OwnerInfo = { pid: process.pid, startedAt: me?.startedAt ?? "", kind };
    const tmp = `${ownerFile}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(info, null, 2) + "\n");
    await rename(tmp, ownerFile);
  } catch (e) {
    held.delete(db);
    db.close();
    throw e;
  }

  return {
    file,
    async release() {
      if (released) return;
      released = true;
      try {
        // owner.json убираем, пока lock ещё наш, — иначе можно стереть файл нового владельца
        const cur = await readOwner(ownerFile);
        if (cur?.pid === process.pid) await rm(ownerFile, { force: true });
      } finally {
        held.delete(db);
        db.close(); // откатывает транзакцию и снимает блокировку
      }
    },
  };
}

async function readOwner(file: string): Promise<OwnerInfo | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as OwnerInfo;
  } catch {
    return undefined;
  }
}

/**
 * Проверка замка после возврата хранилища (`storage_offline` → online). `fcntl`-замок
 * привязан к vnode файла старого монтирования: после переподключения тома по тому же пути
 * лежит другой файл, и старый замок его не защищает. Тот же файл (`dev`/`ino`) — замок
 * остаётся как есть; другой или пропал — старое соединение закрывается, замок берётся
 * заново на новом файле (`OwnerBusyError`, если его уже держит другой процесс).
 */
export async function verifyOwnerLock(root: string, kind: OwnerKind, lock: OwnerLock): Promise<OwnerLock> {
  const st = await stat(join(root, "run", "owner.lock")).catch(() => undefined);
  if (st && st.dev === lock.file.dev && st.ino === lock.file.ino) return lock;
  await lock.release().catch(() => undefined);
  return acquireOwnerLock(root, kind);
}
