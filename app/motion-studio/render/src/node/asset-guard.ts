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
// внутренности, поэтому установка требует ровно ту версию Remotion, под которую написана
// (PINNED_RENDERER, ADR 0004), и проверяет, что подмена встала; юнит-тест
// asset-guard.test.ts гоняет настоящих вызывающих. `onDownload` — второй рубеж.
//
// Редиректы: read-file.js Remotion сам следует до 10 редиректов и новый адрес через
// downloadAsset повторно НЕ проходит. Проверяется только исходный src — а он может быть
// лишь сервером бандла, у serve-handler которого в 4.0.537 редиректов нет. Это держится
// на пине версии выше.
//
// Только node:* — модуль исполняется в worker стиранием типов Node, без загрузчика.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** Версия @remotion/renderer, внутренности которой подменяет installAssetGuard. */
export const PINNED_RENDERER = "4.0.537";

export interface AssetPolicy {
  /** Порт сервера бандла Remotion (MS_BUNDLE_PORT): http://localhost|127.0.0.1:<порт>. */
  bundlePort: number;
  /**
   * Точка расширения Phase 4/5 — пока НЕ реализована, installAssetGuard её отвергает.
   *
   * Финальная склейка (композиция пакета рендера — доверенный код, не сцена агента)
   * получает id медиа через провалидированные inputProps. Worker поднимает свой
   * loopback-медиасервер, который отдаёт только явный allowlist `{token → realpath}`,
   * собранный оркестратором из EDL: без листинга каталогов и без редиректов. Его origin
   * передаётся сюда (`origin`, `tokens` — разрешённые пути `/<token>`) и в allowlist
   * chrome-wrapper.sh. Сцены агента по-прежнему получают медиа только через import.
   * Файловых путей и file:// политика не пропускает: Remotion их всё равно не качает,
   * а доступ к MS_DATA_DIR целиком был бы шире нужного.
   */
  media?: { origin: string; tokens: ReadonlySet<string> };
}

/** Метка в тексте ошибки: по ней тесты и логи отличают блокировку от прочих сбоев. */
export const ASSET_BLOCKED = "ассет заблокирован";

const BUNDLE_HOSTS = new Set(["localhost", "127.0.0.1"]);
/**
 * compressAsset Remotion: `same-as-<id ассета>-<кадр>` — повтор уже проверенного src.
 * id вида `audio-0.4821…-0-0-60` (random() Remotion даёт дробь), поэтому точка
 * допустима; `/` — нет: Remotion вернул бы строку как путь к файлу.
 */
const SAME_AS = /^same-as-[\w.-]+-\d+$/;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Причина отказа (по-русски) или `null`, если `src` можно скачать. Разрешены только
 * файлы сервера бандла (кроме вложенного `/proxy`), `data:` и ссылка Remotion
 * `same-as-…` на уже проверенный src.
 */
export function assetBlockReason(src: string, policy: AssetPolicy): string | null {
  if (SAME_AS.test(src) || src.startsWith("data:")) return null;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return "не URL";
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
      "импорт из src/ (import clip from './clip.mp4'); сетевые адреса, пути на диске и /proxy запрещены.",
  );
}

/** `onDownload` для renderStill/renderMedia: бросает до загрузки запрещённого src. */
export function blockingOnDownload(policy: AssetPolicy, onBlocked?: (message: string) => void): (src: string) => undefined {
  return (src) => {
    const why = assetBlockReason(src, policy);
    if (why === null) return undefined;
    const err = blockedError(src, why);
    onBlocked?.(err.message);
    throw err;
  };
}

/** Бросает, если версия @remotion/renderer не та, под которую написана подмена. */
export function assertPinnedRenderer(version: unknown): void {
  if (version !== PINNED_RENDERER) {
    throw new Error(
      `render: @remotion/renderer ${String(version)} вместо ${PINNED_RENDERER} — защита /proxy (asset-guard.ts) ` +
        "подменяет внутренности Remotion и написана под точную версию; перепроверь её и обнови PINNED_RENDERER",
    );
  }
}

type DownloadAsset = (o: { src: string }) => Promise<string>;

/**
 * Ставит проверку `policy` перед `downloadAsset` CJS-сборки @remotion/renderer этого
 * процесса; возвращает снятие. `onBlocked` получает текст каждого отказа — worker пишет
 * его в лог рендера: браузер видит только 500 от /proxy без причины. Действует только на CJS-сборку (`require`): ESM-сборка
 * Remotion — один файл с локальными функциями, её не подменить, поэтому worker берёт
 * рендерер через `require`.
 */
export function installAssetGuard(policy: AssetPolicy, onBlocked?: (message: string) => void): () => void {
  if (policy.media !== undefined) throw new Error("render: AssetPolicy.media ещё не реализован (Phase 4/5)");
  const require = createRequire(import.meta.url);
  assertPinnedRenderer((require("@remotion/renderer/package.json") as { version?: unknown }).version);
  const index = require.resolve("@remotion/renderer");
  require(index);
  const path = join(dirname(index), "assets", "download-and-map-assets-to-file.js");
  const mod = require(path) as { downloadAsset?: unknown };
  const original = mod.downloadAsset;
  if (typeof original !== "function") throw new Error(`render: в ${path} нет downloadAsset — Remotion изменился, защита /proxy не встала`);
  const guarded: DownloadAsset = (o) => {
    const why = assetBlockReason(o.src, policy);
    if (why === null) return (original as DownloadAsset)(o);
    const err = blockedError(o.src, why);
    onBlocked?.(err.message);
    return Promise.reject(err);
  };
  mod.downloadAsset = guarded;
  if (mod.downloadAsset !== guarded) throw new Error(`render: downloadAsset в ${path} не подменяется — защита /proxy не встала`);
  return () => {
    if (mod.downloadAsset === guarded) mod.downloadAsset = original;
  };
}
