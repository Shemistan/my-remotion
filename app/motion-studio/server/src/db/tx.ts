import type { Db } from "./open.js";

/**
 * Транзакция `BEGIN IMMEDIATE`: write-lock берётся сразу, а не при первой записи, поэтому
 * проверка (fencing, замок сцены) и запись не разделены чужим коммитом. `fn` синхронна —
 * better-sqlite3 не допускает `await` внутри; внутри уже открытой транзакции — savepoint.
 */
export function tx<T>(db: Db, fn: () => T): T {
  return db.transaction(fn).immediate();
}
