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
   * Медиасервер worker таймлайна (Task 36, F9). Композиция `ProjectTimeline` — доверенный код
   * пакета рендера, не сцена агента: master и звук монтажа она получает по URL из inputProps.
   * worker-timeline.ts поднимает loopback-медиасервер (`serveMedia`, `127.0.0.1:0`), который
   * отдаёт только явный allowlist ключей по пути `/<token>/<key>`: без листинга и редиректов.
   * Политика пропускает ровно его `origin` и пути `/<token>/<key>` с токенами из `tokens` (без
   * query, учётных данных и кодированных разделителей). Chrome медиасервер не нужен:
   * `OffthreadVideo` ходит в `/proxy` сервера бандла, а `<Audio>` при рендере качает Node, —
   * поэтому в allowlist chrome-wrapper.sh его нет. Сцены агента по-прежнему получают медиа только
   * через import. Файловых путей и file:// политика не пропускает: Remotion их всё равно не
   * качает, а доступ к MS_DATA_DIR целиком был бы шире нужного.
   */
  media?: { origin: string; tokens: ReadonlySet<string> };
}

/** Токен пути медиасервера: 32 hex (`serveMedia`). */
export const MEDIA_TOKEN = /^[0-9a-f]{32}$/;
/** Путь файла медиасервера: `/<token>/<key>`, ключ — `[A-Za-z0-9_-]{1,64}`. */
const MEDIA_PATH = /^\/([0-9a-f]{32})\/[A-Za-z0-9_-]{1,64}$/;

/** Бросает, если `media` политики — не loopback-origin `http://127.0.0.1:<порт>` с токенами 32 hex. */
export function assertMediaPolicy(media: NonNullable<AssetPolicy["media"]>): void {
  let url: URL;
  try {
    url = new URL(media.origin);
  } catch {
    throw new Error(`render: AssetPolicy.media.origin не URL: ${JSON.stringify(media.origin)}`);
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port === "") {
    throw new Error(`render: медиасервер только http://127.0.0.1:<порт>, а не ${media.origin}`);
  }
  if (url.origin !== media.origin) throw new Error(`render: AssetPolicy.media.origin — только origin без пути: ${media.origin}`);
  if (media.tokens.size === 0 || [...media.tokens].some((t) => !MEDIA_TOKEN.test(t))) {
    throw new Error("render: токен медиасервера — 32 hex, хотя бы один");
  }
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
  if (policy.media !== undefined && url.origin === policy.media.origin) {
    if (url.username !== "" || url.password !== "") return "учётные данные в URL";
    const m = MEDIA_PATH.exec(url.pathname);
    if (m === null || url.search !== "" || url.hash !== "" || !policy.media.tokens.has(m[1]!)) return "путь медиасервера вне allowlist";
    return null;
  }
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
  if (policy.media !== undefined) assertMediaPolicy(policy.media);
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
