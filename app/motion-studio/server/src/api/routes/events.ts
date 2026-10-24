// `GET /api/events?since=<id>` — SSE журнала задач (см. `../sse.ts`).
import { z } from "zod";
import type { ApiContext, ZApp } from "../context.js";
import type { sseStreams } from "../sse.js";

export function eventRoutes(app: ZApp, _ctx: ApiContext, sse: ReturnType<typeof sseStreams>): void {
  app.get("/api/events", { exposeHeadRoute: false, schema: { querystring: z.object({ since: z.coerce.number().int().min(0).optional() }).strict() } }, sse.handler);
}
