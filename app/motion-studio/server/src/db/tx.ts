import type { Db } from "./open.js";

// Действия «после коммита» внешней транзакции `tx` (рассылка событий подписчикам и т. п.).
const pending = new WeakMap<Db, (() => void)[]>();

/**
 * Транзакция `BEGIN IMMEDIATE`: write-lock берётся сразу, а не при первой записи, поэтому
 * проверка (fencing, замок сцены) и запись не разделены чужим коммитом. `fn` синхронна —
 * better-sqlite3 не допускает `await` внутри; внутри уже открытой транзакции — savepoint.
 * После коммита внешней транзакции выполняются действия `afterCommit`; откат (в том числе
 * вложенного savepoint) их отбрасывает.
 */
export function tx<T>(db: Db, fn: () => T): T {
  const queue = pending.get(db);
  if (queue) {
    // вложенная: savepoint; при откате — отбросить её действия
    const mark = queue.length;
    try {
      return db.transaction(fn).immediate();
    } catch (e) {
      queue.length = mark;
      throw e;
    }
  }
  // внутри транзакции в обход tx() (миграции): savepoint без очереди, afterCommit там — ошибка
  if (db.inTransaction) return db.transaction(fn).immediate();
  const q: (() => void)[] = [];
  pending.set(db, q);
  let out: T;
  try {
    out = db.transaction(fn).immediate();
  } finally {
    pending.delete(db);
  }
  for (const f of q) f();
  return out;
}

/**
 * Выполняет `fn` после коммита текущей `tx` (вне транзакции — сразу). Транзакция, открытая
 * в обход `tx()`, — ошибка: иначе действие сработало бы до коммита или после отката.
 */
export function afterCommit(db: Db, fn: () => void): void {
  const queue = pending.get(db);
  if (queue) queue.push(fn);
  else if (db.inTransaction) throw new Error("db: afterCommit внутри транзакции, открытой не через tx()");
  else fn();
}
