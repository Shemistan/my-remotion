import { chmod, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { initStore, type StorageStatus, type StoreMarker, type VolumeProbe } from "@ms/core";

export const REPO_TMP = fileURLToPath(new URL("../../../../../tmp/", import.meta.url));

export const probe: VolumeProbe = {
  volumeUuid: async () => "VOL-A",
  deviceId: async () => 2,
  systemDeviceId: async () => 1,
  freeBytes: async () => 100 * 1024 ** 3,
};

export interface TestStore {
  tmp: string;
  root: string;
  marker: StoreMarker;
  guard: () => Promise<StorageStatus>;
}

/** Хранилище в `tmp/` репозитория (initStore с фейковым томом). */
export async function makeStore(prefix: string): Promise<TestStore> {
  await mkdir(REPO_TMP, { recursive: true });
  const tmp = await mkdtemp(join(REPO_TMP, prefix));
  const root = join(tmp, "store");
  const marker = await initStore(root, probe, {});
  return { tmp, root, marker, guard: async () => ({ ok: true, root, marker, freeBytes: 1 }) };
}

/** Снимает read-only с опубликованных версий, чтобы удалить каталог теста. */
export async function unlockTree(dir: string): Promise<void> {
  await chmod(dir, 0o755).catch(() => undefined);
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await unlockTree(p);
    else if (e.isFile()) await chmod(p, 0o644);
  }
}

export async function removeStore(s: TestStore): Promise<void> {
  await unlockTree(s.tmp);
  await rm(s.tmp, { recursive: true, force: true });
}
