// Общие помощники пакетов сцен (Task 38-39): пакеты сценария (`script/batch.ts`) и видеосцен
// (`video-scenes/batch.ts`) — наборы обычных задач с ключами идемпотентности. id пакета —
// префикс из `Idempotency-Key` запроса + отпечаток тела; номер повтора задачи сцены — `:try-n`.
import type { Job } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import { sha256 } from "../scenes/hash.js";

/** Задача сцены ещё идёт (или ждёт человека): новую не ставим, она входит в пакет как есть. */
export const BATCH_ACTIVE: ReadonlySet<Job["status"]> = new Set(["pending", "running", "awaiting_input", "awaiting_approval", "blocked"]);
/** Отменяемые пакетом статусы (blocked — решение человека: разбор процессов, `jobs/:id/cancel`). */
export const BATCH_CANCELLABLE: ReadonlySet<Job["status"]> = new Set(["pending", "running", "awaiting_input", "awaiting_approval"]);

/**
 * Префикс id пакета из ключа запроса: повтор того же `Idempotency-Key` находит пакет без новой
 * колонки. `prefix` — вид пакета (`sb` — сценарий, `vb` — видеосцены).
 */
export const keyPrefix = (projectId: string, key: string, prefix: string): string => `${prefix}_${sha256(`${projectId}\n${key}`).slice(0, 20)}`;

/**
 * Отпечаток тела запроса в id пакета (M6): тот же ключ с другим телом — 422
 * `idempotency_key_reused`. Тело сериализуется как есть: порядок полей — часть отпечатка.
 */
export const requestTag = (body: unknown): string => sha256(JSON.stringify(body)).slice(0, 10);

export interface NextTryOpts {
  /** Последняя задача сцены упала или отменена — нужен новый номер `:try-n`. */
  retry: boolean;
  /** Идущую задачу сменяет новая (двойник по новому эталону): занят любой найденный ключ. */
  supersede?: boolean;
}

/**
 * Ключ новой задачи сцены. `keyOf(tryN)` строит ключ; `prior` — число прежних задач генерации
 * сцены. Повтор (`retry`/`supersede`) начинает с `:try-<prior>`; ключ уже занят завершённой
 * задачей (она кончилась без версии — очередь вернула бы её) — следующий номер.
 */
export function nextTryKey(db: Db, keyOf: (tryN: number | undefined) => string, prior: number, opts: NextTryOpts): string {
  let tryN = opts.retry || opts.supersede ? prior : undefined;
  const taken = (k: string) => {
    const j = jobs.findByIdempotencyKey(db, k);
    return j !== undefined && (opts.supersede === true || !BATCH_ACTIVE.has(j.status));
  };
  let k = keyOf(tryN);
  while (taken(k)) {
    tryN = (tryN ?? prior) + 1;
    k = keyOf(tryN);
  }
  return k;
}
