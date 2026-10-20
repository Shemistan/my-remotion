import { constants, existsSync } from "node:fs";
import { chmod, copyFile, lstat, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { join, posix } from "node:path";
import { VersionManifestSchema, type Settings, type VersionManifest } from "@ms/contracts";
import { safeMkdir, type StorageStatus } from "@ms/core";
import { sha256File } from "./hash.js";
import { newId } from "./ids.js";

// Тот же шаблон, что в core/run/processes: идентификаторы идут в имена файлов.
const SAFE_ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
const PROJECT = "playground";
const MANIFEST = "manifest.json";
const QUARANTINE = ".quarantined";
const COPIED_FROM_PARENT = ["src", "props.json", "spec.json", "settings.json"];

export interface DraftRef {
  runId: string;
  attempt: number;
  sceneId: string;
  parentVersionId?: string;
}
export interface Draft extends DraftRef {
  /** Корень хранилища (MS_DATA_DIR): нужен публикации для safeMkdir и rename. */
  root: string;
  dir: string;
}
export type PublishMeta = Omit<VersionManifest, "files" | "version_id" | "number" | "created_at">;

function checkId(kind: string, id: string): void {
  if (!SAFE_ID.test(id)) throw new Error(`scenes: ${kind} не годится для имени файла: ${JSON.stringify(id)}`);
}
const sceneRel = (sceneId: string) => `workspace/projects/${PROJECT}/scenes/${sceneId}`;

/** Относительные пути всех обычных файлов каталога (POSIX), симлинки и прочее — ошибка. */
async function listFiles(dir: string, sub = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(join(dir, sub), { withFileTypes: true })) {
    const rel = sub ? posix.join(sub, e.name) : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(dir, rel)));
    else if (e.isFile()) out.push(rel);
    else throw new Error(`scenes: недопустимый тип файла (симлинк/спецфайл): ${rel}`);
  }
  return out;
}

async function setWritable(path: string): Promise<void> {
  const st = await lstat(path);
  if (st.isDirectory()) {
    await chmod(path, 0o755);
    for (const n of await readdir(path)) await setWritable(join(path, n));
  } else if (st.isFile()) {
    await chmod(path, 0o644);
  }
}

/** `chmod -R a-w`: сначала содержимое, затем каталог (иначе в закрытый каталог не зайти). */
async function lockTree(path: string): Promise<void> {
  const st = await lstat(path);
  if (st.isDirectory()) for (const n of await readdir(path)) await lockTree(join(path, n));
  await chmod(path, st.mode & 0o555);
}

async function fsyncWrite(path: string, data: string): Promise<void> {
  const fh = await open(path, "w");
  try {
    await fh.writeFile(data);
    await fh.sync();
  } finally {
    await fh.close();
  }
}

async function fsyncDir(dir: string): Promise<void> {
  const fh = await open(dir, constants.O_RDONLY);
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
}

async function copyTree(root: string, from: string, toRel: string): Promise<void> {
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
  checkId("runId", ref.runId);
  checkId("sceneId", ref.sceneId);
  if (!Number.isInteger(ref.attempt) || ref.attempt < 1) throw new Error(`scenes: attempt должен быть целым >= 1: ${ref.attempt}`);
  if (ref.parentVersionId !== undefined) checkId("parentVersionId", ref.parentVersionId);

  let parentDir: string | undefined;
  if (ref.parentVersionId) {
    parentDir = join(root, sceneRel(ref.sceneId), "versions", ref.parentVersionId);
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
  return { ...ref, root, dir };
}

export async function writeBrief(
  root: string,
  sceneId: string,
  brief: { prompt: string; settings: Settings; created_at: string },
): Promise<void> {
  checkId("sceneId", sceneId);
  const dir = await safeMkdir(root, sceneRel(sceneId));
  const tmp = join(dir, "brief.json.tmp");
  await fsyncWrite(tmp, JSON.stringify(brief, null, 2) + "\n");
  await rename(tmp, join(dir, "brief.json"));
}

/** Помечает draft карантином: публикация запрещена, каталог не трогать до решения человека. */
export async function quarantineDraft(draft: Draft, reason: string): Promise<void> {
  await fsyncWrite(join(draft.dir, QUARANTINE), JSON.stringify({ reason, at: new Date().toISOString() }, null, 2) + "\n");
}

function requireStorage(status: StorageStatus): void {
  if (!status.ok) throw new Error(`storage_unavailable: ${status.reason}: ${status.detail}`);
}

/**
 * Публикация. Порядок важен для устойчивости к сбоям:
 * 1) guard; 2) sha256 файлов; 3) manifest.json в draft + fsync; 4) guard ещё раз;
 * 5) атомарный rename draft -> versions/<ver>; 6) chmod -R a-w.
 * Сбой до 5 оставляет draft (manifest.json в нём перезапишется при повторе); после 5
 * версия уже целая, незакрытая chmod — безопасна, `readVersion` проверяет хеши.
 */
export async function publishVersion(
  draft: Draft,
  meta: PublishMeta,
  guard: () => Promise<StorageStatus>,
): Promise<{ versionId: string; dir: string; manifest: VersionManifest }> {
  if (meta.scene_id !== draft.sceneId) throw new Error(`scenes: scene_id манифеста (${meta.scene_id}) не совпадает с draft (${draft.sceneId})`);
  if (existsSync(join(draft.dir, QUARANTINE))) throw new Error(`scenes: draft в карантине (quarantined), публикация запрещена: ${draft.dir}`);
  requireStorage(await guard());

  const versionsRel = `${sceneRel(draft.sceneId)}/versions`;
  const versionsDir = join(draft.root, versionsRel);
  const number = existsSync(versionsDir) ? (await readdir(versionsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).length + 1 : 1;
  const versionId = newId("ver");

  const paths = (await listFiles(draft.dir)).filter((p) => p !== MANIFEST).sort();
  const files = [];
  for (const path of paths) files.push({ path, sha256: await sha256File(join(draft.dir, path)) });
  const manifest = VersionManifestSchema.parse({
    ...meta,
    version_id: versionId,
    number,
    created_at: new Date().toISOString(),
    files,
  });

  await rm(join(draft.dir, MANIFEST), { force: true });
  await fsyncWrite(join(draft.dir, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  await fsyncDir(draft.dir);

  // Перепроверка прямо перед rename: между первой проверкой и ним шли хеширование и запись.
  try {
    requireStorage(await guard());
  } catch (e) {
    await rm(join(draft.dir, MANIFEST), { force: true }).catch(() => undefined);
    throw e;
  }
  const vDir = await safeMkdir(draft.root, versionsRel);
  const target = join(vDir, versionId);
  await rename(draft.dir, target);
  await fsyncDir(vDir).catch(() => undefined);
  await lockTree(target);
  return { versionId, dir: target, manifest };
}

/** Читает версию и сверяет её с manifest: схема, sha256 каждого файла, ни лишних, ни пропавших. */
export async function readVersion(dir: string): Promise<VersionManifest> {
  let text: string;
  try {
    text = await readFile(join(dir, MANIFEST), "utf8");
  } catch {
    throw new Error(`scenes: нет ${MANIFEST} — версия не опубликована или повреждена: ${dir}`);
  }
  const manifest = VersionManifestSchema.parse(JSON.parse(text));
  const actual = new Set((await listFiles(dir)).filter((p) => p !== MANIFEST));
  const declared = new Set(manifest.files.map((f) => f.path));
  if (declared.size !== manifest.files.length) throw new Error(`scenes: дубли путей в manifest: ${dir}`);
  for (const p of actual) if (!declared.has(p)) throw new Error(`scenes: лишний файл вне manifest: ${p}`);
  for (const f of manifest.files) {
    if (!actual.has(f.path)) throw new Error(`scenes: файл из manifest отсутствует: ${f.path}`);
    if ((await sha256File(join(dir, f.path))) !== f.sha256) throw new Error(`scenes: sha256 не совпадает: ${f.path}`);
  }
  return manifest;
}

