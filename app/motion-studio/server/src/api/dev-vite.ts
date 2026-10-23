// `--dev` (Q7): Vite в режиме middleware внутри Fastify — UI и API на одном порту 8790, без
// отдельного allowlist Host/Origin для dev-сервера. Хук стоит после проверки безопасности, API
// не трогает. Vite — зависимость пакета `web` (Task 21): импорт динамический.
import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";

interface ViteDevServer {
  middlewares: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void;
  close(): Promise<void>;
}

export async function installViteDev(app: FastifyInstance, webRoot: string): Promise<void> {
  if (!existsSync(webRoot)) throw new Error(`dev: каталога UI нет: ${webRoot} (пакет web — Task 21)`);
  const spec = "vite";
  let vite: { createServer(o: object): Promise<ViteDevServer> };
  try {
    vite = (await import(spec)) as typeof vite;
  } catch (e) {
    throw new Error(`dev: Vite не установлен (npm ci в app/motion-studio): ${(e as Error).message}`, { cause: e });
  }
  const server = await vite.createServer({ root: webRoot, appType: "spa", server: { middlewareMode: true, hmr: { server: app.server } } });
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
