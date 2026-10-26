import { realpathSync } from "node:fs";
import type { StoreMarker } from "@ms/core";
import type { Db } from "./open.js";
import { tx } from "./tx.js";

export function getMeta(db: Db, key: string): string | undefined {
  return (db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined)?.value;
}

export function setMeta(db: Db, key: string, value: string): void {
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);
}

/**
 * Привязка базы к хранилищу: первый запуск пишет `meta.store_id` из маркера тома, дальше
 * расхождение — ошибка `store_mismatch` (база от другого хранилища или подменённый маркер).
 */
export function bindStoreId(db: Db, marker: StoreMarker): void {
  tx(db, () => {
    const current = getMeta(db, "store_id");
    if (current === undefined) setMeta(db, "store_id", marker.store_id);
    else if (current !== marker.store_id) {
      throw new Error(`store_mismatch: studio.db принадлежит хранилищу ${current}, маркер тома — ${marker.store_id}`);
    }
  });
}

/**
 * S20: корень хранилища (`realpath`) в `meta.root_realpath`. Первый запуск записывает его; другой
 * путь — хранилище скопировано (store_id копируется вместе с данными, owner-lock копии свободен):
 * прежний путь уходит в `meta.root_copied_from`, текущий становится `root_realpath`. Возвращает
 * исходный путь, если копия обнаружена именно сейчас. Только предупреждение: e2e и приёмки законно
 * работают на копиях.
 */
export function bindRootPath(db: Db, root: string): string | undefined {
  const real = realpathSync(root);
  return tx(db, () => {
    const prev = getMeta(db, "root_realpath");
    if (prev === real) return undefined;
    setMeta(db, "root_realpath", real);
    if (prev === undefined) return undefined;
    setMeta(db, "root_copied_from", prev);
    return prev;
  });
}

/** S20: откуда скопировано хранилище (`meta`), если это копия; только чтение (doctor). */
export function storeCopiedFrom(db: Db, root: string): string | undefined {
  let prev: string | undefined;
  let from: string | undefined;
  try {
    prev = getMeta(db, "root_realpath");
    from = getMeta(db, "root_copied_from");
  } catch {
    return undefined; // базы ещё нет (нет таблицы meta)
  }
  if (prev !== undefined && prev !== realpathSync(root)) return prev;
  return from;
}

/** Предупреждение о копии хранилища (S20) — doctor и отчёт старта. */
export const storeCopiedText = (from: string): string => `хранилище скопировано из ${from}; процессы оригинала не трогаются`;

/** `PRAGMA quick_check` вернул `ok`. */
export function quickCheck(db: Db): boolean {
  return db.pragma("quick_check", { simple: true }) === "ok";
}
