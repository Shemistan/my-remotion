// Loopback-медиасервер worker таймлайна (Task 36, F9). Remotion качает `src` у `OffthreadVideo` и
// `<Audio>` из Node (offthread-video-server, downloadAndMapAssetsToFileUrl) только по http(s), а
// файлов с диска не берёт. Сервер отдаёт ровно перечисленные файлы (`{ key → путь }`, собранные
// оркестратором из таймлайна) по пути `/<token>/<key>`: токен — 32 hex случайных байт на запуск,
// без листинга, без редиректов, без query; `Range` → 206; слушает только `127.0.0.1:0` и живёт
// внутри процесса worker (та же группа: убийство группы гасит и сервер).
//
// Модуль исполняется в worker стиранием типов Node, без загрузчика: только node:* и `import type`.
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, isAbsolute } from "node:path";

export interface MediaServer {
  /** `http://127.0.0.1:<порт>`. */
  origin: string;
  /** Токен пути (32 hex). */
  token: string;
  /** URL файла по ключу; неизвестный ключ — ошибка. */
  urlFor(key: string): string;
  /** Байт тела отдано с запуска (ревью I3: сколько Remotion скачал в TMPDIR). */
  bytesSent(): number;
  close(): Promise<void>;
}

const KEY = /^[A-Za-z0-9_-]{1,64}$/;
const TYPES: Record<string, string> = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".wav": "audio/wav", ".m4a": "audio/mp4" };

interface Entry {
  path: string;
  type: string;
}

/** Диапазон `bytes=a-b` | `bytes=a-` | `bytes=-n` (один); `undefined` — заголовка нет, `null` — не выполнить. */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | undefined {
  if (header === undefined) return undefined;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const n = Number(m[2]);
    if (n === 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return null;
  return { start, end };
}

function notFound(res: ServerResponse): void {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Content-Length": "9" });
  res.end("not found");
}

/**
 * Запускает сервер файлов `files` (`ключ → абсолютный путь`; ключ `[A-Za-z0-9_-]{1,64}`, файл —
 * обычный, по realpath). Пути проверяются до запуска: ошибка — исключение.
 */
export async function serveMedia(files: Record<string, string>): Promise<MediaServer> {
  const table = new Map<string, Entry>();
  for (const [key, p] of Object.entries(files)) {
    if (!KEY.test(key)) throw new Error(`media-server: ключ не годится: ${JSON.stringify(key)}`);
    if (!isAbsolute(p)) throw new Error(`media-server: путь должен быть абсолютным: ${p}`);
    const real = await realpath(p);
    if (!(await stat(real)).isFile()) throw new Error(`media-server: не обычный файл: ${p}`);
    table.set(key, { path: real, type: TYPES[extname(real).toLowerCase()] ?? "application/octet-stream" });
  }
  const token = randomBytes(16).toString("hex");
  const route = new RegExp(`^/${token}/([A-Za-z0-9_-]{1,64})$`);
  let sent = 0;

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD", "Content-Length": "0" });
      res.end();
      return;
    }
    // путь сверяется как пришёл, без декодирования и нормализации: `..`, `%2F`, query — 404
    const m = route.exec(req.url ?? "");
    const entry = m ? table.get(m[1]!) : undefined;
    if (!entry) return notFound(res);
    let size: number;
    try {
      const st = await stat(entry.path);
      if (!st.isFile()) return notFound(res);
      size = st.size;
    } catch {
      return notFound(res);
    }
    const range = parseRange(req.headers.range, size);
    if (range === null) {
      res.writeHead(416, { "Content-Range": `bytes */${size}`, "Content-Length": "0" });
      res.end();
      return;
    }
    const { start, end } = range ?? { start: 0, end: size - 1 };    const headers: Record<string, string> = { "Content-Type": entry.type, "Accept-Ranges": "bytes", "Content-Length": String(Math.max(0, end - start + 1)), "Cache-Control": "no-store" };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === "HEAD" || size === 0) {
      res.end();
      return;
    }
    const stream = createReadStream(entry.path, { start, end });
    stream.on("data", (chunk) => {
      sent += chunk.length;
    });
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  };

  const server = createServer((req, res) => {
    handle(req, res).catch(() => res.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    token,
    urlFor(key) {
      if (!table.has(key)) throw new Error(`media-server: ключа ${JSON.stringify(key)} нет`);
      return `${origin}/${token}/${key}`;
    },
    bytesSent: () => sent,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
