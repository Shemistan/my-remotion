// Chrome Headless Shell для рендера. Скачивается один раз (doctor) в
// `app/motion-studio/node_modules/.remotion/`; рендер сам в сеть не ходит.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { ensureBrowser } from "@remotion/renderer";
import { APP_ROOT } from "./entry.js";

// Remotion выбирает каталог загрузки по ближайшему к process.cwd() package.json —
// на время вызова переходим в корень workspaces, чтобы браузер всегда жил в одном месте.
function inAppRoot<T>(fn: () => T): T;
function inAppRoot<T>(fn: () => Promise<T>): Promise<T>;
function inAppRoot<T>(fn: () => T | Promise<T>): T | Promise<T> {
  const prev = process.cwd();
  process.chdir(APP_ROOT);
  let r: T | Promise<T>;
  try {
    r = fn();
  } catch (e) {
    process.chdir(prev);
    throw e;
  }
  if (r instanceof Promise) return r.finally(() => process.chdir(prev));
  process.chdir(prev);
  return r;
}

/** Гарантирует Chrome Headless Shell (скачивает при отсутствии) и возвращает путь к нему. */
export async function ensureRenderBrowser(): Promise<{ path: string }> {
  const status = await inAppRoot(() => ensureBrowser({ chromeMode: "headless-shell", logLevel: "error" }));
  if (status.type !== "local-puppeteer-browser" && status.type !== "user-defined-path") {
    throw new Error(`render: Chrome Headless Shell не установлен (${status.type})`);
  }
  return { path: status.path };
}

interface BrowserFetcher {
  getRevisionInfo(mode: "headless-shell"): { executablePath: string; local: boolean };
  readVersionFile(mode: "headless-shell"): string | null;
  getExpectedVersion(o: { version: null; chromeMode: "headless-shell"; platform: string }): string;
  getPlatform(): string;
}

/**
 * Путь к уже скачанному Chrome Headless Shell без сетевых запросов; нет браузера или
 * не та версия — Error с подсказкой запустить doctor.
 *
 * Публичный `ensureBrowser` при отсутствии браузера сразу качает, а отказ из
 * `onBrowserDownload` навсегда отравляет его внутреннюю очередь в этом процессе. Поэтому
 * проверка повторяет его `getBrowserStatus` на внутреннем `BrowserFetcher` — это
 * допустимо, пока Remotion закреплён точно (4.0.537, ADR 0004).
 */
export function findRenderBrowser(): string {
  const require = createRequire(import.meta.url);
  const fetcher = require(join(dirname(require.resolve("@remotion/renderer")), "browser", "BrowserFetcher.js")) as BrowserFetcher;
  return inAppRoot(() => {
    const info = fetcher.getRevisionInfo("headless-shell");
    if (!info.local || !existsSync(info.executablePath)) {
      throw new Error("render: Chrome Headless Shell не скачан — запусти `npm run doctor`");
    }
    const actual = fetcher.readVersionFile("headless-shell");
    const expected = fetcher.getExpectedVersion({ version: null, chromeMode: "headless-shell", platform: fetcher.getPlatform() });
    if (actual !== expected) {
      throw new Error(`render: Chrome Headless Shell ${actual ?? "?"} вместо ${expected} — запусти \`npm run doctor\``);
    }
    return info.executablePath;
  });
}
