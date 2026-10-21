// studio.db (ADR 0002): SQLite в WAL через better-sqlite3, синхронный API.
import { join } from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

/**
 * PRAGMA соединения: WAL (иначе ошибка — без WAL читатели блокируют запись), `synchronous=FULL`
 * (коммит переживает отключение питания и диска), на macOS `fullfsync` (F_FULLFSYNC: fsync
 * до носителя, а не до кеша диска), `foreign_keys`, `busy_timeout`. Сбой закрывает базу.
 */
export function configureDb(db: Db): Db {
  try {
    const mode = db.pragma("journal_mode = WAL", { simple: true });
    if (mode !== "wal") throw new Error(`db: journal_mode = ${String(mode)}, требуется wal`);
    db.pragma("synchronous = FULL");
    if (process.platform === "darwin") db.pragma("fullfsync = ON");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
  } catch (e) {
    db.close();
    throw e;
  }
  return db;
}

/**
 * Открывает `<root>/studio.db`. Корень должен быть проверен StorageGuard до вызова: база —
 * файл в корне хранилища, каталогов не создаёт.
 */
export function openDb(root: string): Db {
  return configureDb(new Database(join(root, "studio.db")));
}
