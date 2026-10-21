import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VolumeProbe } from "../src/storage/guard.js";

export const GiB = 1024 ** 3;

// tmp/ репозитория (в .gitignore): тесты пишут только сюда.
const REPO_TMP = fileURLToPath(new URL("../../../../tmp/", import.meta.url));

export async function makeTmp(): Promise<string> {
  await mkdir(REPO_TMP, { recursive: true });
  return mkdtemp(join(REPO_TMP, "ms-core-test-"));
}

export async function removeTmp(dir: string): Promise<void> {
  // Каталоги с снятым правом записи иначе не удалятся.
  await chmod(dir, 0o755).catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
}

export type FakeVolume = {
  uuid: string;
  dev: number;
  sysDev: number;
  free: number;
};

/** Внешний том "VOL-A" (dev 2) при системном dev 1, свободно 100 ГиБ. */
export function fakeProbe(over: Partial<FakeVolume> = {}): VolumeProbe {
  const v: FakeVolume = { uuid: "VOL-A", dev: 2, sysDev: 1, free: 100 * GiB, ...over };
  return {
    volumeUuid: async () => v.uuid,
    deviceId: async () => v.dev,
    systemDeviceId: async () => v.sysDev,
    freeBytes: async () => v.free,
  };
}
