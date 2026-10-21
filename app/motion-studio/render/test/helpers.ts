import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Settings, SettingsSchema } from "@ms/contracts";
import { type VolumeProbe, initStore } from "@ms/core";

// tmp/ репозитория (в .gitignore): тесты пишут только сюда.
export const REPO_TMP = fileURLToPath(new URL("../../../../tmp/", import.meta.url));
export const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

export async function makeTmp(): Promise<string> {
  await mkdir(REPO_TMP, { recursive: true });
  return mkdtemp(join(REPO_TMP, "ms-render-test-"));
}

export const removeTmp = (dir: string) => rm(dir, { recursive: true, force: true });

/** Внешний том (dev 2) при системном dev 1 — как в тестах core. */
export const fakeProbe: VolumeProbe = {
  volumeUuid: async () => "VOL-A",
  deviceId: async () => 2,
  systemDeviceId: async () => 1,
  freeBytes: async () => 100 * 1024 ** 3,
};

/** Хранилище с маркером в `<tmp>/store`: нужно реестру процессов и safeMkdir. */
export async function makeStore(tmp: string): Promise<string> {
  const root = join(tmp, "store");
  await initStore(root, fakeProbe, {});
  return root;
}

/** Копия фикстуры в tmp — версия, в которую рендер пишет frames/ и preview.mp4. */
export async function copyFixture(name: string, dest: string): Promise<string> {
  await cp(join(FIXTURES, name), dest, { recursive: true });
  return dest;
}

export async function fixtureSettings(name: string): Promise<Settings> {
  return SettingsSchema.parse(JSON.parse(await readFile(join(FIXTURES, name, "settings.json"), "utf8")));
}
