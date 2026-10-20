import { constants, existsSync } from "node:fs";
import { chmod, copyFile, lstat, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join, posix } from "node:path";
import { VersionManifestSchema, type Settings, type VersionManifest } from "@ms/contracts";
import { SAFE_ID, safeMkdir, type StorageStatus } from "@ms/core";
import { sha256File } from "./hash.js";
import { newId } from "./ids.js";

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

async function setWritable(path: string): Promise<void> {
  const st = await lstat(path);
  if (st.isDirectory()) {
    await chmod(path, 0o755);
    for (const n of await readdir(path)) await setWritable(join(path, n));
  } else if (st.isFile()) {
    await chmod(path, 0o644);
  }
}

/** `chmod -R a-w` для содержимого (без корня): глубина первой; симлинки и спецфайлы — ошибка. */
async function lockChildren(dir: string): Promise<void> {
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

async function lockRoot(dir: string): Promise<void> {
  const st = await lstat(dir);
  if (!st.isDirectory()) throw new Error(`scenes: не каталог: ${dir}`);
  await chmod(dir, st.mode & 0o555);
}

/** Первый путь внутри версии (включая корень) с правом записи, если есть. */
async function writablePath(dir: string): Promise<string | undefined> {
  const { files, dirs } = await walk(dir);
  for (const rel of [".", ...dirs, ...files]) {
    if ((await lstat(join(dir, rel))).mode & 0o222) return rel;
  }
  return undefined;
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
 * 1) guard; 2) sha256 + fsync каждого файла; 3) manifest.json + fsync, fsync каталогов;
 * 4) guard и карантин ещё раз; 5) содержимое draft -> read-only (глубина первой);
 * 6) атомарный rename draft -> versions/<ver>; 7) chmod корня.
 * Сбой до 6 оставляет draft; после 6 версия целая, а незакрытый корень (сбой до 7)
 * `readVersion` отвергает, `relockVersions` закрывает его при старте.
 */
export async function publishVersion(
  draft: Draft,
  meta: PublishMeta,
  guard: () => Promise<StorageStatus>,
): Promise<{ versionId: string; dir: string; manifest: VersionManifest; warnings: string[] }> {
  if (meta.scene_id !== draft.sceneId) throw new Error(`scenes: scene_id манифеста (${meta.scene_id}) не совпадает с draft (${draft.sceneId})`);
  if ((meta.parent_version_id ?? null) !== (draft.parentVersionId ?? null)) {
    throw new Error(`scenes: parent_version_id манифеста (${meta.parent_version_id}) не совпадает с draft (${draft.parentVersionId ?? null})`);
  }
  const quarantined = () => existsSync(join(draft.dir, QUARANTINE));
  if (quarantined()) throw new Error(`scenes: draft в карантине (quarantined), публикация запрещена: ${draft.dir}`);
  requireStorage(await guard());

  const versionsRel = `${sceneRel(draft.sceneId)}/versions`;
  const versionsDir = join(draft.root, versionsRel);
  const number = existsSync(versionsDir) ? (await readdir(versionsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).length + 1 : 1;
  const versionId = newId("ver");

  const tree = await walk(draft.dir);
  const paths = tree.files.filter((p) => p !== MANIFEST).sort();
  if (paths.includes(QUARANTINE)) throw new Error(`scenes: draft в карантине (quarantined): ${draft.dir}`);
  const files = [];
  for (const path of paths) files.push({ path, sha256: await sha256File(join(draft.dir, path), { sync: true }) });
  if (meta.preview && !files.some((f) => f.path === meta.preview!.path && f.sha256 === meta.preview!.sha256)) {
    throw new Error(`scenes: preview ${meta.preview.path} не найден в файлах draft (или sha256 не совпадает)`);
  }
  const manifest = VersionManifestSchema.parse({
    ...meta,
    version_id: versionId,
    number,
    created_at: new Date().toISOString(),
    files,
  });

  await rm(join(draft.dir, MANIFEST), { force: true });
  await fsyncWrite(join(draft.dir, MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
  for (const d of [...tree.dirs].sort((x, y) => y.length - x.length)) await fsyncDir(join(draft.dir, d));
  await fsyncDir(draft.dir);

  // Перепроверка прямо перед rename: между первой проверкой и ним шли хеширование и запись.
  try {
    requireStorage(await guard());
    if (quarantined()) throw new Error(`scenes: draft попал в карантин (quarantined) во время публикации: ${draft.dir}`);
  } catch (e) {
    await rm(join(draft.dir, MANIFEST), { force: true }).catch(() => undefined);
    throw e;
  }
  const vDir = await safeMkdir(draft.root, versionsRel);
  const target = join(vDir, versionId);
  // Содержимое закрываем до rename: каталог 0555 на этой машине не переносится в другой родитель.
  try {
    await lockChildren(draft.dir);
    await rename(draft.dir, target);
  } catch (e) {
    await setWritable(draft.dir).catch(() => undefined);
    await rm(join(draft.dir, MANIFEST), { force: true }).catch(() => undefined);
    throw e;
  }
  const warnings: string[] = [];
  await fsyncDir(vDir).catch((e: unknown) => {
    warnings.push(`fsync ${vDir} после rename не удался: ${(e as Error).message}`);
  });
  await lockRoot(target);
  return { versionId, dir: target, manifest, warnings };
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
