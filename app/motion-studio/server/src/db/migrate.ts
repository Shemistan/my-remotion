// Миграции — пронумерованные SQL-файлы `migrations/NNN_*.sql`, версия в PRAGMA user_version.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Db } from "./open.js";

const DIR = fileURLToPath(new URL("./migrations/", import.meta.url));

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

/**
 * Применяет недостающие миграции; каждая — в своей транзакции вместе с user_version.
 * Внешние ключи на время миграций выключены (вне транзакции — иначе PRAGMA не действует):
 * пересборка таблицы (`CREATE new → INSERT … SELECT → DROP → RENAME`, 003 для `jobs.type`)
 * с включёнными ключами упала бы на DROP родителя. Целостность проверяет
 * `foreign_key_check` в той же транзакции до COMMIT; ключи включаются обратно всегда.
 */
export function migrate(db: Db): { from: number; to: number } {
  const all = migrations();
  const latest = all.at(-1)?.version ?? 0;
  const from = db.pragma("user_version", { simple: true }) as number;
  if (from > latest) throw new Error(`db: studio.db версии ${from} новее приложения (знает до ${latest})`);
  if (from === latest) return { from, to: from };
  if (db.inTransaction) throw new Error("db: migrate внутри транзакции — внешние ключи не выключить");
  const fk = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");
  try {
    for (const m of all) {
      if (m.version <= from) continue;
      const sql = readFileSync(join(DIR, m.file), "utf8");
      db.transaction(() => {
        db.exec(sql);
        const broken = db.pragma("foreign_key_check") as unknown[];
        if (broken.length > 0) throw new Error(`db: миграция ${m.file} нарушает внешние ключи: ${JSON.stringify(broken.slice(0, 5))}`);
        db.pragma(`user_version = ${m.version}`);
      }).immediate();
    }
  } finally {
    db.pragma(`foreign_keys = ${fk ? "ON" : "OFF"}`);
  }
  return { from, to: latest };
}
