// StorageGuard: данные приложения живут только в MS_DATA_DIR на внешнем SSD
// (ADR 0006, docs/architecture/03-target-architecture.md §5.1). Корень никогда
// не создаётся неявно — только initStore (`doctor --init`).
import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { lstat, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

export const MARKER_FILE = ".motion-studio-store.json";
export const DEFAULT_MIN_FREE_GB = 10;
const GiB = 1024 ** 3;

export interface StoreMarker {
  schema_version: 1;
  store_id: string;
  volume_uuid: string;
  created_at: string;
}

export type StorageFailure =
  | "env_missing"
  | "not_found"
  | "marker_missing"
  | "marker_mismatch"
  | "volume_mismatch"
  | "system_volume"
  | "not_writable"
  | "low_space"
  /** Проверка хранилища не ответила за дедлайн сторожа (повис `diskutil`), а не «диск не найден». */
  | "storage_watch_timeout"
  /**
   * Проба тома не дала ответа (diskutil медленный, упал или промолчал), а корень на месте.
   * Не «другой том»: тот — `volume_mismatch`, когда проба вернула чужой UUID.
   */
  | "volume_probe_failed";

/**
 * `dev` — st_dev корня, если до него дошла проверка: сторож сравнивает его между
 * проверками (смена устройства под работающими задачами — перемонтирование).
 */
export type StorageStatus =
  | { ok: true; root: string; marker: StoreMarker; freeBytes: number; dev?: number }
  | { ok: false; reason: StorageFailure; detail: string; dev?: number };

/**
 * Неокончательные отказы: проба медленная или не ответила, а признаков потери нет.
 * Сторож объявляет offline только после серии таких подряд (`watchStorage`).
 * Остальные — окончательные (корня нет, маркер чужой, том или устройство сменились,
 * запись не прошла): offline сразу.
 */
export const INCONCLUSIVE_FAILURES: ReadonlySet<StorageFailure> = new Set<StorageFailure>(["volume_probe_failed", "storage_watch_timeout"]);

export function isInconclusive(status: StorageStatus): boolean {
  return !status.ok && INCONCLUSIVE_FAILURES.has(status.reason);
}

export interface VolumeProbe {
  volumeUuid(path: string): Promise<string>;
  deviceId(path: string): Promise<number>;
  systemDeviceId(): Promise<number>;
  freeBytes(path: string): Promise<number>;
}

export type StorageEnv = {
  MS_DATA_DIR?: string;
  MS_ALLOW_SYSTEM_DISK?: string;
  MS_MIN_FREE_GB?: string;
};

/** Ошибка хранилища; сообщение всегда начинается с `storage:`. */
export class StorageError extends Error {
  constructor(
    readonly reason: StorageFailure,
    readonly detail: string,
  ) {
    super(`storage: ${reason}: ${detail}`);
    this.name = "StorageError";
  }
}

/**
 * Путь вне хранилища, переданный `safeMkdir`, — ошибка программиста, а не состояние
 * хранилища: не `StorageError`, сообщение начинается с `storage_path:` (не `storage:`),
 * чтобы такой сбой нельзя было принять за отключённый диск.
 */
export class StoragePathError extends Error {
  readonly code = "path_escape" as const;
  constructor(readonly rel: string) {
    super(`storage_path: путь выходит за пределы хранилища: ${JSON.stringify(rel)}`);
    this.name = "StoragePathError";
  }
}

type Failure = Extract<StorageStatus, { ok: false }>;

class Failed extends Error {
  constructor(readonly status: Failure) {
    super(status.detail);
  }
}

function fail(reason: StorageFailure, detail: string): never {
  throw new Failed({ ok: false, reason, detail });
}

/** Шаг проверки: любое исключение превращается в отказ с данной причиной. */
async function step<T>(reason: StorageFailure, what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Failed) throw e;
    return fail(reason, `${what}: ${(e as Error).message}`);
  }
}

function isMarker(v: unknown): v is StoreMarker {
  const m = v as Partial<StoreMarker> | null;
  return (
    typeof m === "object" &&
    m !== null &&
    m.schema_version === 1 &&
    typeof m.store_id === "string" &&
    m.store_id !== "" &&
    typeof m.volume_uuid === "string" &&
    typeof m.created_at === "string"
  );
}

/** Читает маркер; отсутствующий или повреждённый — StorageError("marker_missing"). */
export async function readMarker(root: string): Promise<StoreMarker> {
  const path = join(root, MARKER_FILE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    throw new StorageError("marker_missing", `${path}: ${(e as Error).message}`);
  }
  if (!isMarker(parsed)) throw new StorageError("marker_missing", `${path}: неверный формат маркера`);
  return parsed;
}

/** Синхронный `readMarker` (для `safeMkdirSync`). */
export function readMarkerSync(root: string): StoreMarker {
  const path = join(root, MARKER_FILE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new StorageError("marker_missing", `${path}: ${(e as Error).message}`);
  }
  if (!isMarker(parsed)) throw new StorageError("marker_missing", `${path}: неверный формат маркера`);
  return parsed;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Единое правило для корня хранилища (checkStorage, initStore, safeMkdir): это
 * настоящий каталог, не симлинк — иначе запись может уйти на другой том мимо проверок.
 * Возвращает описание проблемы или undefined, если корень в порядке.
 */
export async function rootProblem(root: string): Promise<string | undefined> {
  let st;
  try {
    st = await lstat(root);
  } catch {
    return `каталог не найден: ${root}`;
  }
  if (st.isSymbolicLink()) return `${root} — симлинк; укажи в MS_DATA_DIR реальный путь`;
  if (!st.isDirectory()) return `${root} не каталог`;
  return undefined;
}

/** Синхронный `rootProblem` (то же правило). */
export function rootProblemSync(root: string): string | undefined {
  let st;
  try {
    st = lstatSync(root);
  } catch {
    return `каталог не найден: ${root}`;
  }
  if (st.isSymbolicLink()) return `${root} — симлинк; укажи в MS_DATA_DIR реальный путь`;
  if (!st.isDirectory()) return `${root} не каталог`;
  return undefined;
}

async function onSystemVolume(path: string, probe: VolumeProbe, dev?: number): Promise<boolean> {
  return (dev ?? (await probe.deviceId(path))) === (await probe.systemDeviceId());
}

/** Пробная запись: создать и удалить уникальный файл в корне. */
async function writeTest(root: string): Promise<void> {
  const path = join(root, `.write-test-${process.pid}-${randomUUID()}`);
  const fh = await open(path, "wx");
  try {
    await fh.writeFile("ok");
    await fh.sync();
  } finally {
    try {
      await fh.close();
    } finally {
      await unlink(path);
    }
  }
}

function minFreeBytes(env: StorageEnv): number {
  const raw = env.MS_MIN_FREE_GB?.trim();
  if (!raw) return DEFAULT_MIN_FREE_GB * GiB;
  const gb = Number(raw);
  if (!Number.isFinite(gb) || gb < 0) fail("env_missing", `MS_MIN_FREE_GB некорректен: ${raw}`);
  return gb * GiB;
}

/**
 * Корень пропал посреди проверки (rename, отключение диска): шаг после корня падает ENOENT
 * под своей причиной (маркер, запись), а отказ на деле — `not_found`. Корень на месте —
 * причина шага как есть.
 */
async function vanished(env: StorageEnv, status: Failure): Promise<Failure> {
  const root = env.MS_DATA_DIR?.trim();
  if (status.reason === "not_found" || status.reason === "env_missing" || !root || !isAbsolute(root)) return status;
  const gone = await rootProblem(root);
  return gone ? { ok: false, reason: "not_found", detail: `${gone} (пропал во время проверки; шаг: ${status.reason}: ${status.detail})` } : status;
}

/**
 * Проверяет хранилище, ничего не создавая (кроме временного файла пробной записи).
 * Порядок: env → корень → маркер → store_id → том → системный диск → запись → место.
 */
export async function checkStorage(
  env: StorageEnv,
  probe: VolumeProbe,
  expectedStoreId?: string,
): Promise<StorageStatus> {
  try {
    const root = env.MS_DATA_DIR?.trim();
    if (!root) fail("env_missing", "MS_DATA_DIR не задан");
    if (!isAbsolute(root)) fail("env_missing", `MS_DATA_DIR должен быть абсолютным путём: ${root}`);
    const minFree = minFreeBytes(env);

    const problem = await rootProblem(root);
    if (problem) fail("not_found", problem);

    const marker = await step("marker_missing", "маркер", () => readMarker(root));
    if (expectedStoreId !== undefined && marker.store_id !== expectedStoreId) {
      fail("marker_mismatch", `store_id ${marker.store_id}, ожидался ${expectedStoreId}`);
    }

    // st_dev — дешёвый stat; дальше он и в статусе (сторож ловит смену устройства), и для
    // проверки системного тома.
    const dev = await step("system_volume", "устройство", () => probe.deviceId(root));
    let uuid: string;
    try {
      uuid = await probe.volumeUuid(root);
    } catch (e) {
      // проба не ответила — это не «другой том»; пропал ли корень, решит vanished()
      throw new Failed({ ok: false, reason: "volume_probe_failed", detail: `том: ${(e as Error).message}`, dev });
    }
    if (uuid !== marker.volume_uuid) {
      fail("volume_mismatch", `том ${uuid}, в маркере ${marker.volume_uuid}; перенос — doctor --adopt`);
    }

    const system = await step("system_volume", "устройство", () => onSystemVolume(root, probe, dev));
    if (system && env.MS_ALLOW_SYSTEM_DISK !== "1") {
      fail("system_volume", `${root} на системном томе; разрешить — MS_ALLOW_SYSTEM_DISK=1`);
    }

    await step("not_writable", "пробная запись", () => writeTest(root));

    const freeBytes = await step("low_space", "свободное место", () => probe.freeBytes(root));
    if (freeBytes < minFree) {
      fail("low_space", `свободно ${(freeBytes / GiB).toFixed(1)} ГиБ, нужно ${minFree / GiB} ГиБ`);
    }

    return { ok: true, root, marker, freeBytes, dev };
  } catch (e) {
    if (e instanceof Failed) return vanished(env, e.status);
    throw e;
  }
}

/** Атомарная запись маркера: уникальный tmp → fsync → rename → fsync каталога. */
async function writeMarker(root: string, marker: StoreMarker): Promise<void> {
  const tmp = join(root, `${MARKER_FILE}.${randomUUID()}.tmp`);
  const fh = await open(tmp, "wx");
  try {
    await fh.writeFile(JSON.stringify(marker, null, 2) + "\n");
    await fh.sync();
  } catch (e) {
    await fh.close().catch(() => undefined);
    await unlink(tmp).catch(() => undefined);
    throw e;
  }
  await fh.close();
  await rename(tmp, join(root, MARKER_FILE));
  // Best effort: не на всех ФС каталог можно открыть и синхронизировать.
  try {
    const dir = await open(root, "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  } catch {
    /* rename уже выполнен */
  }
}

/**
 * Создаёт хранилище (`doctor --init`) или привязывает его к новому тому (`--adopt`).
 * Корень создаётся `mkdir` без `recursive`: родитель обязан существовать.
 */
export async function initStore(
  root: string,
  probe: VolumeProbe,
  opts: { adopt?: boolean; allowSystemDisk?: boolean },
): Promise<StoreMarker> {
  if (!isAbsolute(root)) throw new StorageError("env_missing", `нужен абсолютный путь: ${root}`);
  const parent = dirname(root);
  if (!(await isDirectory(parent))) {
    throw new StorageError("not_found", `родительский каталог не существует: ${parent}`);
  }
  // Существующий корень проверяем сам (он может быть точкой монтирования или симлинком),
  // иначе — родителя, в котором его создадим.
  let rootExists = true;
  try {
    await lstat(root);
  } catch {
    rootExists = false;
  }
  if (rootExists) {
    const problem = await rootProblem(root);
    if (problem) throw new StorageError("not_found", problem);
  }
  const placed = rootExists ? root : parent;
  if (!opts.allowSystemDisk && (await onSystemVolume(placed, probe))) {
    throw new StorageError("system_volume", `${placed} на системном томе; разрешить — MS_ALLOW_SYSTEM_DISK=1`);
  }

  if (opts.adopt) {
    const old = await readMarker(root);
    const marker: StoreMarker = { ...old, volume_uuid: await probe.volumeUuid(root) };
    await writeMarker(root, marker);
    return marker;
  }

  try {
    await mkdir(root);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    // Существующий каталог без маркера можно инициализировать, готовое хранилище — нет.
    const problem = await rootProblem(root);
    if (problem) throw new StorageError("not_found", problem);
    if (await exists(join(root, MARKER_FILE))) {
      throw new StorageError("marker_mismatch", `${root} уже инициализирован; перенос на другой том — --adopt`);
    }
  }
  const marker: StoreMarker = {
    schema_version: 1,
    store_id: randomUUID(),
    volume_uuid: await probe.volumeUuid(root),
    created_at: new Date().toISOString(),
  };
  await writeMarker(root, marker);
  return marker;
}
