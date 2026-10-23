import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync, openSync, readdirSync, renameSync, rmSync, writeSync,
} from "node:fs";
import { chmod, copyFile, lstat, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join, posix, sep } from "node:path";
import { VersionManifestSchema, type Settings, type VersionManifest } from "@ms/contracts";
import { SAFE_ID, type ProcessRegistry, fileProcessRegistry, safeMkdir, safeMkdirSync, type StorageStatus } from "@ms/core";
import { sha256, sha256File } from "./hash.js";
import { newId } from "./ids.js";

/** Проект по умолчанию: Playground (создаётся миграцией 001). */
export const DEFAULT_PROJECT = "playground";
const MANIFEST = "manifest.json";
export const QUARANTINE = ".quarantined";
/** Временный draft синхронной правки (`ArtifactStore.writeRevision`): `workspace/drafts/sync-<id>/`. */
export const SYNC_DRAFT_PREFIX = "sync-";
const COPIED_FROM_PARENT = ["src", "props.json", "spec.json", "settings.json"];

export interface DraftRef {
  runId: string;
  attempt: number;
  sceneId: string;
  /** Проект сцены; по умолчанию `playground` (H7). */
  projectId?: string;
  parentVersionId?: string;
}
export interface Draft extends DraftRef {
  projectId: string;
  /** Корень хранилища (MS_DATA_DIR): нужен публикации для safeMkdir и rename. */
  root: string;
  dir: string;
}
export type PublishMeta = Omit<VersionManifest, "files" | "version_id" | "number" | "created_at">;

function checkId(kind: string, id: string): void {
  if (!SAFE_ID.test(id)) throw new Error(`scenes: ${kind} не годится для имени файла: ${JSON.stringify(id)}`);
}
/** Каталог экспорта относительно корня хранилища (`05` §1). */
export function exportRel(projectId: string, exportId: string): string {
  checkId("projectId", projectId);
  checkId("exportId", exportId);
  return `workspace/projects/${projectId}/exports/${exportId}`;
}

/** Каталог сцены относительно корня хранилища. */
export function sceneRel(projectId: string, sceneId: string): string {
  checkId("projectId", projectId);
  checkId("sceneId", sceneId);
  return `workspace/projects/${projectId}/scenes/${sceneId}`;
}

/** Файлы и подкаталоги (POSIX-пути от `dir`); симлинки и спецфайлы — ошибка. */
async function walk(dir: string, sub = ""): Promise<{ files: string[]; dirs: string[] }> {
  const files: string[] = [];
  const dirs: string[] = [];
  for (const e of await readdir(join(dir, sub), { withFileTypes: true })) {
    const rel = sub ? posix.join(sub, e.name) : e.name;
    if (e.isDirectory()) {
      dirs.push(rel);
      const inner = await walk(dir, rel);
      files.push(...inner.files);
      dirs.push(...inner.dirs);
    } else if (e.isFile()) files.push(rel);
    else throw new Error(`scenes: недопустимый тип файла (симлинк/спецфайл): ${rel}`);
  }
  return { files, dirs };
}

/** Снимает запрет записи (глубина первой не нужна: сначала корень, затем дети). */
export async function setWritable(path: string): Promise<void> {
  const st = await lstat(path);
  if (st.isDirectory()) {
    await chmod(path, 0o755);
    for (const n of await readdir(path)) await setWritable(join(path, n));
  } else if (st.isFile()) {
    await chmod(path, 0o644);
  }
}

/** `chmod -R a-w` для содержимого (без корня): глубина первой; симлинки и спецфайлы — ошибка. */
export async function lockChildren(dir: string): Promise<void> {
  for (const n of await readdir(dir)) {
    const p = join(dir, n);
    const st = await lstat(p);
    if (st.isDirectory()) {
      await lockChildren(p);
      await chmod(p, st.mode & 0o555);
    } else if (st.isFile()) {
      await chmod(p, st.mode & 0o555);
    } else {
      throw new Error(`scenes: недопустимый тип файла при блокировке: ${p}`);
    }
  }
}

const sameSnapshot = (a: Map<string, string>, b: Map<string, string>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

export function setWritableSync(path: string): void {
  const st = lstatSync(path);
  if (st.isDirectory()) {
    chmodSync(path, 0o755);
    for (const n of readdirSync(path)) setWritableSync(join(path, n));
  } else if (st.isFile()) {
    chmodSync(path, 0o644);
  }
}

/** `chmod -R a-w` содержимого (без корня), синхронно — годится внутри транзакции. */
export function lockChildrenSync(dir: string): void {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const st = lstatSync(p);
    if (st.isDirectory()) {
      lockChildrenSync(p);
      chmodSync(p, st.mode & 0o555);
    } else if (st.isFile()) {
      chmodSync(p, st.mode & 0o555);
    } else {
      throw new Error(`scenes: недопустимый тип файла при блокировке: ${p}`);
    }
  }
}

async function lockRoot(dir: string): Promise<void> {
  const st = await lstat(dir);
  if (!st.isDirectory()) throw new Error(`scenes: не каталог: ${dir}`);
  await chmod(dir, st.mode & 0o555);
}

/** Первый путь внутри версии (включая корень) с правом записи, если есть. */
export async function writablePath(dir: string): Promise<string | undefined> {
  const { files, dirs } = await walk(dir);
  for (const rel of [".", ...dirs, ...files]) {
    if ((await lstat(join(dir, rel))).mode & 0o222) return rel;
  }
  return undefined;
}

export async function fsyncWrite(path: string, data: string | Uint8Array): Promise<void> {
  const fh = await open(path, "w");
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

export function fsyncWriteSync(path: string, data: string): void {
  const fd = openSync(path, "w");
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function fsyncDirSync(dir: string): void {
  const fd = openSync(dir, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Снимок дерева draft (путь → тип, размер, mtime) без `manifest.json` корня: подготовка
 * снимает его до хеширования и сверяет после, коммит сверяет ещё раз.
 */
function snapshotSync(dir: string, sub = "", out = new Map<string, string>()): Map<string, string> {
  for (const e of readdirSync(join(dir, sub), { withFileTypes: true })) {
    const rel = sub ? posix.join(sub, e.name) : e.name;
    if (rel === MANIFEST) continue;
    const st = lstatSync(join(dir, rel));
    if (st.isDirectory()) {
      out.set(rel, "d");
      snapshotSync(dir, rel, out);
    } else if (st.isFile()) out.set(rel, `f:${st.size}:${st.mtimeMs}`);
    else throw new Error(`scenes: недопустимый тип файла (симлинк/спецфайл): ${rel}`);
  }
  return out;
}

async function fsyncDir(dir: string): Promise<void> {
  const fh = await open(dir, constants.O_RDONLY);
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
}

export async function copyTree(root: string, from: string, toRel: string): Promise<void> {
  const st = await lstat(from);
  if (st.isDirectory()) {
    await safeMkdir(root, toRel);
    for (const n of await readdir(from)) await copyTree(root, join(from, n), posix.join(toRel, n));
  } else if (st.isFile()) {
    await copyFile(from, join(root, toRel));
  } else {
    throw new Error(`scenes: недопустимый тип файла при копировании: ${from}`);
  }
}

/** Рабочий каталог одной попытки; повторно не используется. */
export async function createDraft(root: string, ref: DraftRef): Promise<Draft> {
  const projectId = ref.projectId ?? DEFAULT_PROJECT;
  checkId("runId", ref.runId);
  const rel = sceneRel(projectId, ref.sceneId);
  if (!Number.isInteger(ref.attempt) || ref.attempt < 1) throw new Error(`scenes: attempt должен быть целым >= 1: ${ref.attempt}`);
  if (ref.parentVersionId !== undefined) checkId("parentVersionId", ref.parentVersionId);

  let parentDir: string | undefined;
  if (ref.parentVersionId) {
    parentDir = join(root, rel, "versions", ref.parentVersionId);
    await readVersion(parentDir); // родитель должен быть целым
  }

  const name = `${ref.runId}-a${ref.attempt}`;
  const draftsDir = await safeMkdir(root, "workspace/drafts");
  const dir = join(draftsDir, name);
  try {
    await mkdir(dir); // без recursive: существующий каталог — ошибка
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`scenes: draft уже exists: ${name}`, { cause: e });
    throw e;
  }
  if (parentDir) {
    try {
      for (const item of COPIED_FROM_PARENT) {
        if (existsSync(join(parentDir, item))) await copyTree(root, join(parentDir, item), `workspace/drafts/${name}/${item}`);
      }
      await setWritable(dir); // родитель read-only, копии должны быть записываемыми
    } catch (e) {
      await rm(dir, { recursive: true, force: true });
      throw e;
    }
  }
  return { ...ref, projectId, root, dir };
}

export interface Brief {
  prompt: string;
  settings: Settings;
  created_at: string;
}

export async function writeBrief(root: string, sceneId: string, brief: Brief, projectId = DEFAULT_PROJECT): Promise<void> {
  const dir = await safeMkdir(root, sceneRel(projectId, sceneId));
  const tmp = join(dir, "brief.json.tmp");
  await fsyncWrite(tmp, JSON.stringify(brief, null, 2) + "\n");
  await rename(tmp, join(dir, "brief.json"));
}

/** Синхронный `writeBrief` — для создания сцены внутри транзакции SQLite. */
export function writeBriefSync(root: string, sceneId: string, brief: Brief, projectId = DEFAULT_PROJECT): void {
  const dir = safeMkdirSync(root, sceneRel(projectId, sceneId));
  const tmp = join(dir, "brief.json.tmp");
  fsyncWriteSync(tmp, JSON.stringify(brief, null, 2) + "\n");
  renameSync(tmp, join(dir, "brief.json"));
}

/**
 * Неудача прогона, не дошедшего до версии (сбой до draft, карантин): `failure.json`
 * рядом с `brief.json`, чтобы сцена не выглядела «в работе». Перезаписывается последним прогоном.
 */
export async function writeSceneFailure(
  root: string,
  sceneId: string,
  failure: Record<string, unknown>,
  projectId = DEFAULT_PROJECT,
): Promise<void> {
  const dir = await safeMkdir(root, sceneRel(projectId, sceneId));
  const tmp = join(dir, "failure.json.tmp");
  await fsyncWrite(tmp, JSON.stringify({ ...failure, at: new Date().toISOString() }, null, 2) + "\n");
  await rename(tmp, join(dir, "failure.json"));
}

/**
 * Восстановление при старте (под owner lock, после разбора реестра): draft без маркера
 * карантина, у попытки которого нет живых записей в реестре (сервер — слияние
 * `job_processes` и бокового `run/processes/`), брошен — прогон умер или хранилище
 * пропало до записи маркера. Такие draft помечаются карантином с причиной `abandoned`;
 * draft с живыми записями процессов не трогаются. Временный `sync-<id>` синхронной правки
 * (процессов у него нет) на старте брошен всегда: правка живёт внутри запроса сервера, а
 * восстановление идёт под owner lock до приёма запросов.
 */
export async function sweepAbandonedDrafts(
  root: string,
  registry: ProcessRegistry = fileProcessRegistry(root),
): Promise<{ quarantined: string[]; skipped: string[] }> {
  const out = { quarantined: [] as string[], skipped: [] as string[] };
  const draftsDir = join(root, "workspace/drafts");
  if (!existsSync(draftsDir)) return out;
  const live = new Set((await registry.live()).map((p) => `${p.runId}-a${p.attempt}`));
  for (const e of await readdir(draftsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = join(draftsDir, e.name);
    if (e.name.startsWith(SYNC_DRAFT_PREFIX)) {
      if (existsSync(join(dir, QUARANTINE))) continue;
      await fsyncWrite(join(dir, QUARANTINE), JSON.stringify({ reason: "abandoned: синхронная правка не завершена", at: new Date().toISOString() }, null, 2) + "\n");
      out.quarantined.push(dir);
      continue;
    }
    const m = /^(.+)-a(\d+)$/.exec(e.name);
    if (!m || existsSync(join(dir, QUARANTINE))) continue;
    if (live.has(e.name)) {
      out.skipped.push(dir);
      continue;
    }
    const half = existsSync(join(dir, MANIFEST)) ? ": manifest есть, публикация не завершена" : "";
    await fsyncWrite(join(dir, QUARANTINE), JSON.stringify({ reason: `abandoned${half}`, at: new Date().toISOString() }, null, 2) + "\n");
    out.quarantined.push(dir);
  }
  return out;
}

/** Помечает draft карантином: публикация запрещена, каталог не трогать до решения человека. */
export async function quarantineDraft(draft: Pick<Draft, "dir">, reason: string): Promise<void> {
  await quarantineDir(draft.dir, reason);
}

/** То же по каталогу draft (восстановление знает только `<job>-a<attempt>`). */
export async function quarantineDir(dir: string, reason: string): Promise<void> {
  await fsyncWrite(join(dir, QUARANTINE), JSON.stringify({ reason, at: new Date().toISOString() }, null, 2) + "\n");
}

function requireStorage(status: StorageStatus): void {
  if (!status.ok) throw new Error(`storage_unavailable: ${status.reason}: ${status.detail}`);
}

/** Текст `manifest.json` версии (по нему считается `scene_versions.manifest_sha256`). */
export function manifestText(m: VersionManifest): string {
  return JSON.stringify(m, null, 2) + "\n";
}

/** Draft, готовый к коммиту: файлы захешированы и на диске, хранилище проверено. */
export interface PreparedVersion {
  draft: Draft;
  meta: PublishMeta;
  files: { path: string; sha256: string }[];
  /** Абсолютный путь `versions/` сцены (создан). */
  versionsDir: string;
  snapshot: Map<string, string>;
}

/**
 * Асинхронная подготовка публикации (H9) — всё медленное до транзакции SQLite:
 * 1) guard и карантин; 2) снимок дерева; 3) sha256 + fsync каждого файла, fsync
 * подкаталогов; 4) проверка manifest по схеме; 5) guard и карантин ещё раз; 6) сверка
 * снимка — запись в draft во время хеширования отвергает публикацию; 7) каталог
 * `versions/` сцены. Draft не меняется (старый `manifest.json` в нём игнорируется и
 * перезаписывается коммитом). `opts.onHashed` — точка наблюдения для тестов.
 */
export async function prepareVersion(
  draft: Draft,
  meta: PublishMeta,
  guard: () => Promise<StorageStatus>,
  opts: { onHashed?: (path: string) => void | Promise<void> } = {},
): Promise<PreparedVersion> {
  if (meta.scene_id !== draft.sceneId) throw new Error(`scenes: scene_id манифеста (${meta.scene_id}) не совпадает с draft (${draft.sceneId})`);
  if ((meta.parent_version_id ?? null) !== (draft.parentVersionId ?? null)) {
    throw new Error(`scenes: parent_version_id манифеста (${meta.parent_version_id}) не совпадает с draft (${draft.parentVersionId ?? null})`);
  }
  const quarantined = () => existsSync(join(draft.dir, QUARANTINE));
  if (quarantined()) throw new Error(`scenes: draft в карантине (quarantined), публикация запрещена: ${draft.dir}`);
  requireStorage(await guard());

  const snapshot = snapshotSync(draft.dir);
  const paths = [...snapshot].filter(([, v]) => v !== "d").map(([k]) => k).sort();
  const dirs = [...snapshot].filter(([, v]) => v === "d").map(([k]) => k);
  if (paths.includes(QUARANTINE)) throw new Error(`scenes: draft в карантине (quarantined): ${draft.dir}`);
  const files = [];
  for (const path of paths) {
    files.push({ path, sha256: await sha256File(join(draft.dir, path), { sync: true }) });
    await opts.onHashed?.(path);
  }
  if (meta.preview && !files.some((f) => f.path === meta.preview!.path && f.sha256 === meta.preview!.sha256)) {
    throw new Error(`scenes: preview ${meta.preview.path} не найден в файлах draft (или sha256 не совпадает)`);
  }
  // Схема проверяется до транзакции: в коммите остаются только id, номер и время.
  VersionManifestSchema.parse({ ...meta, version_id: "ver_PREPARE", number: 1, created_at: new Date().toISOString(), files });
  for (const d of dirs.sort((x, y) => y.length - x.length)) await fsyncDir(join(draft.dir, d));

  // Перепроверка прямо перед коммитом: между первой проверкой и ней шло хеширование.
  requireStorage(await guard());
  if (quarantined()) throw new Error(`scenes: draft попал в карантин (quarantined) во время публикации: ${draft.dir}`);
  if (!sameSnapshot(snapshotSync(draft.dir), snapshot)) throw new Error(`scenes: draft изменился во время подготовки публикации: ${draft.dir}`);
  const versionsDir = await safeMkdir(draft.root, `${sceneRel(draft.projectId, draft.sceneId)}/versions`);
  return { draft, meta, files, versionsDir, snapshot };
}

/**
 * Синхронный коммит файлов (внутри транзакции SQLite, H9): карантин и неизменность draft →
 * `manifest.json` + fsync → содержимое read-only (глубина первой) → `renameSync` в
 * `dest.dir`. Корень версии закрывает вызывающий (`sealVersion`) после COMMIT. Сбой до
 * rename возвращает draft в записываемое состояние без manifest.
 */
export function commitVersionFiles(prepared: PreparedVersion, dest: { versionId: string; number: number; dir: string }): VersionManifest {
  const { draft } = prepared;
  checkId("versionId", dest.versionId);
  if (existsSync(join(draft.dir, QUARANTINE))) throw new Error(`scenes: draft в карантине (quarantined), публикация запрещена: ${draft.dir}`);
  if (!sameSnapshot(snapshotSync(draft.dir), prepared.snapshot)) throw new Error(`scenes: draft изменился после подготовки публикации: ${draft.dir}`);
  const manifest = VersionManifestSchema.parse({
    ...prepared.meta,
    version_id: dest.versionId,
    number: dest.number,
    created_at: new Date().toISOString(),
    files: prepared.files,
  });
  const manifestPath = join(draft.dir, MANIFEST);
  try {
    fsyncWriteSync(manifestPath, manifestText(manifest));
    fsyncDirSync(draft.dir);
    // Содержимое закрываем до rename: каталог 0555 на этой машине не переносится в другой родитель.
    lockChildrenSync(draft.dir);
    renameSync(draft.dir, dest.dir);
  } catch (e) {
    try {
      setWritableSync(draft.dir);
      rmSync(manifestPath, { force: true });
    } catch {
      // draft остаётся как есть; карантин поставит вызывающий
    }
    throw e;
  }
  // Rename устойчив до COMMIT: иначе после сбоя питания строка в БД есть, а каталога нет.
  try {
    fsyncDirSync(dirname(dest.dir));
    fsyncDirSync(dirname(draft.dir));
  } catch (e) {
    try {
      undoCommitVersionFiles(prepared, dest.dir);
    } catch (u) {
      attachCause(e, u);
    }
    throw e;
  }
  return manifest;
}

/** Ошибка отката не подменяет исходную: она уходит в `cause` (или в текст, если `cause` занят). */
export function attachCause(e: unknown, cause: unknown): void {
  if (!(e instanceof Error)) return;
  if (e.cause === undefined) e.cause = cause;
  else e.message += `; откат тоже не удался: ${(cause as Error)?.message ?? String(cause)}`;
}

/**
 * Откат коммита, когда запись в БД не удалась после rename: версия снова записываемая и
 * возвращается на место draft без `manifest.json`.
 */
export function undoCommitVersionFiles(prepared: PreparedVersion, dir: string): void {
  setWritableSync(dir);
  renameSync(dir, prepared.draft.dir);
  rmSync(join(prepared.draft.dir, MANIFEST), { force: true });
}

/** После COMMIT: запрет записи корня версии (fsync каталогов уже сделал `commitVersionFiles`). */
export async function sealVersion(dir: string): Promise<void> {
  await lockRoot(dir);
}

/**
 * Публикация без БД (срез, CLI): `prepareVersion` → номер по числу каталогов версий →
 * `commitVersionFiles` → `sealVersion`. Сбой до rename оставляет draft; после rename версия
 * целая, а незакрытый корень (сбой до `sealVersion`) `readVersion` отвергает,
 * `relockVersions` закрывает его при старте.
 */
export async function publishVersion(
  draft: Draft,
  meta: PublishMeta,
  guard: () => Promise<StorageStatus>,
): Promise<{ versionId: string; dir: string; manifest: VersionManifest; warnings: string[] }> {
  const prepared = await prepareVersion(draft, meta, guard);
  const number = (await readdir(prepared.versionsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).length + 1;
  const versionId = newId("ver");
  const dir = join(prepared.versionsDir, versionId);
  const manifest = commitVersionFiles(prepared, { versionId, number, dir });
  await sealVersion(dir);
  return { versionId, dir, manifest, warnings: [] };
}

/**
 * Доводит прерванный rename (reconcile при старте): draft с `manifest.json`, чей sha256
 * совпадает с `scene_versions.manifest_sha256`, и все файлы которого сверены по manifest,
 * переносится в `versionDir` и закрывается. Любое расхождение — ошибка, файлы не трогаются.
 * Маркер `.quarantined` (его ставит `sweepAbandonedDrafts`) допускается и снимается.
 */
export async function adoptDraftAsVersion(draftDir: string, versionDir: string, manifestSha: string, root: string): Promise<VersionManifest> {
  const text = await readFile(join(draftDir, MANIFEST), "utf8");
  if (sha256(text) !== manifestSha) throw new Error(`scenes: sha256 manifest.json в draft не совпадает с БД: ${draftDir}`);
  const manifest = VersionManifestSchema.parse(JSON.parse(text));
  if (manifest.version_id !== basename(versionDir)) throw new Error(`scenes: version_id ${manifest.version_id} ≠ ${basename(versionDir)}`);
  const tree = await walk(draftDir);
  const actual = new Set(tree.files.filter((p) => p !== MANIFEST && p !== QUARANTINE));
  const declared = new Set(manifest.files.map((f) => f.path));
  for (const p of actual) if (!declared.has(p)) throw new Error(`scenes: лишний файл вне manifest: ${p}`);
  for (const f of manifest.files) {
    if (!actual.has(f.path)) throw new Error(`scenes: файл из manifest отсутствует: ${f.path}`);
    if ((await sha256File(join(draftDir, f.path))) !== f.sha256) throw new Error(`scenes: sha256 не совпадает: ${f.path}`);
  }
  if (existsSync(versionDir)) throw new Error(`scenes: каталог версии уже существует: ${versionDir}`);
  await rm(join(draftDir, QUARANTINE), { force: true });
  const rel = posix.relative(root.split(sep).join(posix.sep), dirname(versionDir).split(sep).join(posix.sep));
  const parent = await safeMkdir(root, rel);
  await lockChildren(draftDir);
  await rename(draftDir, versionDir);
  await fsyncDir(parent);
  await fsyncDir(dirname(draftDir));
  await lockRoot(versionDir);
  return readVersion(versionDir);
}

/**
 * Читает версию и сверяет её с manifest: схема, имя каталога и путь сцены, sha256 каждого
 * файла, ни лишних, ни пропавших, preview в `files`, всё под запретом записи.
 * `allowWritable` нужен только `relockVersions` (проверить хеши до повторной блокировки).
 */
export async function readVersion(dir: string, opts: { allowWritable?: boolean } = {}): Promise<VersionManifest> {
  let text: string;
  try {
    text = await readFile(join(dir, MANIFEST), "utf8");
  } catch (e) {
    throw new Error(`scenes: нет ${MANIFEST} — версия не опубликована или повреждена: ${dir}`, { cause: e });
  }
  const manifest = VersionManifestSchema.parse(JSON.parse(text));
  if (manifest.version_id !== basename(dir)) throw new Error(`scenes: version_id ${manifest.version_id} не совпадает с именем каталога ${basename(dir)}`);
  const sceneDir = basename(dirname(dirname(dir)));
  if (manifest.scene_id !== sceneDir) throw new Error(`scenes: scene_id ${manifest.scene_id} не совпадает с каталогом сцены ${sceneDir}`);
  const tree = await walk(dir);
  const actual = new Set(tree.files.filter((p) => p !== MANIFEST));
  const declared = new Set(manifest.files.map((f) => f.path));
  if (declared.size !== manifest.files.length) throw new Error(`scenes: дубли путей в manifest: ${dir}`);
  for (const p of actual) if (!declared.has(p)) throw new Error(`scenes: лишний файл вне manifest: ${p}`);
  for (const f of manifest.files) {
    if (!actual.has(f.path)) throw new Error(`scenes: файл из manifest отсутствует: ${f.path}`);
    if ((await sha256File(join(dir, f.path))) !== f.sha256) throw new Error(`scenes: sha256 не совпадает: ${f.path}`);
  }
  if (manifest.preview && !manifest.files.some((f) => f.path === manifest.preview!.path && f.sha256 === manifest.preview!.sha256)) {
    throw new Error(`scenes: preview ${manifest.preview.path} не найден в files с тем же sha256`);
  }
  if (!opts.allowWritable) {
    const w = await writablePath(dir);
    if (w !== undefined) throw new Error(`scenes: версия не закрыта от записи (writable): ${w} в ${dir}; запустите relockVersions`);
  }
  return manifest;
}

/**
 * Восстановление при старте: закрывает версии, оставшиеся записываемыми (сбой между rename
 * и chmod). Хеши проверяются до блокировки; повреждённые не трогаются и возвращаются в `broken`.
 */
export async function relockVersions(root: string): Promise<{ relocked: string[]; broken: { dir: string; error: string }[] }> {
  const out = { relocked: [] as string[], broken: [] as { dir: string; error: string }[] };
  const sub = async (d: string) => (existsSync(d) ? (await readdir(d, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => join(d, e.name)) : []);
  for (const project of await sub(join(root, "workspace/projects"))) {
    for (const scene of await sub(join(project, "scenes"))) {
      for (const dir of await sub(join(scene, "versions"))) {
        try {
          await readVersion(dir, { allowWritable: true });
          if ((await writablePath(dir)) === undefined) continue;
          await lockChildren(dir);
          await lockRoot(dir);
          out.relocked.push(dir);
        } catch (e) {
          out.broken.push({ dir, error: (e as Error).message });
        }
      }
    }
  }
  return out;
}
