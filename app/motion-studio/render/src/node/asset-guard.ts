// Что Node-сторона рендера Remotion может скачать по `src` сцены.
//
// Chrome рендера закрыт прокси (chrome-wrapper.sh), но сервер бандла Remotion отвечает
// на `/proxy?src=…` (OffthreadVideo, serve-static.js) и сам качает `src` из Node — мимо
// прокси Chrome. Тот же `downloadAsset` качает `src` у <Audio>/<Video> при сборке звука
// в renderMedia. Так сцена дотянулась бы до Control API (127.0.0.1:8790) и интернета.
//
// В Remotion 4.0.537 официальный хук — только `onDownload` у renderStill/renderMedia
// (вызывается синхронно до загрузки; исключение срывает загрузку). У selectComposition
// его нет (там зашит `() => undefined`), а исключение из `onDownload` оставляет src в
// состоянии «качается» — повторы того же src висят до таймаута delayRender. Поэтому
// основной рубеж — подмена `downloadAsset` в CJS-модуле Remotion
// (dist/assets/download-and-map-assets-to-file.js): все вызывающие (offthread-video-server,
// downloadAndMapAssetsToFileUrl) берут его как свойство модуля в момент вызова. Это
// внутренности, поэтому установка проверяет, что подмена встала, и падает, если нет;
// e2e (render.e2e.test.ts, proxy-scene) ловит смену поведения при обновлении Remotion.
// Допустимо, пока Remotion закреплён точно (4.0.537, ADR 0004). `onDownload` — второй
// рубеж там, где он есть.
//
// Только node:* — модуль исполняется в worker стиранием типов Node, без загрузчика.
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface AssetPolicy {
  /** Порт сервера бандла Remotion (MS_BUNDLE_PORT): http://localhost|127.0.0.1:<порт>. */
  bundlePort: number;
  /** Каталоги, файлы из которых можно отдавать по file:// или абсолютному пути. */
  roots: string[];
}

/** Метка в тексте ошибки: по ней тесты и логи отличают блокировку от прочих сбоев. */
export const ASSET_BLOCKED = "ассет заблокирован";

const BUNDLE_HOSTS = new Set(["localhost", "127.0.0.1"]);

function insideRoots(path: string, roots: string[]): boolean {
  const p = resolve(path);
  return roots.some((root) => {
    const r = relative(resolve(root), p);
    return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r));
  });
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Причина отказа (по-русски) или `null`, если `src` можно скачать. Разрешены: файлы
 * сервера бандла (кроме вложенного `/proxy`), `data:`, ссылка Remotion `same-as-…` на
 * уже проверенный src и локальные файлы под `roots`. Всё прочее — нет.
 */
export function assetBlockReason(src: string, policy: AssetPolicy): string | null {
  // same-as-<id>-<frame>: Remotion сжимает повтор длинного src, исходный уже проверен
  if (src.startsWith("same-as-") || src.startsWith("data:")) return null;
  if (src.startsWith("file:")) {
    let path: string;
    try {
      path = fileURLToPath(src);
    } catch {
      return "битый file: URL";
    }
    return insideRoots(path, policy.roots) ? null : "файл вне бандла и хранилища";
  }
  if (isAbsolute(src)) return insideRoots(src, policy.roots) ? null : "файл вне бандла и хранилища";
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return "не URL и не абсолютный путь";
  }
  if (url.protocol !== "http:") return `схема ${url.protocol} запрещена`;
  if (!BUNDLE_HOSTS.has(url.hostname) || url.port !== String(policy.bundlePort)) return "адрес вне сервера бандла";
  if (url.username !== "" || url.password !== "") return "учётные данные в URL";
  if (safeDecode(url.pathname).toLowerCase().startsWith("/proxy")) return "вложенный /proxy";
  return null;
}

const shown = (src: string) => (src.length > 200 ? `${src.slice(0, 200)}…` : src);

function blockedError(src: string, why: string): Error {
  return new Error(
    `render: ${ASSET_BLOCKED} (${why}): ${shown(src)}. Сцене доступны только файлы бандла — ` +
      "импорт из src/ (import clip from './clip.mp4') — и данные хранилища; сетевые адреса и /proxy запрещены.",
  );
}

/** `onDownload` для renderStill/renderMedia: бросает до загрузки запрещённого src. */
export function blockingOnDownload(policy: AssetPolicy): (src: string) => undefined {
  return (src) => {
    const why = assetBlockReason(src, policy);
    if (why !== null) throw blockedError(src, why);
    return undefined;
  };
}

type DownloadAsset = (o: { src: string }) => Promise<string>;

/**
 * Ставит проверку `policy` перед `downloadAsset` CJS-сборки @remotion/renderer этого
 * процесса; возвращает снятие. Действует только на CJS-сборку (`require`): ESM-сборка
 * Remotion — один файл с локальными функциями, её не подменить, поэтому worker берёт
 * рендерер через `require`.
 */
export function installAssetGuard(policy: AssetPolicy): () => void {
  const require = createRequire(import.meta.url);
  const index = require.resolve("@remotion/renderer");
  require(index);
  const path = join(dirname(index), "assets", "download-and-map-assets-to-file.js");
  const mod = require(path) as { downloadAsset?: unknown };
  const original = mod.downloadAsset;
  if (typeof original !== "function") throw new Error(`render: в ${path} нет downloadAsset — Remotion изменился, защита /proxy не встала`);
  const guarded: DownloadAsset = (o) => {
    const why = assetBlockReason(o.src, policy);
    return why === null ? (original as DownloadAsset)(o) : Promise.reject(blockedError(o.src, why));
  };
  mod.downloadAsset = guarded;
  if (mod.downloadAsset !== guarded) throw new Error(`render: downloadAsset в ${path} не подменяется — защита /proxy не встала`);
  return () => {
    if (mod.downloadAsset === guarded) mod.downloadAsset = original;
  };
}
