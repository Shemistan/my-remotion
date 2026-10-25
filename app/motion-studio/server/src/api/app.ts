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
import { DEFAULT_PORT } from "../config.js";
import type { ApiContext, ZApp } from "./context.js";
import { installViteDev } from "./dev-vite.js";
import { installErrorHandler } from "./errors.js";
import { approvalRoutes } from "./routes/approvals.js";
import { chatRoutes } from "./routes/chat.js";
import { edlRoutes } from "./routes/edls.js";
import { eventRoutes } from "./routes/events.js";
import { exportRoutes } from "./routes/exports.js";
import { footageRoutes } from "./routes/footage.js";
import { type HealthProbes, healthRoutes } from "./routes/health.js";
import { jobRoutes } from "./routes/jobs.js";
import { kbRoutes } from "./routes/kb.js";
import { mediaRoutes } from "./routes/media.js";
import { planRoutes } from "./routes/plans.js";
import { projectStyleRoutes } from "./routes/project-style.js";
import { projectRoutes } from "./routes/projects.js";
import { sceneRoutes } from "./routes/scenes.js";
import { scriptBatchRoutes } from "./routes/script-batch.js";
import { scriptTextRoutes } from "./routes/script-text.js";
import { semanticRoutes } from "./routes/semantic.js";
import { settingsRoutes } from "./routes/settings.js";
import { transcriptRoutes } from "./routes/transcripts.js";
import { versionRoutes } from "./routes/versions.js";
import { videoProjectRoutes } from "./routes/video-projects.js";
import { installSecurity } from "./security.js";
import { SSE_HEARTBEAT_MS, sseStreams } from "./sse.js";

/** Порт по умолчанию (`config.json` → `server.port` меняет его, S17b). */
export const PORT = DEFAULT_PORT;
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
  // UI: Vite в `--dev`, иначе собранный `web/dist` (если есть index.html) с SPA-fallback
  const dist = opts.webDist ?? join(WEB_ROOT, "dist");
  const serveDist = !opts.dev && existsSync(join(dist, "index.html"));
  installErrorHandler(app, { spaIndex: serveDist, root: core.root });
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
  // видеопроект (Task 29)
  videoProjectRoutes(app, ctx);
  mediaRoutes(app, ctx);
  transcriptRoutes(app, ctx);
  edlRoutes(app, ctx);
  approvalRoutes(app, ctx);
  // анализ и визуальный план (Task 33)
  footageRoutes(app, ctx);
  semanticRoutes(app, ctx);
  planRoutes(app, ctx);
  projectStyleRoutes(app, ctx);
  // сценарный проект
  scriptTextRoutes(app, ctx);
  scriptBatchRoutes(app, ctx);
  eventRoutes(app, ctx, sse);

  if (opts.dev) await installViteDev(app, WEB_ROOT, opts.port);
  else if (serveDist) await app.register(fastifyStatic, { root: dist, prefix: "/", wildcard: false, index: ["index.html"] });
  return app;
}
