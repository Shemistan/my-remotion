// Продолжение прогона eval (`--run <id>`): какие готовые сцены переделать.

/** Обрыв сети или API — сбой среды, а не качества сцены. */
const TRANSIENT = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|Connection dropped|socket hang up|fetch failed/i;

/**
 * Сцена упала на сбое среды (обрыв соединения с API): её превью — недоделанная версия, судить
 * его нечестно, продолжение прогона генерирует сцену заново. Провал QA или таймаут — результат.
 */
export function isTransientFailure(failure: unknown): boolean {
  const message = (failure as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && TRANSIENT.test(message);
}
