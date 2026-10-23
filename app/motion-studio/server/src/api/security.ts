// Защита локального сервера от чужих веб-страниц (`03` §6, ADR 0005): это не авторизация, а
// защита от DNS rebinding (Host) и CSRF (Origin на мутациях). Хранилище недоступно — 503 на
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
    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      if (!origin || !origins.has(origin)) return deny(reply, 403, "forbidden_origin", `Origin не разрешён: ${origin ?? "нет заголовка"}`);
    }
    const path = req.url.split("?")[0]!;
    const api = path === "/api" || path.startsWith("/api/");
    const health = SAFE_METHODS.has(req.method) && path === "/api/health";
    if (api && !health && core.storage.mode() === "storage_offline") {
      return deny(reply, 503, "storage_offline", `хранилище недоступно: ${core.storage.reason() ?? "storage_offline"}`);
    }
    return undefined;
  });
}
