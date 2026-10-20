// doctor: проверка хранилища MS_DATA_DIR; `--init` создаёт его, `--adopt` привязывает
// к новому тому после переноса. Печатает StorageStatus в JSON; код 1 при ok: false.
import { pathToFileURL } from "node:url";
import {
  checkStorage,
  initStore,
  macosProbe,
  StorageError,
  type StorageEnv,
  type StorageStatus,
  type VolumeProbe,
} from "@ms/core";

const USAGE = "usage: doctor [--init | --adopt]";

export async function runDoctor(
  argv: string[],
  env: StorageEnv,
  probe: VolumeProbe,
): Promise<{ code: number; output: string }> {
  const [mode, ...rest] = argv;
  if (rest.length > 0 || (mode !== undefined && mode !== "--init" && mode !== "--adopt")) {
    return { code: 2, output: USAGE };
  }

  if (mode) {
    const root = env.MS_DATA_DIR?.trim();
    if (!root) {
      return report({ ok: false, reason: "env_missing", detail: "MS_DATA_DIR не задан" });
    }
    try {
      await initStore(root, probe, {
        adopt: mode === "--adopt",
        allowSystemDisk: env.MS_ALLOW_SYSTEM_DISK === "1",
      });
    } catch (e) {
      if (e instanceof StorageError) {
        return report({ ok: false, reason: e.reason, detail: e.detail });
      }
      return { code: 1, output: String((e as Error).message) };
    }
  }
  return report(await checkStorage(env, probe));
}

function report(status: StorageStatus): { code: number; output: string } {
  return { code: status.ok ? 0 : 1, output: JSON.stringify(status, null, 2) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { code, output } = await runDoctor(process.argv.slice(2), process.env, macosProbe);
  (code === 0 ? console.log : console.error)(output);
  process.exitCode = code;
}
