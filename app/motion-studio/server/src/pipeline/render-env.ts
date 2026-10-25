// Окружение рендера для manifest версии (05-data-model.md §4): по нему UI предупреждает
// «рендер в другом окружении», если зависимости рендера или motion-kit изменились.
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { VersionManifest } from "@ms/contracts";
import { APP_NODE_MODULES, MOTION_KIT_DIR, MOTION_KIT_VERSION } from "@ms/render";

async function treeHash(dir: string): Promise<string> {
  const h = createHash("sha256");
  const walk = async (rel: string): Promise<void> => {
    const entries = (await readdir(join(dir, rel), { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else if (e.isFile()) h.update(`${r}\0`).update(await readFile(join(dir, r))).update("\0");
    }
  };
  await walk("");
  return h.digest("hex");
}

/** Хэш motion-kit, как в `render_env.motion_kit` manifest: `sha256:<16 hex>`. */
export async function motionKitHash(): Promise<string> {
  return `sha256:${(await treeHash(MOTION_KIT_DIR)).slice(0, 16)}`;
}

type LockEntry = {
  name?: string;
  version?: string;
  resolved?: string;
  integrity?: string;
  link?: boolean;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/** Корень замыкания: workspace рендера (motion-kit лежит в нём и хешируется отдельно). */
const RENDER_WORKSPACE = "@ms/render";

/**
 * `render_lock_sha256` (ruling 2026-10-23): sha256 замыкания зависимостей workspace
 * `@ms/render` по package-lock.json (v2/v3): Remotion, React, workspace-ссылки (`@ms/contracts`,
 * `@ms/core`) и всё транзитивное — `dependencies`, `optionalDependencies` и установленные
 * `peerDependencies`; devDependencies и пакеты других workspace (`web`) не входят. Пакет
 * разрешается как в Node: от `<путь>/node_modules/<имя>` вверх к корню. В хеш идут
 * `имя@версия integrity` в отсортированном виде, поэтому перестановка путей в lock его не меняет.
 */
export function renderLockSha256(lockJson: string): string {
  const packages = (JSON.parse(lockJson) as { packages?: Record<string, LockEntry> }).packages ?? {};
  const resolve = (from: string, dep: string): string | undefined => {
    let base = from;
    for (;;) {
      const p = base ? `${base}/node_modules/${dep}` : `node_modules/${dep}`;
      if (packages[p]) return p;
      if (!base) return undefined;
      const i = base.lastIndexOf("/node_modules/");
      base = i >= 0 ? base.slice(0, i) : base.startsWith("node_modules/") ? "" : base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "";
    }
  };
  const start = Object.keys(packages).find((k) => packages[k]!.name === RENDER_WORKSPACE && !k.startsWith("node_modules/"));
  const seen = new Set<string>();
  const ids = new Set<string>();
  const visit = (path: string): void => {
    let e = packages[path];
    // ссылка на workspace → сам workspace
    if (e?.link && e.resolved !== undefined) {
      path = e.resolved;
      e = packages[path];
    }
    if (!e || seen.has(path)) return;
    seen.add(path);
    const name = e.name ?? path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    ids.add(e.version !== undefined ? `${name}@${e.version} ${e.integrity ?? e.resolved ?? ""}` : `${name}@workspace`);
    for (const dep of Object.keys({ ...e.dependencies, ...e.optionalDependencies, ...e.peerDependencies })) {
      const r = resolve(path, dep);
      if (r) visit(r);
    }
  };
  if (start !== undefined) visit(start);
  return createHash("sha256").update([...ids].sort().join("\n")).digest("hex");
}

const optional = (p: Promise<string>) => p.then((s) => s.trim()).catch(() => "unknown");

/** remotion, отпечаток зависимостей рендера, хеш motion-kit, версия Chrome Headless Shell, Node. */
export async function renderEnv(): Promise<VersionManifest["render_env"]> {
  const remotion = (JSON.parse(await readFile(join(APP_NODE_MODULES, "remotion", "package.json"), "utf8")) as { version: string }).version;
  const lock = await readFile(join(APP_NODE_MODULES, "..", "package-lock.json"), "utf8");
  return {
    remotion,
    render_lock_sha256: renderLockSha256(lock),
    motion_kit: await motionKitHash(),
    chrome_headless_shell: await optional(readFile(join(APP_NODE_MODULES, ".remotion", "chrome-headless-shell", "VERSION"), "utf8")),
    node: process.versions.node,
    motion_kit_version: MOTION_KIT_VERSION,
  };
}
