import { StorageError, type StorageStatus } from "./guard.js";

type Failure = Extract<StorageStatus, { ok: false }>;

/**
 * Сторож хранилища: вызывает `check` каждые `intervalMs` (первый раз — через интервал,
 * проверку перед стартом делает вызывающий). На первом сбое прерывает `signal`
 * с StorageError и останавливается. Проверки не перекрываются.
 */
export function watchStorage(
  check: () => Promise<StorageStatus>,
  intervalMs: number,
): { signal: AbortSignal; stop(): void; lastFailure(): StorageStatus | undefined } {
  const controller = new AbortController();
  let failure: Failure | undefined;
  let busy = false;

  const timer = setInterval(() => {
    if (busy || controller.signal.aborted) return;
    busy = true;
    check()
      .catch((e: unknown): Failure => ({
        ok: false,
        reason: "not_found",
        detail: `проверка хранилища упала: ${(e as Error).message}`,
      }))
      .then((status) => {
        if (status.ok || controller.signal.aborted) return;
        failure = status;
        clearInterval(timer);
        controller.abort(new StorageError(status.reason, status.detail));
      })
      .finally(() => {
        busy = false;
      });
  }, intervalMs);
  timer.unref();

  return {
    signal: controller.signal,
    stop: () => clearInterval(timer),
    lastFailure: () => failure,
  };
}
