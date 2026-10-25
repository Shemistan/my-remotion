// Продолжение прогона bench (`--run <id>`): какие готовые сцены переделать.
import { isNetworkError } from "../pipeline/transient.js";

/**
 * Сцена упала на сбое среды (обрыв соединения с API): её превью — недоделанная версия, судить
 * его нечестно, продолжение прогона генерирует сцену заново. Провал QA или таймаут — результат.
 * Стадия QA — результат (текст её проблемы может цитировать лог сцены с сетевым словом), кроме
 * сбоя самого вызова Visual QA: его пайплайн помечает `transient: true` там, где он возник.
 */
export function isTransientFailure(failure: unknown): boolean {
  const f = failure as { message?: unknown; stage?: unknown; transient?: unknown } | null | undefined;
  if (f?.transient === true) return true;
  if (f?.stage === "qa") return false;
  const message = f?.message;
  return typeof message === "string" && isNetworkError(message);
}
