// SSE журнала задач (`GET /api/events`): `id:` = id события, `event: job`, `data: JobEventDto`.
// Начало — `Last-Event-ID` (переподключение браузера), иначе `?since=`, иначе только живые.
// Пропуск в догоне (`EventBus` отдаёт не больше MAX_CATCHUP) — `event: gap`: клиент перечитывает
// состояние. Heartbeat — комментарий. Медленный клиент (буфер сокета переполнен) отключается:
// подписчик EventBus не должен блокировать запись событий.
import type { FastifyReply, FastifyRequest } from "fastify";
import type { JobEventDto } from "@ms/contracts";
import type { Core } from "../boot.js";
import * as jobEvents from "../db/repos/job-events.js";
import { ApiError } from "./errors.js";
import { publicEvent } from "./job-dto.js";

export const SSE_HEARTBEAT_MS = 15_000;
/** Байт в буфере сокета, после которых клиент считается зависшим. */
const MAX_BUFFERED = 4 * 1024 * 1024;

function startId(core: Core, req: FastifyRequest<{ Querystring: { since?: number } }>): number {
  const last = req.headers["last-event-id"];
  if (typeof last === "string" && last.trim() !== "") {
    const n = Number(last);
    if (!Number.isInteger(n) || n < 0) throw new ApiError(400, "bad_last_event_id", `Last-Event-ID не число: ${last}`);
    return n;
  }
  if (req.query.since !== undefined) return req.query.since;
  return jobEvents.maxId(core.db);
}

/** Обработчик SSE и закрытие всех открытых потоков (`preClose` сервера: иначе close ждёт их вечно). */
export function sseStreams(core: Core, heartbeatMs: number) {
  const open = new Set<() => void>();
  const handler = async (req: FastifyRequest<{ Querystring: { since?: number } }>, reply: FastifyReply) => {
    const since = startId(core, req);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    let closed = false;
    const write = (chunk: string) => {
      if (closed) return;
      res.write(chunk);
      if (res.writableLength > MAX_BUFFERED) close();
    };
    const send = (ev: JobEventDto) => write(`id: ${ev.id}\nevent: job\ndata: ${JSON.stringify(publicEvent(ev, core.root))}\n\n`);
    write(": connected\n\n");
    let unsubscribe: (() => void) | undefined;
    const timer = setInterval(() => write(`: hb ${Date.now()}\n\n`), heartbeatMs);
    timer.unref();
    function close() {
      if (closed) return;
      closed = true;
      open.delete(close);
      clearInterval(timer);
      unsubscribe?.();
      res.end();
    }
    res.on("close", close);
    open.add(close);
    try {
      unsubscribe = core.events.subscribe(since, send, {
        onGap: (gap) => write(`event: gap\ndata: ${JSON.stringify(gap)}\n\n`),
      });
      if (closed) unsubscribe();
    } catch (e) {
      write(`event: error\ndata: ${JSON.stringify({ error: "events_unavailable", message: (e as Error).message })}\n\n`);
      close();
    }
  };
  return {
    handler,
    closeAll() {
      for (const c of [...open]) c();
    },
  };
}
