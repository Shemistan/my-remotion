// Chrome Headless Shell для рендера. Скачивается один раз (doctor) в
// `app/motion-studio/node_modules/.remotion/`; рендер сам в сеть не ходит.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureBrowser } from "@remotion/renderer";
import { APP_NODE_MODULES, APP_ROOT } from "./entry.js";

/** Обёртка browserExecutable: запись Chrome в реестр процессов и закрытая сеть. */
export const CHROME_WRAPPER = fileURLToPath(new URL("./chrome-wrapper.sh", import.meta.url));

/** Где Remotion держит Chrome Headless Shell, если cwd внутри `app/motion-studio`. */
const DOWNLOADS = join(APP_NODE_MODULES, ".remotion", "chrome-headless-shell");

/**
 * Гарантирует Chrome Headless Shell (скачивает при отсутствии) и возвращает путь к нему.
 *
 * Только для CLI (`doctor`) и e2e — НЕ вызывать из сервера. Remotion выбирает каталог
 * загрузки по ближайшему к `process.cwd()` package.json, поэтому на время вызова процесс
 * переходит в корень workspaces (`process.chdir` глобален для процесса). Рендер браузер
 * не качает: он берёт путь из `findRenderBrowser`, которому cwd не нужен.
 */
export async function ensureRenderBrowser(): Promise<{ path: string }> {
  const prev = process.cwd();
  process.chdir(APP_ROOT);
  let status;
  try {
    status = await ensureBrowser({ chromeMode: "headless-shell", logLevel: "error" });
  } finally {
    process.chdir(prev);
  }
  if (status.type !== "local-puppeteer-browser" && status.type !== "user-defined-path") {
    throw new Error(`render: Chrome Headless Shell не установлен (${status.type})`);
  }
  return { path: status.path };
}

interface BrowserFetcher {
  getExpectedVersion(o: { version: null; chromeMode: "headless-shell"; platform: string }): string;
  getPlatform(): string;
}

/**
 * Путь к уже скачанному Chrome Headless Shell без сети и без смены cwd; нет браузера
 * или не та версия — Error с подсказкой запустить doctor.
 *
 * Повторяет `getBrowserStatus` Remotion для каталога `DOWNLOADS`: раскладка
 * `<platform>/chrome-headless-shell-<platform>/{headless_shell|chrome-headless-shell}` и
 * файл `VERSION`; ожидаемую версию берёт из внутреннего `BrowserFetcher`. Публичный
 * `ensureBrowser` не годится: без браузера он качает, а отказ из `onBrowserDownload`
 * навсегда отравляет его внутреннюю очередь. Допустимо, пока Remotion закреплён точно
 * (4.0.537, ADR 0004).
 */
export function findRenderBrowser(): string {
  const require = createRequire(import.meta.url);
  const fetcher = require(join(dirname(require.resolve("@remotion/renderer")), "browser", "BrowserFetcher.js")) as BrowserFetcher;
  const platform = fetcher.getPlatform();
  const shell = join(DOWNLOADS, platform, `chrome-headless-shell-${platform}`);
  const patched = join(shell, "headless_shell");
  const exe = existsSync(patched) ? patched : join(shell, "chrome-headless-shell");
  if (!existsSync(exe)) throw new Error("render: Chrome Headless Shell не скачан — запусти `npm run doctor`");
  let actual: string | null = null;
  try {
    actual = readFileSync(join(DOWNLOADS, "VERSION"), "utf8").trim();
  } catch {
    // нет файла версии — считаем, что версия не та
  }
  const expected = fetcher.getExpectedVersion({ version: null, chromeMode: "headless-shell", platform });
  if (actual !== expected) {
    throw new Error(`render: Chrome Headless Shell ${actual ?? "?"} вместо ${expected} — запусти \`npm run doctor\``);
  }
  return exe;
}
