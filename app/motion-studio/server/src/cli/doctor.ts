// doctor: проверка хранилища MS_DATA_DIR; `--init` создаёт его, `--adopt` привязывает
// к новому тому после переноса. Затем — Chrome Headless Shell для рендера (скачивается
// при отсутствии). Печатает StorageStatus в JSON с полем `browser`; код 1, если не в
// порядке хранилище (ok: false) или браузер (browser.ok: false).
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
import { ensureRenderBrowser } from "@ms/render";

const USAGE = "usage: doctor [--init | --adopt]";

export type BrowserCheck = () => Promise<{ path: string }>;
type BrowserStatus = { ok: true; path: string } | { ok: false; error: string };

export async function runDoctor(
  argv: string[],
  env: StorageEnv,
  probe: VolumeProbe,
  browser: BrowserCheck = ensureRenderBrowser,
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
  const status = await checkStorage(env, probe);
  return report(status, await checkBrowser(browser));
}

async function checkBrowser(browser: BrowserCheck): Promise<BrowserStatus> {
  try {
    return { ok: true, path: (await browser()).path };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function report(status: StorageStatus, browser?: BrowserStatus): { code: number; output: string } {
  const ok = status.ok && (browser?.ok ?? true);
  return { code: ok ? 0 : 1, output: JSON.stringify(browser ? { ...status, browser } : status, null, 2) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { code, output } = await runDoctor(process.argv.slice(2), process.env, macosProbe);
  (code === 0 ? console.log : console.error)(output);
  process.exitCode = code;
}
