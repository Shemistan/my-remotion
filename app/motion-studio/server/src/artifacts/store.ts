// Иммутабельные ревизии артефактов видеопроекта (Global Constraints Phase 2–3): каталог draft
// публикуется в `workspace/projects/<p>/…` переносом `rename` в транзакции БД с fencing
// попытки (как `SceneRepo.publish`), содержимое и корень закрываются от записи (`chmod -R a-w`).
import { type Stats, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync } from "node:fs";
import { chmod, lstat, open, rm } from "node:fs/promises";
import { basename, dirname, join, posix } from "node:path";
import { constants } from "node:fs";
import { SAFE_ID, safeMkdir, safeMkdirSync, type StorageStatus } from "@ms/core";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import { tx } from "../db/tx.js";
import { resourceBusy } from "../jobs/locks.js";
import { fenceOk } from "../jobs/queue.js";
import { sha256File } from "../scenes/hash.js";
import { newId } from "../scenes/ids.js";
import { FencedOutError, PublishCancelledError, type Fence } from "../scenes/repo.js";
import {
  QUARANTINE, SYNC_DRAFT_PREFIX, attachCause, fsyncDirSync, fsyncWrite, fsyncWriteSync, lockChildrenSync, quarantineDraft, setWritableSync,
} from "../scenes/store.js";
import { checkArtifactDestRel } from "./paths.js";

export interface ArtifactFile {
  path: string;
  sha256: string;
}
/** Запись индекса ревизии в БД; вызывается внутри транзакции публикации после переноса файлов. */
export type Register = (db: Db, files: ArtifactFile[]) => void;

export interface PublishedArtifact {
  dir: string;
  files: ArtifactFile[];
  /** Корень не закрыт от записи после COMMIT (ревизия в БД уже есть) — предупреждение, не отказ. */
  warnings: string[];
}

/** Синхронная правка, пока ресурс пишет задача: API отвечает 409 `resource_busy`. */
export class ResourceBusyError extends Error {
  readonly code = "resource_busy";
  constructor(readonly resource: string, readonly jobId: string) {
    super(`resource_busy: ${resource} занят задачей ${jobId}`);
    this.name = "ResourceBusyError";
  }
}

/** Каталог ревизии уже существует: ревизии иммутабельны, перезаписи нет. */
export class ArtifactExistsError extends Error {
  readonly code = "artifact_exists";
  constructor(readonly destRel: string) {
    super(`artifact_exists: ${destRel} уже опубликован`);
    this.name = "ArtifactExistsError";
  }
}

const DRAFTS_REL = "workspace/drafts";

function requireStorage(status: StorageStatus): void {
  if (!status.ok) throw new Error(`storage_unavailable: ${status.reason}: ${status.detail}`);
}

/** destRel — только форма `artifactPaths` (повторное ревью Task 24, N1). */
const checkDestRel = checkArtifactDestRel;

/**
 * Зарегистрирован предок или потомок `destRel` — отказ: публикация внутрь опубликованной
 * ревизии или карантин каталога с опубликованной ревизией внутри недопустимы.
 */
function checkNesting(db: Db, destRel: string): void {
  const parts = destRel.split("/");
  const ancestors = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
  const like = `${destRel.replace(/[\\%_]/g, (c) => `\\${c}`)}/%`;
  const hit = db.prepare(
    `SELECT dest_rel FROM artifact_publications WHERE dest_rel LIKE ? ESCAPE '\\' OR dest_rel IN (${ancestors.map(() => "?").join(", ")}) ORDER BY dest_rel LIMIT 1`,
  ).pluck().get(like, ...ancestors) as string | undefined;
  if (hit !== undefined) {
    throw new Error(`artifacts: ${destRel} пересекается с зарегистрированной публикацией ${hit} — публикация и карантин запрещены`);
  }
}

/** Снимок дерева (путь → тип, размер, mtime); симлинки и спецфайлы — ошибка. */
function snapshotSync(dir: string, sub = "", out = new Map<string, string>()): Map<string, string> {
  for (const e of readdirSync(join(dir, sub), { withFileTypes: true })) {
    const rel = sub ? posix.join(sub, e.name) : e.name;
    const st = lstatSync(join(dir, rel));
    if (st.isDirectory()) {
      out.set(rel, "d");
      snapshotSync(dir, rel, out);
    } else if (st.isFile()) out.set(rel, `f:${st.size}:${st.mtimeMs}`);
    else throw new Error(`artifacts: недопустимый тип файла (симлинк/спецфайл): ${rel}`);
  }
  return out;
}

const sameSnapshot = (a: Map<string, string>, b: Map<string, string>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

async function fsyncDir(dir: string): Promise<void> {
  const fh = await open(dir, constants.O_RDONLY);
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
}

/** Снимает запрет записи с дерева (корень первым); ошибки — дальше. */
function unlockSync(dir: string): void {
  if (existsSync(dir)) setWritableSync(dir);
}

export class ArtifactStore {
  readonly root: string;
  private dbRef: Db;
  private readonly guard: () => Promise<StorageStatus>;

  constructor(deps: { root: string; db: Db; guard: () => Promise<StorageStatus> }) {
    this.root = deps.root;
    this.dbRef = deps.db;
    this.guard = deps.guard;
  }

  get db(): Db {
    return this.dbRef;
  }

  /** База переоткрыта после `storage_offline` (StorageSupervisor). */
  useDb(db: Db): void {
    this.dbRef = db;
  }

  /**
   * Fencing и отмена: попытка не текущая (`fenceOk` очереди — тот же `attempt` и задача
   * `running`) — `fenced_out`, запрошенная отмена — `cancelled`.
   */
  private gate(fence: Fence): Error | undefined {
    if (!fenceOk(this.db, fence.jobId, fence.attempt)) return new FencedOutError(fence, jobs.get(this.db, fence.jobId)?.attempt);
    if (jobs.get(this.db, fence.jobId)?.cancel_requested) return new PublishCancelledError(fence);
    return undefined;
  }

  /**
   * Публикация каталога draft попытки в `destRel` (ADR 0007, H9). До транзакции, асинхронно:
   * карантин, fencing, `guard()`, снимок дерева, sha256 + fsync файлов и каталогов, снова
   * `guard()` и сверка снимка. Затем `BEGIN IMMEDIATE`: fencing (`fenceOk`, отмена) →
   * место назначения свободно (зарегистрированное — `artifact_exists`, сирота без строки
   * `artifact_publications` — в `workspace/quarantine/artifacts/`; только настоящий каталог,
   * файл/симлинк — ошибка; зарегистрированный предок или потомок `destRel` — отказ) → содержимое read-only →
   * `renameSync` → строка реестра → `register`. Устаревшая попытка — `fenced_out` и
   * `.quarantined`; сбой `register` — обратный `renameSync`, draft снова записываемый. После
   * COMMIT закрывается корень ревизии. Draft — настоящий каталог в `workspace/drafts`;
   * `destRel` — только форма `artifactPaths` (`checkArtifactDestRel`), иначе отказ до изменений ФС.
   */
  async publish(draftDir: string, destRel: string, register: Register, fence?: Fence): Promise<PublishedArtifact> {
    if (fence && basename(draftDir) !== `${fence.jobId}-a${fence.attempt}`) {
      throw new Error(`artifacts: draft ${draftDir} не принадлежит попытке ${fence.attempt} задачи ${fence.jobId}`);
    }
    checkDraftDir(draftDir, join(this.root, DRAFTS_REL)); // до маркера карантина: он пишется в draft
    if (fence) {
      const refused = this.gate(fence);
      if (refused) {
        if (!existsSync(join(draftDir, QUARANTINE))) await quarantineDraft({ dir: draftDir }, refused.message);
        throw refused;
      }
    }
    return this.publishDir(draftDir, destRel, register, fence ? () => this.gate(fence) : () => undefined, fence);
  }

  /**
   * Синхронная правка пользователя: документ `doc` → `<destRel>/<file>` через временный draft
   * `workspace/drafts/sync-<id>/`. `opts.lockKey` — замок ресурса: держит задача →
   * `ResourceBusyError` (409). Проверка `base_revision` (409 `revision_conflict`) — в `register`.
   * Временный draft удаляется при любом исходе.
   */
  async writeRevision(destRel: string, file: string, doc: unknown, register: Register, opts: { lockKey?: string } = {}): Promise<PublishedArtifact> {
    if (!SAFE_ID.test(file) || file === QUARANTINE) throw new Error(`artifacts: имя файла ревизии не годится: ${JSON.stringify(file)}`);
    checkDestRel(destRel);
    requireStorage(await this.guard());
    const dir = join(await safeMkdir(this.root, DRAFTS_REL), `${SYNC_DRAFT_PREFIX}${newId("syn")}`);
    mkdirSync(dir);
    try {
      await fsyncWrite(join(dir, file), JSON.stringify(doc, null, 2) + "\n");
      const busy = () => {
        const held = opts.lockKey === undefined ? undefined : resourceBusy(this.db, opts.lockKey);
        return held ? new ResourceBusyError(opts.lockKey!, held.jobId) : undefined;
      };
      return await this.publishDir(dir, destRel, register, busy, undefined);
    } finally {
      if (existsSync(dir)) {
        try {
          unlockSync(dir);
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      }
    }
  }

  private async publishDir(
    draftDir: string,
    destRel: string,
    register: Register,
    gateInTx: () => Error | undefined,
    fence: Fence | undefined,
  ): Promise<PublishedArtifact> {
    checkDestRel(destRel);
    const draftsDir = join(this.root, DRAFTS_REL);
    checkDraftDir(draftDir, draftsDir);
    const quarantined = () => existsSync(join(draftDir, QUARANTINE));
    if (quarantined()) throw new Error(`artifacts: draft в карантине (quarantined), публикация запрещена: ${draftDir}`);
    requireStorage(await this.guard());

    const snapshot = snapshotSync(draftDir);
    const paths = [...snapshot].filter(([, v]) => v !== "d").map(([k]) => k).sort();
    const dirs = [...snapshot].filter(([, v]) => v === "d").map(([k]) => k);
    const files: ArtifactFile[] = [];
    for (const path of paths) files.push({ path, sha256: await sha256File(join(draftDir, path), { sync: true }) });
    for (const d of dirs.sort((x, y) => y.length - x.length)) await fsyncDir(join(draftDir, d));
    await fsyncDir(draftDir);

    // Перепроверка прямо перед коммитом: между первой проверкой и ней шло хеширование.
    requireStorage(await this.guard());
    if (quarantined()) throw new Error(`artifacts: draft попал в карантин (quarantined) во время публикации: ${draftDir}`);
    if (!sameSnapshot(snapshotSync(draftDir), snapshot)) throw new Error(`artifacts: draft изменился во время подготовки публикации: ${draftDir}`);
    checkNesting(this.db, destRel); // до создания родителей: внутрь опубликованного не лезть
    const parent = await safeMkdir(this.root, posix.dirname(destRel));
    const dest = join(this.root, destRel);

    let locked = false;
    let moved = false;
    try {
      tx(this.db, () => {
        const refused = gateInTx();
        if (refused) throw refused;
        // rename поверх пустого каталога прошёл бы молча — проверка под write-lock БД.
        // Зарегистрированный каталог — опубликованная ревизия; без строки реестра — сирота
        // прерванной публикации (rename прошёл, COMMIT нет): в карантин, место свободно.
        // Сирота — только настоящий каталог формы artifactPaths без зарегистрированных
        // предков и потомков; файл или симлинк на месте назначения — ошибка, ничего не трогаем.
        checkNesting(this.db, destRel);
        const st = lstatOrUndefined(dest);
        if (st) {
          if (isPublished(this.db, destRel)) throw new ArtifactExistsError(destRel);
          if (st.isSymbolicLink() || !st.isDirectory()) {
            throw new Error(`artifacts: на месте назначения ${destRel} не каталог (файл или симлинк) — публикация отклонена, ничего не тронуто`);
          }
          quarantineOrphanSync(this.root, dest, destRel);
          fsyncDirSync(parent);
        }
        if (quarantined()) throw new Error(`artifacts: draft в карантине (quarantined), публикация запрещена: ${draftDir}`);
        checkDraftDir(draftDir, draftsDir); // каталог могли подменить симлинком после снимка
        if (!sameSnapshot(snapshotSync(draftDir), snapshot)) throw new Error(`artifacts: draft изменился после подготовки публикации: ${draftDir}`);
        // Содержимое закрываем до rename: каталог 0555 на этой машине не переносится в другой родитель.
        locked = true;
        lockChildrenSync(draftDir);
        renameSync(draftDir, dest);
        moved = true;
        // rename устойчив до COMMIT: иначе после сбоя питания строка в БД есть, а каталога нет
        fsyncDirSync(parent);
        fsyncDirSync(draftsDir);
        this.db.prepare("INSERT INTO artifact_publications (dest_rel, job_id, attempt, published_at) VALUES (?, ?, ?, ?)")
          .run(destRel, fence?.jobId ?? null, fence?.attempt ?? null, new Date().toISOString());
        register(this.db, files);
      });
    } catch (e) {
      try {
        if (moved) {
          setWritableSync(dest);
          renameSync(dest, draftDir);
        } else if (locked) {
          unlockSync(draftDir);
        }
      } catch (u) {
        attachCause(e, u);
      }
      if (fence && (e instanceof FencedOutError || e instanceof PublishCancelledError)) await quarantineDraft({ dir: draftDir }, e.message);
      throw e;
    }
    const warnings: string[] = [];
    try {
      const st = await lstat(dest);
      await chmod(dest, st.mode & 0o555);
    } catch (e) {
      warnings.push(`корень ревизии не закрыт от записи: ${(e as Error).message}`);
    }
    return { dir: dest, files, warnings };
  }
}

/** Каталог `destRel` опубликован (строка реестра `artifact_publications`). */
export function isPublished(db: Db, destRel: string): boolean {
  return db.prepare("SELECT 1 FROM artifact_publications WHERE dest_rel = ?").get(destRel) !== undefined;
}

/**
 * Кто опубликовал каталог `destRel` (строка `artifact_publications`): восстановление после
 * сбоя отличает «опубликовано попыткой N этой задачи» от «не опубликовано» (ревью Task 24, M3).
 */
export function publicationOf(db: Db, destRel: string): { job_id: string | null; attempt: number | null } | undefined {
  return db.prepare("SELECT job_id, attempt FROM artifact_publications WHERE dest_rel = ?").get(destRel) as
    { job_id: string | null; attempt: number | null } | undefined;
}

/** Корень карантина каталогов-сирот (относительно хранилища). */
export const ORPHANS_REL = "workspace/quarantine/artifacts";

/**
 * Сирота на месте назначения (настоящий каталог формы `artifactPaths`, проверено
 * вызывающим) → `workspace/quarantine/artifacts/<qrn_…>/` с маркером `.quarantined`
 * (причина, исходный `dest_rel`). Синхронно — внутри транзакции публикации.
 * Read-only снимается: каталог 0555 не переносится в другой родитель.
 */
function quarantineOrphanSync(root: string, dest: string, destRel: string): string {
  const qdir = join(safeMkdirSync(root, ORPHANS_REL), newId("qrn"));
  setWritableSync(dest);
  renameSync(dest, qdir);
  const reason = { reason: "orphan_artifact: каталог без записи в реестре (публикация прервана до COMMIT)", dest_rel: destRel, at: new Date().toISOString() };
  fsyncWriteSync(join(qdir, QUARANTINE), JSON.stringify(reason, null, 2) + "\n");
  fsyncDirSync(dirname(qdir));
  return qdir;
}

/**
 * Draft — настоящий каталог (не симлинк) прямо в `workspace/drafts`, и по realpath тоже:
 * иначе `chmod -R a-w` и rename ушли бы по ссылке наружу.
 */
function checkDraftDir(draftDir: string, draftsDir: string): void {
  const bad = (why: string) => new Error(`artifacts: draft не годится (${why}): ${draftDir}`);
  if (dirname(draftDir) !== draftsDir) throw bad(`вне ${DRAFTS_REL}`);
  let st;
  try {
    st = lstatSync(draftDir);
  } catch (e) {
    throw bad((e as Error).message);
  }
  if (st.isSymbolicLink() || !st.isDirectory()) throw bad("не каталог или симлинк");
  if (dirname(realpathSync(draftDir)) !== realpathSync(draftsDir)) throw bad(`realpath вне ${DRAFTS_REL}`);
}

/** lstat пути или `undefined`, если его нет (битый симлинк — есть). */
function lstatOrUndefined(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

