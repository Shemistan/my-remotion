// Ключ содержимого версии и точка входа бандла Remotion.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Settings } from "@ms/contracts";

/** Пакет render (`app/motion-studio/render/`). */
export const RENDER_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** Корень npm workspaces: здесь `node_modules`, откуда бандлер берёт react и remotion. */
export const APP_ROOT = join(RENDER_ROOT, "..");
export const APP_NODE_MODULES = join(APP_ROOT, "node_modules");
/** Цель алиаса `@ms/motion-kit` (каталог появится в Task 6). */
export const MOTION_KIT_DIR = join(RENDER_ROOT, "src", "motion-kit");

/**
 * Исходники, от которых зависит бандл помимо версии: шаблон entry (этот файл), опции
 * bundle() в worker.ts (webpackOverride) и правила разрешения модулей (resolve-jail.ts). Их правка меняет ключ, и кэш бандлов
 * не отдаёт сборку, сделанную по старым правилам.
 */
const TOOLCHAIN_SOURCES = [
  fileURLToPath(import.meta.url),
  fileURLToPath(new URL("./worker.ts", import.meta.url)),
  fileURLToPath(new URL("./resolve-jail.ts", import.meta.url)),
];
const REMOTION_VERSION = (
  JSON.parse(readFileSync(join(APP_NODE_MODULES, "remotion", "package.json"), "utf8")) as { version: string }
).version;

type Hash = ReturnType<typeof createHash>;

/** Файлы дерева (относительные posix-пути), отсортированные; симлинки — ошибка. */
async function listFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(join(dir, rel), { withFileTypes: true });
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) throw new Error(`render: симлинк в исходниках сцены: ${r}`);
    if (e.isDirectory()) out.push(...(await listFiles(dir, r)));
    else if (e.isFile()) out.push(r);
    else throw new Error(`render: не файл и не каталог в исходниках сцены: ${r}`);
  }
  return out;
}

async function hashTree(h: Hash, dir: string, prefix: string): Promise<void> {
  for (const rel of await listFiles(dir)) {
    const data = await readFile(join(dir, rel));
    h.update(`${prefix}/${rel}\0${data.length}\0`).update(data);
  }
}

async function hashMotionKit(h: Hash): Promise<void> {
  try {
    await hashTree(h, MOTION_KIT_DIR, "motion-kit");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

async function readRegular(path: string, what: string): Promise<Buffer> {
  let st;
  try {
    st = await lstat(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`render: нет ${what}`, { cause: e });
    throw e;
  }
  if (!st.isFile()) throw new Error(`render: ${what} — не обычный файл`);
  return readFile(path);
}

/**
 * sha256 содержимого версии: `src/**` (относительный путь + байты) и `props.json`.
 * Абсолютное расположение версии в ключ не входит — перенос draft → version ключ не
 * меняет. В ключ также входят версия Remotion, исходники шаблона entry и опций bundle()
 * (entry.ts, worker.ts) и содержимое motion-kit: бандл зависит от них, и без этого кэш
 * отдал бы устаревшую сборку.
 */
export async function contentKey(versionDir: string): Promise<string> {
  const h = createHash("sha256");
  h.update(`ms-render remotion@${REMOTION_VERSION}\0`);
  for (const f of TOOLCHAIN_SOURCES) h.update(await readFile(f)).update("\0");
  await hashMotionKit(h);
  const src = join(versionDir, "src");
  const st = await lstat(src).catch(() => undefined);
  if (!st?.isDirectory()) throw new Error("render: нет каталога src/ версии");
  await hashTree(h, src, "src");
  const props = await readRegular(join(versionDir, "props.json"), "props.json");
  h.update(`props.json\0${props.length}\0`).update(props);
  return h.digest("hex");
}

/** props.json версии: JSON-объект. */
export async function readProps(versionDir: string): Promise<Record<string, unknown>> {
  const text = (await readRegular(join(versionDir, "props.json"), "props.json")).toString("utf8");
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    throw new Error(`render: props.json — не JSON: ${(e as Error).message}`, { cause: e });
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("render: props.json должен быть JSON-объектом");
  return v as Record<string, unknown>;
}

/** mkdir одного уровня: родитель обязан существовать, существующий каталог — не ошибка. */
export async function mkdirOne(path: string): Promise<string> {
  try {
    await mkdir(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  const st = await lstat(path);
  if (!st.isDirectory()) throw new Error(`render: ${path} — не каталог`);
  return path;
}

function fpsLiteral({ num, den }: Settings["fps"]): string {
  return den === 1 ? String(num) : `${num} / ${den}`;
}

/**
 * Пишет `<cacheDir>/entries/<contentKey>/index.tsx`: `registerRoot` с одной
 * `<Composition id="Scene">`. Компонент — `Scene` (или default) из `<versionDir>/src/Scene.tsx`,
 * `defaultProps` — снимок `props.json`, размеры/fps/длительность — из настроек (рендер
 * всё равно подставляет их поверх композиции, так что кэш бандла от настроек не зависит).
 */
export async function writeEntry(versionDir: string, cacheDir: string, settings: Settings): Promise<string> {
  const key = await contentKey(versionDir);
  const props = await readProps(versionDir);
  const scene = join(versionDir, "src", "Scene.tsx");
  await readRegular(scene, "src/Scene.tsx");

  const dir = await mkdirOne(join(await mkdirOne(join(cacheDir, "entries")), key));
  const text = `// Сгенерировано @ms/render (writeEntry). Не править руками.
import type { ComponentType } from "react";
import { Composition, registerRoot } from "remotion";
import * as SceneModule from ${JSON.stringify(scene)};

const mod = SceneModule as Record<string, unknown>;
const Scene = (mod.Scene ?? mod.default) as ComponentType<Record<string, unknown>> | undefined;
if (!Scene) throw new Error("src/Scene.tsx должен экспортировать компонент Scene");
const defaultProps: Record<string, unknown> = ${JSON.stringify(props, null, 2)};

const Root = () => (
  <Composition
    id="Scene"
    component={Scene}
    width={${settings.width}}
    height={${settings.height}}
    fps={${fpsLiteral(settings.fps)}}
    durationInFrames={${settings.duration_frames}}
    defaultProps={defaultProps}
  />
);

registerRoot(Root);
`;
  const file = join(dir, "index.tsx");
  const tmp = join(dir, `.index.tsx.${process.pid}.tmp`);
  await writeFile(tmp, text);
  await rename(tmp, file);
  return file;
}
