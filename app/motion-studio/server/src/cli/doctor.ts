// doctor: проверка хранилища MS_DATA_DIR; `--init` создаёт его, `--adopt` привязывает
// к новому тому после переноса. Затем — Chrome Headless Shell для рендера (скачивается
// при отсутствии). Печатает StorageStatus в JSON с полем `browser`; код 1, если не в
// порядке хранилище (ok: false) или браузер (browser.ok: false).
// `--import-slice` (Q2): под owner lock открывает studio.db (миграции, сверка store_id),
// закрывает незакрытые версии и регистрирует каталоги версий без строки в БД; код 1,
// если какие-то версии пропущены (повреждены).
import { pathToFileURL } from "node:url";
import {
  acquireOwnerLock,
  checkStorage,
  initStore,
  macosProbe,
  StorageError,
  type StorageEnv,
  type StorageStatus,
  type VolumeProbe,
} from "@ms/core";
import { ensureRenderBrowser } from "@ms/render";
import { bindStoreId } from "../db/meta.js";
import { migrate } from "../db/migrate.js";
import { openDb } from "../db/open.js";
import { importSliceVersions } from "../scenes/import-slice.js";
import { SceneRepo } from "../scenes/repo.js";
import { relockVersions } from "../scenes/store.js";

const USAGE = "usage: doctor [--init | --adopt | --import-slice]";

export type BrowserCheck = () => Promise<{ path: string }>;
type BrowserStatus = { ok: true; path: string } | { ok: false; error: string };

export async function runDoctor(
  argv: string[],
  env: StorageEnv,
  probe: VolumeProbe,
  browser: BrowserCheck = ensureRenderBrowser,
): Promise<{ code: number; output: string }> {
  const [mode, ...rest] = argv;
  if (rest.length > 0 || (mode !== undefined && mode !== "--init" && mode !== "--adopt" && mode !== "--import-slice")) {
    return { code: 2, output: USAGE };
  }
  if (mode === "--import-slice") return importSlice(env, probe);

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

async function importSlice(env: StorageEnv, probe: VolumeProbe): Promise<{ code: number; output: string }> {
  const status = await checkStorage(env, probe);
  if (!status.ok) return report(status);
  const { root } = status;
  let lock;
  try {
    lock = await acquireOwnerLock(root, "cli");
  } catch (e) {
    return { code: 1, output: JSON.stringify({ ok: false, error: (e as Error).message }, null, 2) };
  }
  try {
    const db = openDb(root);
    try {
      migrate(db);
      bindStoreId(db, status.marker);
      const relock = await relockVersions(root);
      const repo = new SceneRepo({ root, db, guard: () => checkStorage(env, probe) });
      const imported = await importSliceVersions(repo, root);
      const ok = imported.skipped.length === 0 && relock.broken.length === 0;
      return { code: ok ? 0 : 1, output: JSON.stringify({ ok, root, relock, import: imported }, null, 2) };
    } finally {
      db.close();
    }
  } catch (e) {
    return { code: 1, output: JSON.stringify({ ok: false, error: (e as Error).message }, null, 2) };
  } finally {
    await lock.release();
  }
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
