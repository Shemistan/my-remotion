// Сбой среды (обрыв сети или API), а не результат сцены.

/** Обрыв сети или API в тексте ошибки агента. */
const NETWORK = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|Connection dropped|socket hang up|fetch failed/i;

export function isNetworkError(text: string): boolean {
  return NETWORK.test(text);
}
