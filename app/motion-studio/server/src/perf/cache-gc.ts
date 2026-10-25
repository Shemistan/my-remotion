// Уборка кэша (Task 49a, `cache.gc`): LRU пересоздаваемого кэша до `cache.maxBytes`.
//
// Что считается кэшем (и только это может быть удалено):
// - ключ содержимого `<root>/cache/{bundles,entries,stills}/<ключ>` (+ отметки `cache/used/<ключ>/<задача>.json`):
//   бандл Remotion, точка входа, стоп-кадры (`stillsCache`) — пересоздаются следующим рендером;
// - master исходника `workspace/projects/<p>/master/<media>@<n>-<d>` (Task 36): опубликованный
//   CFR-дериватив, пересоздаётся `ensureMaster`; удаляется вместе со строкой `artifact_publications`;
// - недоделки убитых worker `cache/bundles/<ключ>.tmp-<pid>` (pid мёртв) и остатки `cache/.gc/`.
//
// Никогда: опубликованные версии сцен, экспорты, `packages/`, `final/`, оригиналы и прокси, данные
// проектов, корзина (`workspace/trash`) и master удалённых проектов (они в корзине). Путь вне
// этих форм — ошибка до удаления (`assertCachePath`). Размер `packages/` — только в отчёт.
//
// Защищено от удаления (даже сверх лимита):
// - использованное активной задачей (pending/running/awaiting_*/blocked) — по отметке ключа;
//   master — у проекта с активной задачей;
// - то, на что ссылается текущая ревизия таймлайна: master проекта с таймлайном и последний
//   бандл таймлайна (`tl-…`) этого проекта;
// - тронутое за последние `minAgeMs` (рендер без отметки, только что собранный бандл).
//
// Удаление: синхронная перепроверка защиты и переименование в `cache/.gc/` (master — в одной
// транзакции со строкой публикации), затем стирание. Между проверкой и переименованием нет
// await — задача, захваченная раннером позже, бандла уже не найдёт и соберёт его заново.
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { lstat, readdir, rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { safeMkdirSync } from "@ms/core";
import { CACHE_USED_DIR, cacheUseDir, markCacheUse } from "@ms/render";
import type { Fps } from "@ms/contracts";
import { PROJECTS_REL } from "../artifacts/paths.js";
import type { Db } from "../db/open.js";
import { tx } from "../db/tx.js";
import { enqueue } from "../jobs/queue.js";
import { unlockDirs } from "../scenes/store.js";
import { CONTENT_KEY_RE } from "./stills-cache.js";

export const CACHE_REL = "cache";
export const GC_TRASH_REL = "cache/.gc";
/** Подкаталоги кэша с каталогом на ключ содержимого. */
export const KEY_DIRS = ["bundles", "entries", "stills"] as const;
/** Тронутое позже — не удаляется (рендер без отметки ещё может идти). */
export const GC_MIN_AGE_MS = 15 * 60_000;
/** Статусы задач, которые держат свой кэш. */
export const ACTIVE_STATUSES = ["pending", "running", "awaiting_input", "awaiting_approval", "blocked"] as const;

const ID = "[A-Za-z0-9][A-Za-z0-9_]*";
const MASTER_REL_RE = new RegExp(`^${PROJECTS_REL}/(${ID})/master/(${ID})@([1-9][0-9]*)-([1-9][0-9]*)$`);

export interface GcOptions {
  maxBytes: number;
  /** Часы (тесты). */
  now?: () => number;
  minAgeMs?: number;
  /** Задача самой уборки: её активность ничего не защищает. */
  selfJobId?: string;
  signal?: AbortSignal;
  /** Прогресс удаления 0..1. */
  onProgress?: (p: number) => void;
}

export type GcProtect = "active" | "timeline" | "recent";

export interface GcEntry {
  /** Ключ содержимого или `master:<dest_rel>`. */
  id: string;
  kind: "key" | "master";
  bytes: number;
  lastUsed: number;
  /** Задачи, отметившие использование (`cache/used/<ключ>/<jobId>.json`). */
  jobIds: string[];
  protect?: GcProtect;
}

export interface GcResult {
  removed: string[];
  freedBytes: number;
  /** Кэш после уборки (защищённое и не понадобившееся удалить). */
  keptBytes: number;
  totalBytes: number;
  protected: { id: string; why: GcProtect }[];
  /** Папки клипов и пакетов `packages/` — справочно, не удаляются. */
  packagesBytes: number;
  /** Удалённые недоделки (`*.tmp-<pid>`, остатки `cache/.gc`). */
  leftovers: number;
}

/** Ключ отметки master: `master-<проект>-<media>@<n>-<d>`. */
export function masterUseKey(projectId: string, mediaId: string, fps: Fps): string {
  return `master-${projectId}-${mediaId}@${fps.num}-${fps.den}`;
}

/** Отметка использования master (вызов `ensureMaster`): LRU уборки. Ошибки глотает. */
export async function markMasterUse(root: string, projectId: string, mediaId: string, fps: Fps, jobId?: string): Promise<void> {
  try {
    const dir = safeMkdirSync(root, CACHE_REL);
    await markCacheUse(dir, masterUseKey(projectId, mediaId, fps), jobId);
  } catch {
    // отметка — подсказка уборке
  }
}

/**
 * Удалять можно только кэш: `cache/<…>` (не сам `cache/`) или каталог master формы
 * `artifactPaths.master`. Иначе — ошибка до любых изменений.
 */
export function assertCachePath(root: string, abs: string): void {
  const rel = relative(root, abs).split(sep).join("/");
  const inCache = rel.startsWith(`${CACHE_REL}/`) && !rel.split("/").includes("..");
  if (inCache || MASTER_REL_RE.test(rel)) return;
  throw new Error(`cache.gc: отказ удалять не кэш: ${rel}`);
}

async function du(path: string): Promise<number> {
  let st;
  try {
    st = await lstat(path);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.isFile() ? st.size : 0;
  let n = 0;
  for (const name of await readdir(path).catch(() => [] as string[])) n += await du(join(path, name));
  return n;
}

function mtimeOf(path: string): number | undefined {
  try {
    return lstatSync(path).mtimeMs;
  } catch {
    return undefined;
  }
}

/** Отметки ключа: все задачи и самая свежая отметка (синхронно — годится внутри транзакции). */
function readUse(cacheDir: string, key: string): { jobIds: string[]; at: number | undefined } {
  const jobIds: string[] = [];
  let at: number | undefined;
  let names: string[];
  try {
    names = readdirSync(cacheUseDir(cacheDir, key));
  } catch {
    return { jobIds, at };
  }
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    const file = join(cacheUseDir(cacheDir, key), n);
    const t = mtimeOf(file);
    if (t !== undefined) at = Math.max(at ?? 0, t);
    try {
      const j = JSON.parse(readFileSync(file, "utf8")) as { job_id?: unknown };
      if (typeof j.job_id === "string") jobIds.push(j.job_id);
    } catch {
      // недописанная или битая отметка: время учтено, задачи нет
    }
  }
  return { jobIds, at };
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

interface Snapshot {
  activeJobs: Set<string>;
  activeProjects: Set<string>;
  timelineProjects: Set<string>;
  deletedProjects: Set<string>;
  jobProject: (id: string) => string | undefined;
}

function snapshot(db: Db, selfJobId: string | undefined): Snapshot {
  const marks = ACTIVE_STATUSES.map(() => "?").join(", ");
  const active = db.prepare(`SELECT id, project_id FROM jobs WHERE status IN (${marks})`).all(...ACTIVE_STATUSES) as { id: string; project_id: string }[];
  const own = active.filter((j) => j.id !== selfJobId);
  const pluck = (sql: string) => new Set(db.prepare(sql).pluck().all() as string[]);
  const getProject = db.prepare("SELECT project_id FROM jobs WHERE id = ?").pluck();
  return {
    activeJobs: new Set(own.map((j) => j.id)),
    activeProjects: new Set(own.map((j) => j.project_id)),
    timelineProjects: pluck("SELECT project_id FROM video_timelines WHERE current_revision IS NOT NULL"),
    deletedProjects: pluck("SELECT id FROM projects WHERE deleted_at IS NOT NULL"),
    jobProject: (id) => (getProject.get(id) as string | undefined) ?? undefined,
  };
}

interface Candidate extends GcEntry {
  /** Абсолютные пути (ключ: каталоги кэша и отметка; master: каталог). */
  paths: string[];
  destRel?: string;
  projectId?: string;
}

async function listKeys(cacheDir: string): Promise<Set<string>> {
  const keys = new Set<string>();
  for (const d of KEY_DIRS) {
    for (const n of await readdir(join(cacheDir, d)).catch(() => [] as string[])) if (CONTENT_KEY_RE.test(n)) keys.add(n);
  }
  return keys;
}

async function keyCandidates(cacheDir: string): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const key of await listKeys(cacheDir)) {
    const dirs = KEY_DIRS.map((d) => join(cacheDir, d, key)).filter((p) => existsSync(p));
    const use = readUse(cacheDir, key);
    const marks = cacheUseDir(cacheDir, key);
    const times = [use.at, ...dirs.map(mtimeOf), mtimeOf(join(cacheDir, "bundles", key, "index.html"))].filter((t): t is number => t !== undefined);
    let bytes = 0;
    for (const p of dirs) bytes += await du(p);
    out.push({ id: key, kind: "key", bytes, lastUsed: use.at ?? Math.max(0, ...times), jobIds: use.jobIds, paths: [...dirs, ...(existsSync(marks) ? [marks] : [])] });
  }
  return out;
}

async function masterCandidates(root: string, cacheDir: string, db: Db, snap: Snapshot): Promise<Candidate[]> {
  const rows = db.prepare("SELECT dest_rel, published_at FROM artifact_publications WHERE dest_rel LIKE ?").all(`${PROJECTS_REL}/%/master/%`) as { dest_rel: string; published_at: string }[];
  const out: Candidate[] = [];
  for (const r of rows) {
    const m = MASTER_REL_RE.exec(r.dest_rel);
    if (!m) continue;
    const [, projectId, mediaId, num, den] = m as unknown as [string, string, string, string, string];
    // удалённый проект — в корзине: его чистит trash.purge, не уборка кэша
    if (snap.deletedProjects.has(projectId)) continue;
    const dir = join(root, r.dest_rel);
    if (!existsSync(dir)) continue;
    const useKey = masterUseKey(projectId, mediaId, { num: Number(num), den: Number(den) });
    const use = readUse(cacheDir, useKey);
    const marks = cacheUseDir(cacheDir, useKey);
    out.push({
      id: `master:${r.dest_rel}`, kind: "master", bytes: await du(dir), lastUsed: use.at ?? Date.parse(r.published_at), jobIds: use.jobIds,
      // каталог master первым (его chmod перед переносом), затем его отметки
      paths: [dir, ...(existsSync(marks) ? [marks] : [])], destRel: r.dest_rel, projectId,
    });
  }
  return out;
}

/** Защита записи по снимку задач и таймлайнов; `latestTl` — последний бандл таймлайна проекта. */
function protection(c: Candidate, snap: Snapshot, now: number, minAgeMs: number, latestTl: Map<string, string>): GcProtect | undefined {
  if (c.kind === "master") {
    if (snap.activeProjects.has(c.projectId!)) return "active";
    if (snap.timelineProjects.has(c.projectId!)) return "timeline";
  } else {
    // ключ держит любая активная задача из его отметок (а не только последняя)
    if (c.jobIds.some((j) => snap.activeJobs.has(j))) return "active";
    if (c.id.startsWith("tl-")) {
      for (const j of c.jobIds) {
        const p = snap.jobProject(j);
        if (p && snap.timelineProjects.has(p) && latestTl.get(p) === c.id) return "timeline";
      }
    }
  }
  if (now - c.lastUsed < minAgeMs) return "recent";
  return undefined;
}

function latestTimelineBundles(entries: Candidate[], snap: Snapshot): Map<string, string> {
  const best = new Map<string, Candidate>();
  for (const c of entries) {
    if (c.kind !== "key" || !c.id.startsWith("tl-")) continue;
    for (const j of c.jobIds) {
      const p = snap.jobProject(j);
      if (!p) continue;
      const cur = best.get(p);
      if (!cur || c.lastUsed > cur.lastUsed) best.set(p, c);
    }
  }
  return new Map([...best].map(([p, c]) => [p, c.id]));
}

async function removeTree(root: string, path: string): Promise<void> {
  assertCachePath(root, path);
  await unlockDirs(path).catch(() => undefined);
  await rm(path, { recursive: true, force: true });
}

const MASTER_USE_RE = new RegExp(`^master-(${ID})-(${ID})@([1-9][0-9]*)-([1-9][0-9]*)$`);

/**
 * Недоделки: `cache/.gc/*`, `cache/bundles/<ключ>.tmp-<pid>` мёртвых процессов и отметки-сироты
 * `cache/used/<ключ>` (ключа нет ни в одном каталоге кэша, master не опубликован), старше `minAgeMs`.
 */
async function sweepLeftovers(root: string, cacheDir: string, db: Db, now: number, minAgeMs: number): Promise<number> {
  let n = 0;
  const usedDir = join(cacheDir, CACHE_USED_DIR);
  const published = db.prepare("SELECT 1 FROM artifact_publications WHERE dest_rel = ?");
  for (const name of await readdir(usedDir).catch(() => [] as string[])) {
    const path = join(usedDir, name);
    const st = await lstat(path).catch(() => undefined);
    if (!st || now - st.mtimeMs < minAgeMs) continue;
    let orphan = !st.isDirectory(); // файлы прямо в used/ — прежний формат отметок
    if (!orphan && CONTENT_KEY_RE.test(name)) orphan = KEY_DIRS.every((d) => !existsSync(join(cacheDir, d, name)));
    const m = MASTER_USE_RE.exec(name);
    if (!orphan && m) orphan = !published.get(`${PROJECTS_REL}/${m[1]}/master/${m[2]}@${m[3]}-${m[4]}`);
    if (!orphan) continue;
    await removeTree(root, path);
    n++;
  }
  for (const name of await readdir(join(root, GC_TRASH_REL)).catch(() => [] as string[])) {
    await removeTree(root, join(root, GC_TRASH_REL, name));
    n++;
  }
  for (const name of await readdir(join(cacheDir, "bundles")).catch(() => [] as string[])) {
    const m = /^(?:tl-)?[0-9a-f]{64}\.tmp-(\d+)$/.exec(name);
    if (m && !pidAlive(Number(m[1]))) {
      await removeTree(root, join(cacheDir, "bundles", name));
      n++;
    }
  }
  return n;
}

/**
 * LRU-уборка кэша хранилища `root` до `maxBytes` (см. шапку): удаляет самые давно использованные
 * незащищённые записи, пока кэш больше лимита. Хранилище должно быть доступно (проверяет
 * вызывающий — задача `cache.gc`).
 */
export async function gcCache(root: string, db: Db, o: GcOptions): Promise<GcResult> {
  const now = o.now ?? Date.now;
  const minAgeMs = o.minAgeMs ?? GC_MIN_AGE_MS;
  const cacheDir = join(root, CACHE_REL);
  const leftovers = existsSync(cacheDir) ? await sweepLeftovers(root, cacheDir, db, now(), minAgeMs) : 0;
  const snap0 = snapshot(db, o.selfJobId);
  const entries = [...(existsSync(cacheDir) ? await keyCandidates(cacheDir) : []), ...(await masterCandidates(root, cacheDir, db, snap0))];
  const packagesBytes = await packagesSize(root);
  let total = entries.reduce((n, e) => n + e.bytes, 0);
  const totalBytes = total;
  const latest0 = latestTimelineBundles(entries, snap0);
  for (const e of entries) e.protect = protection(e, snap0, now(), minAgeMs, latest0);
  const removed: string[] = [];
  let freed = 0;
  const victims = entries.filter((e) => !e.protect).sort((a, b) => a.lastUsed - b.lastUsed || (a.id < b.id ? -1 : 1));
  const need = victims.length;
  for (const [i, v] of victims.entries()) {
    if (total <= o.maxBytes) break;
    if (o.signal?.aborted) break;
    // синхронно: свежий снимок задач, перепроверка защиты, переименование в cache/.gc
    const moved = claimVictim(root, db, v, o, now(), minAgeMs);
    if (!moved) continue;
    for (const p of moved) await removeTree(root, p);
    total -= v.bytes;
    freed += v.bytes;
    removed.push(v.id);
    o.onProgress?.((i + 1) / need);
  }
  return {
    removed,
    freedBytes: freed,
    keptBytes: total,
    totalBytes,
    protected: entries.filter((e) => e.protect).map((e) => ({ id: e.id, why: e.protect! })),
    packagesBytes,
    leftovers,
  };
}

/**
 * Перепроверка и перенос записи в `cache/.gc/` без await: защита по свежему снимку, master —
 * строка публикации удаляется в той же транзакции. `undefined` — запись стала защищённой.
 */
function claimVictim(root: string, db: Db, v: Candidate, o: GcOptions, now: number, minAgeMs: number): string[] | undefined {
  return tx(db, () => {
    const snap = snapshot(db, o.selfJobId);
    const cacheDir = join(root, CACHE_REL);
    const fresh: Candidate = { ...v };
    if (v.kind === "key") {
      const use = readUse(cacheDir, v.id);
      fresh.jobIds = use.jobIds;
      if (use.at !== undefined) fresh.lastUsed = Math.max(fresh.lastUsed, use.at);
    }
    // последний бандл таймлайна: по свежим отметкам всех tl-ключей не пересчитываем — бандл,
    // ставший последним после снимка, отмечен задачей, и она активна или тронута недавно
    const latest = new Map<string, string>();
    if (protection(fresh, snap, now, minAgeMs, latest)) return undefined;
    if (v.kind === "master" && !db.prepare("SELECT 1 FROM artifact_publications WHERE dest_rel = ?").get(v.destRel)) return undefined;
    for (const p of v.paths) assertCachePath(root, p);
    const trash = safeMkdirSync(root, GC_TRASH_REL);
    const out: string[] = [];
    if (v.kind === "master") db.prepare("DELETE FROM artifact_publications WHERE dest_rel = ?").run(v.destRel);
    for (const [i, p] of v.paths.entries()) {
      if (!existsSync(p)) continue;
      const to = join(trash, `${Date.now()}-${randomBytes(4).toString("hex")}`);
      // опубликованный каталог master read-only: перенос в другой родитель требует права записи
      // на него; перенос не удался — права возвращаются (транзакция откатит и строку публикации)
      const unlock = v.kind === "master" && i === 0;
      if (unlock) chmodSync(p, 0o755);
      try {
        renameSync(p, to);
      } catch (e) {
        if (unlock) chmodSync(p, 0o555);
        throw e;
      }
      out.push(to);
    }
    return out;
  });
}

/** Сумма `workspace/projects/<p>/packages` — справочно. */
async function packagesSize(root: string): Promise<number> {
  let n = 0;
  for (const p of await readdir(join(root, PROJECTS_REL)).catch(() => [] as string[])) n += await du(join(root, PROJECTS_REL, p, "packages"));
  return n;
}


/** Раз в сутки. */
export const AUTO_GC_EVERY_MS = 24 * 3600_000;
/** Проверка простоя. */
export const AUTO_GC_CHECK_MS = 3600_000;

/**
 * Ставит `cache.gc` при простое (нет активных задач), если прошлая уборка (любая) была раньше
 * суток назад. Ключ идемпотентности — дата: не больше одной автоматической уборки в день.
 * `undefined` — не нужна или база недоступна.
 */
export function maybeAutoCacheGc(db: Db, projectId: string, now = Date.now()): string | undefined {
  try {
    return tx(db, () => {
      const marks = ACTIVE_STATUSES.map(() => "?").join(", ");
      if (db.prepare(`SELECT 1 FROM jobs WHERE status IN (${marks}) LIMIT 1`).get(...ACTIVE_STATUSES)) return undefined;
      const last = db.prepare("SELECT MAX(created_at) FROM jobs WHERE type = 'cache.gc'").pluck().get() as string | null;
      if (last && now - Date.parse(last) < AUTO_GC_EVERY_MS) return undefined;
      const key = `cache-gc-auto-${new Date(now).toISOString().slice(0, 10)}`;
      return enqueue(db, { type: "cache.gc", projectId, input: { auto: true }, idempotencyKey: key }).job.id;
    });
  } catch {
    return undefined;
  }
}

/** Таймер автоуборки (сервер API): проверка простоя раз в `checkMs`; возвращает остановку. */
export function startCacheGcSchedule(db: () => Db, projectId: string, checkMs = AUTO_GC_CHECK_MS): () => void {
  const t = setInterval(() => maybeAutoCacheGc(db(), projectId), checkMs);
  t.unref();
  return () => clearInterval(t);
}
