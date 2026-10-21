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

/** `PRAGMA quick_check` вернул `ok`. */
export function quickCheck(db: Db): boolean {
  return db.pragma("quick_check", { simple: true }) === "ok";
}
