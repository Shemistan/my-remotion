// `--dev` (Q7): Vite в режиме middleware внутри Fastify — UI и API на одном порту 8790, без
// отдельного allowlist Host/Origin для dev-сервера. Хук стоит после проверки безопасности, API
// не трогает. Vite — зависимость пакета `web` (Task 21): импорт динамический.
// WebSocket HMR идёт мимо хука `onRequest` Fastify (ревью Task 20, F4): обработчик `upgrade`
// Vite обёрнут проверкой Host и Origin (обязателен, из allowlist) — иначе 403 и сокет закрыт.
// Vite (≥ 6.0.9, CVE-2025-24010) сверх того проверяет свой токен и `allowedHosts`.
import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { FastifyInstance } from "fastify";
import { allowedHosts, allowedOrigins } from "./security.js";

interface ViteDevServer {
  middlewares: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void;
  close(): Promise<void>;
}

type UpgradeListener = (req: IncomingMessage, socket: Duplex, head: Buffer) => void;

/** Апгрейд WebSocket разрешён: Host и Origin — свои (Origin браузер шлёт всегда). */
export function upgradeAllowed(req: IncomingMessage, port: number): boolean {
  const host = req.headers.host?.toLowerCase();
  const origin = req.headers.origin;
  return Boolean(host && allowedHosts(port).has(host) && origin && allowedOrigins(port).has(origin));
}

export async function installViteDev(app: FastifyInstance, webRoot: string, port: number): Promise<void> {
  if (!existsSync(webRoot)) throw new Error(`dev: каталога UI нет: ${webRoot} (пакет web — Task 21)`);
  const spec = "vite";
  let vite: { createServer(o: object): Promise<ViteDevServer> };
  try {
    vite = (await import(spec)) as typeof vite;
  } catch (e) {
    throw new Error(`dev: Vite не установлен (npm ci в app/motion-studio): ${(e as Error).message}`, { cause: e });
  }
  const before = new Set(app.server.listeners("upgrade"));
  const server = await vite.createServer({
    root: webRoot,
    appType: "spa",
    server: {
      middlewareMode: true,
      // только свои имена (DNS rebinding); HMR — на сокете Fastify, своего порта у Vite нет
      allowedHosts: ["127.0.0.1", "localhost"],
      ws: { server: app.server },
    },
  });
  // обработчики upgrade, которые поставил Vite, — только через проверку Host/Origin
  const viteUpgrade = app.server.listeners("upgrade").filter((l) => !before.has(l)) as UpgradeListener[];
  for (const l of viteUpgrade) app.server.removeListener("upgrade", l);
  app.server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!upgradeAllowed(req, port)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      socket.destroy();
      return;
    }
    for (const l of viteUpgrade) l.call(app.server, req, socket, head);
  });

  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0]!;
    if (path === "/api" || path.startsWith("/api/")) return;
    reply.hijack();
    await new Promise<void>((resolve) => {
      server.middlewares(req.raw, reply.raw, (err) => {
        if (!reply.raw.headersSent) {
          reply.raw.statusCode = err ? 500 : 404;
          reply.raw.end();
        }
        resolve();
      });
      reply.raw.on("finish", () => resolve());
    });
  });
  app.addHook("onClose", async () => server.close());
}
