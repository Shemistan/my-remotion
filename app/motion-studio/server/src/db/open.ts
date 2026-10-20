// studio.db (ADR 0002): SQLite в WAL через better-sqlite3, синхронный API.
import { join } from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

/**
 * Открывает `<root>/studio.db`. Корень должен быть проверен StorageGuard до вызова: база —
 * файл в корне хранилища, каталогов не создаёт. `synchronous=FULL` — коммит переживает
 * отключение питания и внешнего диска.
 */
export function openDb(root: string): Db {
  const db = new Database(join(root, "studio.db"), { fileMustExist: false });
  try {
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = FULL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
  } catch (e) {
    db.close();
    throw e;
  }
  return db;
}
