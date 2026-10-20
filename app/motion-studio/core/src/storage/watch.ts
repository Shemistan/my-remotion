import { StorageError, type StorageStatus } from "./guard.js";

type Failure = Extract<StorageStatus, { ok: false }>;

/** Во сколько интервалов укладывается одна проверка, прежде чем считаться зависшей. */
const DEADLINE_INTERVALS = 3;

/**
 * Сторож хранилища: вызывает `check` каждые `intervalMs` (первый раз — через интервал,
 * проверку перед стартом делает вызывающий). Проверки не перекрываются; проверка,
 * не ответившая за DEADLINE_INTERVALS × intervalMs (например, повисший diskutil на
 * отключённом диске), считается сбоем. На первом сбое `signal` прерывается
 * с StorageError и сторож останавливается. После `stop()` сбой уже не прерывает.
 */
export function watchStorage(
  check: () => Promise<StorageStatus>,
  intervalMs: number,
): { signal: AbortSignal; stop(): void; lastFailure(): StorageStatus | undefined } {
  const controller = new AbortController();
  const deadlineMs = DEADLINE_INTERVALS * intervalMs;
  let failure: Failure | undefined;
  let busy = false;
  let stopped = false;

  const stop = (): void => {
    stopped = true;
    clearInterval(timer);
  };

  const withDeadline = (): Promise<StorageStatus> => {
    let deadline: NodeJS.Timeout | undefined;
    const timeout = new Promise<Failure>((resolve) => {
      deadline = setTimeout(
        () => resolve({ ok: false, reason: "not_found", detail: `проверка хранилища не ответила за ${deadlineMs} мс` }),
        deadlineMs,
      );
      deadline.unref();
    });
    const checked = check().catch(
      (e: unknown): Failure => ({
        ok: false,
        reason: "not_found",
        detail: `проверка хранилища упала: ${(e as Error).message}`,
      }),
    );
    return Promise.race([checked, timeout]).finally(() => clearTimeout(deadline));
  };

  const timer = setInterval(() => {
    if (busy || stopped) return;
    busy = true;
    void withDeadline()
      .then((status) => {
        if (status.ok || stopped) return;
        failure = status;
        stop();
        controller.abort(new StorageError(status.reason, status.detail));
      })
      .finally(() => {
        busy = false;
      });
  }, intervalMs);
  timer.unref();

  return { signal: controller.signal, stop, lastFailure: () => failure };
}
