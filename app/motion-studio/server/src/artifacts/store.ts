// Иммутабельные ревизии артефактов видеопроекта (Global Constraints Phase 2–3): каталог draft
// публикуется в `workspace/projects/<p>/…` переносом `rename` в транзакции БД с fencing
// попытки (как `SceneRepo.publish`), содержимое и корень закрываются от записи (`chmod -R a-w`).
import { existsSync, lstatSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { chmod, lstat, open, rm } from "node:fs/promises";
import { basename, dirname, join, posix } from "node:path";
import { constants } from "node:fs";
import { SAFE_ID, safeMkdir, type StorageStatus } from "@ms/core";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import { tx } from "../db/tx.js";
import { resourceBusy } from "../jobs/locks.js";
import { sha256File } from "../scenes/hash.js";
import { newId } from "../scenes/ids.js";
import { FencedOutError, PublishCancelledError, type Fence } from "../scenes/repo.js";
import { QUARANTINE, attachCause, fsyncDirSync, fsyncWrite, lockChildrenSync, quarantineDraft, setWritableSync } from "../scenes/store.js";
import { PROJECTS_REL } from "./paths.js";

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
const SYNC_PREFIX = "sync-";

function requireStorage(status: StorageStatus): void {
  if (!status.ok) throw new Error(`storage_unavailable: ${status.reason}: ${status.detail}`);
}

/** destRel — `workspace/projects/<p>/<…>`, сегменты — безопасные имена, без `.`/`..`. */
function checkDestRel(destRel: string): void {
  const parts = destRel.split("/");
  const ok = destRel === posix.normalize(destRel) && !destRel.startsWith("/") && destRel.startsWith(`${PROJECTS_REL}/`) &&
    parts.length >= 4 && parts.every((p) => SAFE_ID.test(p) && p !== "." && p !== "..");
  if (!ok) throw new Error(`artifacts: destRel не годится (ожидается ${PROJECTS_REL}/<проект>/…): ${JSON.stringify(destRel)}`);
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

  /** Fencing и отмена (как `SceneRepo`): устаревшая попытка — `fenced_out`, запрошенная отмена — `cancelled`. */
  private gate(fence: Fence): Error | undefined {
    const job = jobs.get(this.db, fence.jobId);
    if (job?.attempt !== fence.attempt) return new FencedOutError(fence, job?.attempt);
    if (job.cancel_requested) return new PublishCancelledError(fence);
    return undefined;
  }

  /**
   * Публикация каталога draft попытки в `destRel` (ADR 0007, H9). До транзакции, асинхронно:
   * карантин, fencing, `guard()`, снимок дерева, sha256 + fsync файлов и каталогов, снова
   * `guard()` и сверка снимка. Затем `BEGIN IMMEDIATE`: fencing (`jobs.attempt`, отмена) →
   * `destRel` ещё не существует → содержимое read-only → `renameSync` → `register`. Устаревшая
   * попытка — `fenced_out` и `.quarantined`; сбой `register` — обратный `renameSync`, draft
   * снова записываемый. После COMMIT закрывается корень ревизии.
   */
  async publish(draftDir: string, destRel: string, register: Register, fence?: Fence): Promise<PublishedArtifact> {
    if (fence && basename(draftDir) !== `${fence.jobId}-a${fence.attempt}`) {
      throw new Error(`artifacts: draft ${draftDir} не принадлежит попытке ${fence.attempt} задачи ${fence.jobId}`);
    }
    if (fence) {
      const refused = this.gate(fence);
      if (refused) {
        if (!existsSync(join(draftDir, QUARANTINE))) await quarantineDraft({ dir: draftDir }, refused.message);
        throw refused;
      }
    }
    return this.publishDir(draftDir, destRel, register, fence ? () => this.gate(fence) : () => undefined, Boolean(fence));
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
    const dir = join(await safeMkdir(this.root, DRAFTS_REL), `${SYNC_PREFIX}${newId("syn")}`);
    mkdirSync(dir);
    try {
      await fsyncWrite(join(dir, file), JSON.stringify(doc, null, 2) + "\n");
      const busy = () => {
        const held = opts.lockKey === undefined ? undefined : resourceBusy(this.db, opts.lockKey);
        return held ? new ResourceBusyError(opts.lockKey!, held.jobId) : undefined;
      };
      return await this.publishDir(dir, destRel, register, busy, false);
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
    quarantineOnGate: boolean,
  ): Promise<PublishedArtifact> {
    checkDestRel(destRel);
    const draftsDir = join(this.root, DRAFTS_REL);
    if (dirname(draftDir) !== draftsDir) throw new Error(`artifacts: draft вне ${DRAFTS_REL}: ${draftDir}`);
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
    const parent = await safeMkdir(this.root, posix.dirname(destRel));
    const dest = join(this.root, destRel);

    let locked = false;
    let moved = false;
    try {
      tx(this.db, () => {
        const refused = gateInTx();
        if (refused) throw refused;
        // rename поверх пустого каталога прошёл бы молча — проверка под write-lock БД
        if (lstatSafe(dest)) throw new ArtifactExistsError(destRel);
        if (quarantined()) throw new Error(`artifacts: draft в карантине (quarantined), публикация запрещена: ${draftDir}`);
        if (!sameSnapshot(snapshotSync(draftDir), snapshot)) throw new Error(`artifacts: draft изменился после подготовки публикации: ${draftDir}`);
        // Содержимое закрываем до rename: каталог 0555 на этой машине не переносится в другой родитель.
        locked = true;
        lockChildrenSync(draftDir);
        renameSync(draftDir, dest);
        moved = true;
        // rename устойчив до COMMIT: иначе после сбоя питания строка в БД есть, а каталога нет
        fsyncDirSync(parent);
        fsyncDirSync(draftsDir);
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
      if (quarantineOnGate && (e instanceof FencedOutError || e instanceof PublishCancelledError)) await quarantineDraft({ dir: draftDir }, e.message);
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

/** Путь занят чем угодно, включая битый симлинк. */
function lstatSafe(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

