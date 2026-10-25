// Намерения необратимых и рискованных действий (Task 47): удаление проекта, очистка корзины,
// удаление черновика из карантина. Сначала сводка «что будет удалено» и токен на 10 минут,
// привязанный к состоянию (название, число файлов и байт, сцены, версии, экспорты, пакеты);
// действие — вторым запросом с этим токеном. Токен — HMAC с ключом процесса: после перезапуска
// сервера или изменения состояния — `intent_expired`, сводку нужно получить заново.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "../db/open.js";
import * as trashRepo from "../db/repos/trash.js";
import { PROJECTS_REL } from "../artifacts/paths.js";
import { LifecycleError, activeJobIds, requireLive, requireNotProtected } from "./lifecycle.js";

export const INTENT_TTL_MS = 10 * 60_000;
const SECRET = randomBytes(32);

type IntentKind = "delete" | "purge" | "discard";

function sign(kind: IntentKind, subject: string, exp: number, state: unknown): string {
  return createHmac("sha256", SECRET).update(JSON.stringify([kind, subject, exp, state])).digest("hex");
}

/** Токен действия `kind` над `subject` в состоянии `state`; действует `INTENT_TTL_MS`. */
export function issueToken(kind: IntentKind, subject: string, state: unknown): { token: string; expiresAt: string } {
  const exp = Date.now() + INTENT_TTL_MS;
  return { token: `${exp}.${sign(kind, subject, exp, state)}`, expiresAt: new Date(exp).toISOString() };
}

/** Токен выдан для того же действия и состояния и не истёк; иначе `intent_expired`. */
export function checkToken(kind: IntentKind, subject: string, state: unknown, token: string): void {
  const m = /^(\d{1,16})\.([0-9a-f]{64})$/.exec(token);
  const expired = () => new LifecycleError("intent_expired", "подтверждение устарело или состояние изменилось — откройте сводку заново");
  if (!m) throw expired();
  const exp = Number(m[1]);
  if (Date.now() > exp) throw expired();
  const want = Buffer.from(sign(kind, subject, exp, state), "hex");
  if (!timingSafeEqual(want, Buffer.from(m[2]!, "hex"))) throw expired();
}

/**
 * Размер дерева: файлы и байты (жёсткие ссылки — один раз, по inode; симлинки не разыменуются).
 * Каталога нет — нули.
 */
export function dirStats(abs: string): { bytes: number; files: number } {
  const out = { bytes: 0, files: 0 };
  if (!existsSync(abs)) return out;
  const seen = new Set<string>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      const st = lstatSync(p);
      out.files += 1;
      const key = `${st.dev}:${st.ino}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.bytes += st.size;
    }
  };
  walk(abs);
  return out;
}

const count = (db: Db, sql: string, id: string) => db.prepare(sql).pluck().get(id) as number;

/** Сводка проекта: что уйдёт в корзину. */
function projectState(db: Db, root: string, id: string, title: string) {
  const dir = join(root, PROJECTS_REL, id);
  const { bytes, files } = dirStats(dir);
  const pk = join(dir, "packages");
  const packages = existsSync(pk) ? readdirSync(pk, { withFileTypes: true }).filter((e) => e.isDirectory()).length : 0;
  return {
    title,
    bytes,
    files,
    scenes: count(db, "SELECT count(*) FROM scenes WHERE project_id = ?", id),
    versions: count(db, "SELECT count(*) FROM scene_versions v JOIN scenes s ON s.id = v.scene_id WHERE s.project_id = ?", id),
    exports: count(db, "SELECT count(*) FROM exports e JOIN scene_versions v ON v.id = e.version_id JOIN scenes s ON s.id = v.scene_id WHERE s.project_id = ?", id),
    packages,
  };
}

export interface DeleteIntent {
  token: string;
  title: string;
  bytes: number;
  files: number;
  scenes: number;
  versions: number;
  exports: number;
  /** Папки пакетов `packages/` (сценарий, Phase 5-lite). */
  packages: number;
  /** Незавершённые задачи (в т. ч. сценарного пакета): удаление ответит `project_busy`. */
  activeJobs: string[];
  expiresAt: string;
}

/** Сводка «что будет удалено» и токен подтверждения (Playground по умолчанию — `project_protected`). */
export function deleteIntent(db: Db, root: string, id: string): DeleteIntent {
  requireNotProtected(id);
  const p = requireLive(db, id);
  const state = projectState(db, root, id, p.title);
  return { ...issueToken("delete", id, state), ...state, activeJobs: activeJobIds(db, id) };
}

/**
 * Использованные токены удаления (до истечения): токен одноразовый — после восстановления из
 * корзины состояние проекта то же, и без этого прежний токен удалил бы его снова без новой сводки.
 */
const usedDeleteTokens = new Map<string, number>();

/** Токен удаления проекта действителен для текущего состояния и ещё не использован. */
export function verifyDeleteToken(db: Db, root: string, id: string, token: string): void {
  const p = requireLive(db, id);
  if (usedDeleteTokens.has(token)) throw new LifecycleError("intent_expired", "подтверждение уже использовано — откройте сводку заново");
  checkToken("delete", id, projectState(db, root, id, p.title), token);
}

/** Удаление прошло — токен больше не действует. */
export function consumeDeleteToken(token: string): void {
  const now = Date.now();
  for (const [t, exp] of usedDeleteTokens) if (exp < now) usedDeleteTokens.delete(t);
  usedDeleteTokens.set(token, Number(token.split(".")[0]) || now + INTENT_TTL_MS);
}

/** Строки корзины для очистки: есть и не очищены; id — без повторов, по порядку. */
function purgeState(db: Db, root: string, trashIds: readonly string[]) {
  const ids = [...new Set(trashIds)].sort();
  return ids.map((id) => {
    const row = trashRepo.get(db, id);
    if (!row || row.purged_at) throw new LifecycleError("trash_not_found", `в корзине нет ${id}`);
    return { id, rel_path: row.rel_path, ...dirStats(join(root, row.rel_path)) };
  });
}

export interface PurgeIntent {
  token: string;
  count: number;
  bytes: number;
  files: number;
  expiresAt: string;
}

/** Второе подтверждение очистки корзины: сводка и токен для `trash.purge`. */
export function purgeIntent(db: Db, root: string, trashIds: readonly string[]): PurgeIntent {
  const state = purgeState(db, root, trashIds);
  const bytes = state.reduce((a, s) => a + s.bytes, 0);
  const files = state.reduce((a, s) => a + s.files, 0);
  return { ...issueToken("purge", state.map((s) => s.id).join(","), state), count: state.length, bytes, files };
}

export function verifyPurgeToken(db: Db, root: string, trashIds: readonly string[], token: string): void {
  const state = purgeState(db, root, trashIds);
  checkToken("purge", state.map((s) => s.id).join(","), state, token);
}
