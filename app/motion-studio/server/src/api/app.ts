// Control API (Task 20, P1-15): Fastify + `fastify-type-provider-zod` — тела, параметры и ответы
// проверяются схемами `@ms/contracts`. Порядок: безопасность (Host, Origin, storage_offline) →
// маршруты `/api` → UI (`web/dist` или Vite в `--dev`). Слушать — только `127.0.0.1` (main.ts).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyServerOptions } from "fastify";
import { type ZodTypeProvider, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type { Core } from "../boot.js";
import type { ApiContext, ZApp } from "./context.js";
import { installViteDev } from "./dev-vite.js";
import { installErrorHandler } from "./errors.js";
import { chatRoutes } from "./routes/chat.js";
import { eventRoutes } from "./routes/events.js";
import { exportRoutes } from "./routes/exports.js";
import { type HealthProbes, healthRoutes } from "./routes/health.js";
import { jobRoutes } from "./routes/jobs.js";
import { kbRoutes } from "./routes/kb.js";
import { projectRoutes } from "./routes/projects.js";
import { sceneRoutes } from "./routes/scenes.js";
import { settingsRoutes } from "./routes/settings.js";
import { versionRoutes } from "./routes/versions.js";
import { installSecurity } from "./security.js";
import { SSE_HEARTBEAT_MS, sseStreams } from "./sse.js";

export const PORT = 8790;
/** Пакет UI (Task 21): `web/`, сборка — `web/dist`. */
export const WEB_ROOT = fileURLToPath(new URL("../../../web/", import.meta.url));

export interface BuildAppOptions {
  port: number;
  /** Статика UI; по умолчанию `web/dist`, если собрана. */
  webDist?: string;
  /** Vite middleware вместо статики (Q7). */
  dev?: boolean;
  logger?: FastifyServerOptions["logger"];
  sseHeartbeatMs?: number;
  /** Подмена проверок инструментов `GET /health` (тесты). */
  health?: HealthProbes;
}

export async function buildApp(core: Core, opts: BuildAppOptions = { port: PORT }): Promise<ZApp> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1024 * 1024, return503OnClosing: true }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  installErrorHandler(app);
  installSecurity(app, core, opts.port);

  const ctx: ApiContext = { core, port: opts.port };
  const sse = sseStreams(core, opts.sseHeartbeatMs ?? SSE_HEARTBEAT_MS);
  app.addHook("preClose", async () => sse.closeAll());

  healthRoutes(app, ctx, opts.health);
  projectRoutes(app, ctx);
  sceneRoutes(app, ctx);
  chatRoutes(app, ctx);
  versionRoutes(app, ctx);
  exportRoutes(app, ctx);
  jobRoutes(app, ctx);
  kbRoutes(app, ctx);
  settingsRoutes(app, ctx);
  eventRoutes(app, ctx, sse);

  if (opts.dev) {
    await installViteDev(app, WEB_ROOT);
  } else {
    const dist = opts.webDist ?? join(WEB_ROOT, "dist");
    if (existsSync(join(dist, "index.html"))) {
      await app.register(fastifyStatic, { root: dist, prefix: "/", wildcard: false, index: ["index.html"] });
      // клиентский роутер SPA: неизвестный не-API GET — index.html
      app.setNotFoundHandler((req, reply) => {
        const path = req.url.split("?")[0]!;
        if (req.method === "GET" && !path.startsWith("/api/") && path !== "/api") return reply.sendFile("index.html");
        return reply.status(404).send({ error: "not_found", message: `нет маршрута ${req.method} ${req.url}` });
      });
    }
  }
  return app;
}
