// Защита локального сервера от чужих веб-страниц (`03` §6, ADR 0005): это не авторизация, а
// защита от DNS rebinding (Host), CSRF (Origin на мутациях) и чтения API чужой страницей
// (чужой Origin и на GET, Sec-Fetch-Site на `/api`). Хранилище недоступно — 503 на
// API, кроме `GET /api/health` (UI с диска приложения грузится и показывает баннер).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Core } from "../boot.js";

const SAFE_METHODS = new Set(["GET", "HEAD"]);

export function allowedHosts(port: number): Set<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

export function allowedOrigins(port: number): Set<string> {
  return new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
}

const deny = (reply: FastifyReply, status: number, error: string, message: string) => reply.status(status).send({ error, message });

/** Хук `onRequest`: Host → Origin (мутации) → режим хранилища. Срабатывает до разбора тела. */
export function installSecurity(app: FastifyInstance, core: Core, port: number): void {
  const hosts = allowedHosts(port);
  const origins = allowedOrigins(port);
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const host = req.headers.host?.toLowerCase();
    if (!host || !hosts.has(host)) return deny(reply, 403, "forbidden_host", `Host не разрешён: ${host ?? "—"}`);
    // Origin: на мутациях обязателен и из allowlist; на GET/HEAD, если прислан, — тоже из allowlist
    // (`fetch`/`EventSource` чужой страницы его шлют, навигация и `<video>` — нет; F10)
    const origin = req.headers.origin;
    if (origin !== undefined ? !origins.has(origin) : !SAFE_METHODS.has(req.method)) {
      return deny(reply, 403, "forbidden_origin", `Origin не разрешён: ${origin ?? "нет заголовка"}`);
    }
    // путь — в декодированном виде, как его сопоставляет роутер: `/%61pi/…` — тоже API (R1)
    let path: string;
    try {
      path = decodeURIComponent(req.url.split("?")[0]!);
    } catch {
      return deny(reply, 400, "bad_path", "некорректная кодировка пути");
    }
    const api = path === "/api" || path.startsWith("/api/");
    // API — только со своей страницы или прямым запросом: `<video src>`/`<img>` чужого сайта
    // (в том числе с другого порта localhost — тот же «site») приходят с cross-site/same-site
    const site = req.headers["sec-fetch-site"];
    if (api && site !== undefined && site !== "same-origin" && site !== "none") {
      return deny(reply, 403, "forbidden_fetch_site", `запрос к API с чужой страницы (Sec-Fetch-Site: ${String(site)})`);
    }
    const health = SAFE_METHODS.has(req.method) && path === "/api/health";
    if (api && !health && core.storage.mode() === "storage_offline") {
      // причина может содержать путь — в ответ только код, подробности в журнал (R2)
      req.log.warn({ reason: core.storage.reason() }, "storage_offline");
      return deny(reply, 503, "storage_offline", "хранилище недоступно: подключите SSD");
    }
    return undefined;
  });
}
