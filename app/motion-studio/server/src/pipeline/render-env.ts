// Окружение рендера для manifest версии (05-data-model.md §4): по нему UI предупреждает
// «рендер в другом окружении», если lockfile или motion-kit изменились.
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { VersionManifest } from "@ms/contracts";
import { APP_NODE_MODULES, MOTION_KIT_DIR } from "@ms/render";

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

const optional = (p: Promise<string>) => p.then((s) => s.trim()).catch(() => "unknown");

/** remotion, sha256 lockfile приложения, хеш motion-kit, версия Chrome Headless Shell, Node. */
export async function renderEnv(): Promise<VersionManifest["render_env"]> {
  const remotion = (JSON.parse(await readFile(join(APP_NODE_MODULES, "remotion", "package.json"), "utf8")) as { version: string }).version;
  const lock = await readFile(join(APP_NODE_MODULES, "..", "package-lock.json"));
  return {
    remotion,
    render_lock_sha256: createHash("sha256").update(lock).digest("hex"),
    motion_kit: await motionKitHash(),
    chrome_headless_shell: await optional(readFile(join(APP_NODE_MODULES, ".remotion", "chrome-headless-shell", "VERSION"), "utf8")),
    node: process.versions.node,
  };
}
