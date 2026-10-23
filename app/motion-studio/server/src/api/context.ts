// Общее для маршрутов Control API: тип приложения с zod-провайдером, контекст, идемпотентность.
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { FastifyBaseLogger, FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Job, JobType } from "@ms/contracts";
import { z } from "zod";
import type { Core } from "../boot.js";
import * as jobs from "../db/repos/jobs.js";
import { IdempotencyKeyReusedError, inputHash } from "../jobs/queue.js";
import { ApiError } from "./errors.js";

export type ZApp = FastifyInstance<Server, IncomingMessage, ServerResponse, FastifyBaseLogger, ZodTypeProvider>;

export interface ApiContext {
  core: Core;
  port: number;
}

export const IdParams = z.object({ id: z.string().min(1).max(200) }).strict();

/** `Idempotency-Key` обязателен на POST, создающих задачи (M15). */
export function idempotencyKey(req: FastifyRequest): string {
  const raw = req.headers["idempotency-key"];
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) throw new ApiError(400, "idempotency_key_required", "нужен заголовок Idempotency-Key");
  if (key.length > 200) throw new ApiError(400, "idempotency_key_invalid", "Idempotency-Key длиннее 200 символов");
  return key;
}

/**
 * Повтор запроса с тем же ключом (вызывать внутри `tx` до любых записей). Ключа нет —
 * `undefined`. Есть — вход запроса собирается заново с id, выданными в первый раз
 * (`candidate(existing)`: сцена, сообщение), и сравнивается по `input_hash`: совпал — та же
 * задача (200, без новых строк), нет или тип другой — `IdempotencyKeyReusedError` (422).
 * `candidate` возвращает `undefined`, если запрос заведомо другой (текст сообщения и т. п.).
 */
export function replay(db: Core["db"], key: string, type: JobType, candidate: (existing: Job) => unknown): Job | undefined {
  const existing = jobs.findByIdempotencyKey(db, key);
  if (!existing) return undefined;
  const input = existing.type === type ? candidate(existing) : undefined;
  if (input === undefined || inputHash(type, input) !== existing.input_hash) throw new IdempotencyKeyReusedError(key, existing.id);
  return existing;
}

/** Строковое поле входа существующей задачи (id, выданный при первом запросе). */
export function inputField(job: Job, name: string): string | undefined {
  const v = (job.input as Record<string, unknown> | null)?.[name];
  return typeof v === "string" ? v : undefined;
}

/** `?flag=1|true|0|false` — булев параметр строки запроса. */
export const QueryBool = z.enum(["1", "true", "0", "false"]).transform((v) => v === "1" || v === "true");
