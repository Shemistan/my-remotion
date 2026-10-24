// Ошибки Control API: тело `{ error: <код>, message, ...поля }` (`ApiErrorSchema`). Ошибки
// валидации zod → 400 `validation` с путями полей; известные ошибки ядра → свои коды.
import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import { ResourceBusyError } from "../artifacts/store.js";
import { EditError, ProposedLeftError, RevisionConflictError } from "../edit/errors.js";
import { IdempotencyKeyReusedError } from "../jobs/queue.js";
import { StaleProcessAliveError } from "../jobs/retry.js";
import { isStorageError } from "../jobs/runner.js";
import { maskDeep } from "./job-dto.js";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what: string): ApiError => new ApiError(404, "not_found", `${what} не найдено`);

/** Сообщения ядра вида `<код>: …` → статус API. */
const CORE_CODES: Record<string, number> = {
  job_not_found: 404,
  job_not_awaiting_input: 409,
  job_not_retryable: 409,
  version_broken: 410,
};

/** Ответ на ошибку: статус и тело. */
export function toApiResponse(e: unknown): { status: number; body: Record<string, unknown> } {
  if (e instanceof ApiError) return { status: e.status, body: { error: e.code, message: e.message, ...e.extra } };
  if (hasZodFastifySchemaValidationErrors(e)) {
    const issues = e.validation.map((v) => ({ path: [e.validationContext, ...v.params.issue.path].filter((x) => x !== undefined).join("."), message: v.message }));
    return { status: 400, body: { error: "validation", message: issues.map((i) => `${i.path}: ${i.message}`).join("; "), issues } };
  }
  if (e instanceof IdempotencyKeyReusedError) return { status: 422, body: { error: e.code, message: e.message, job_id: e.jobId } };
  // правки транскрипта и EDL, Approval A (Task 27): коды и статусы — из ошибок ядра; сообщения
  // без путей (id слов, решений и ревизий)
  if (e instanceof RevisionConflictError) return { status: 409, body: { error: e.code, message: e.message, base: e.base, current: e.current } };
  if (e instanceof ResourceBusyError) return { status: 409, body: { error: "resource_busy", message: "ресурс занят задачей — повторите правку после её завершения", resource: e.resource, job_id: e.jobId } };
  if (e instanceof ProposedLeftError) return { status: 409, body: { error: e.code, message: e.message, count: e.count } };
  if (e instanceof EditError) return { status: e.status, body: { error: e.code, message: e.message, ...e.details } };
  if (e instanceof StaleProcessAliveError) return { status: 409, body: { error: e.code, message: e.message, pids: e.pids, cmds: e.cmds } };
  // сообщения ядра и файловой системы содержат абсолютные пути MS_DATA_DIR: наружу — код и общий
  // текст, подробности — в журнал сервера (F6)
  if (isStorageError(e)) return { status: 503, body: { error: "storage_offline", message: "хранилище недоступно (подробности — в журнале сервера)" } };
  const fe = e as FastifyError;
  if (isResponseSerializationError(e)) return { status: 500, body: { error: "response_schema", message: `ответ не по контракту: ${e.cause.message}` } };
  // ошибки разбора тела и прочие клиентские ошибки Fastify (FST_ERR_CTP_*)
  if (typeof fe.statusCode === "number" && fe.statusCode >= 400 && fe.statusCode < 500) {
    return { status: fe.statusCode, body: { error: (fe.code ?? "bad_request").toLowerCase(), message: fe.message } };
  }
  const m = /^([a-z_]+): /.exec((e as Error)?.message ?? "");
  if (m && CORE_CODES[m[1]!]) return { status: CORE_CODES[m[1]!]!, body: { error: m[1]!, message: (e as Error).message } };
  return { status: 500, body: { error: "internal", message: INTERNAL_MESSAGE } };
}

const INTERNAL_MESSAGE = "внутренняя ошибка сервера (подробности — в журнале сервера)";

export interface NotFoundOptions {
  /** Собранный UI: неизвестный не-API GET/HEAD — `index.html` (клиентский роутер SPA). */
  spaIndex?: boolean;
  /** Корень хранилища: в телах ошибок (команды процессов 409 и пр.) пути маскируются. */
  root?: string;
}

const isApiPath = (url: string): boolean => {
  const path = url.split("?")[0]!;
  return path === "/api" || path.startsWith("/api/");
};

/** Обработчики ошибок и единственный not-found-обработчик приложения (F1: Fastify не даёт задать второй). */
export function installErrorHandler(app: FastifyInstance, o: NotFoundOptions = {}): void {
  app.setErrorHandler((err, req, reply) => {
    const { status, body } = toApiResponse(err);
    if (status >= 500) req.log.error({ err }, "api error");
    return reply.status(status).send(o.root ? maskDeep(body, o.root) : body);
  });
  app.setNotFoundHandler((req, reply) => {
    if (o.spaIndex && (req.method === "GET" || req.method === "HEAD") && !isApiPath(req.url)) return reply.sendFile("index.html");
    return reply.status(404).send({ error: "not_found", message: `нет маршрута ${req.method} ${req.url.split("?")[0]}` });
  });
}
