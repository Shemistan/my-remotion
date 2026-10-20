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

/** Применяет недостающие миграции; каждая — в своей транзакции вместе с user_version. */
export function migrate(db: Db): { from: number; to: number } {
  const all = migrations();
  const latest = all.at(-1)?.version ?? 0;
  const from = db.pragma("user_version", { simple: true }) as number;
  if (from > latest) throw new Error(`db: studio.db версии ${from} новее приложения (знает до ${latest})`);
  for (const m of all) {
    if (m.version <= from) continue;
    const sql = readFileSync(join(DIR, m.file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${m.version}`);
    }).immediate();
  }
  return { from, to: Math.max(from, latest) };
}
