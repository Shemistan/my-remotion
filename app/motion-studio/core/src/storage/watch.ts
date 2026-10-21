import { StorageError, type StorageStatus, isInconclusive } from "./guard.js";

type Failure = Extract<StorageStatus, { ok: false }>;

/** Во сколько интервалов укладывается одна проверка, прежде чем считаться зависшей. */
export const DEADLINE_INTERVALS = 3;

/**
 * Сколько неокончательных отказов подряд (`isInconclusive`: проба тома медленная или
 * упала, проверка не ответила за дедлайн) нужно для offline. H2: под нагрузкой diskutil
 * отвечал дольше своего таймаута, и один такой ответ ронял задачи при живом диске.
 */
export const INCONCLUSIVE_LIMIT = 3;

/**
 * Сторож хранилища: вызывает `check` каждые `intervalMs` (первый раз — через интервал,
 * проверку перед стартом делает вызывающий). Проверки не перекрываются.
 *
 * Отказы двух классов:
 * - окончательный (корня нет, маркер чужой, другой том, запись не прошла, st_dev корня
 *   сменился между проверками) — `signal` прерывается сразу;
 * - неокончательный — считается серия подряд; успешная проверка её обнуляет, на
 *   INCONCLUSIVE_LIMIT-м подряд — offline с последней причиной.
 *
 * Проверка, не ответившая за DEADLINE_INTERVALS × intervalMs, — неокончательный отказ
 * `storage_watch_timeout`, и следующая проверка стартует на следующем тике. Повисшие
 * насовсем проверки дают offline через бюджет
 *   intervalMs + INCONCLUSIVE_LIMIT × DEADLINE_INTERVALS × intervalMs + (INCONCLUSIVE_LIMIT − 1) × intervalMs
 * (при 10 с — 120 с; до H2 было 40 с с первого же дедлайна).
 *
 * На сбое `signal` прерывается с StorageError и сторож останавливается. После `stop()`
 * сбой уже не прерывает.
 */
export function watchStorage(
  check: () => Promise<StorageStatus>,
  intervalMs: number,
  opts: { inconclusiveLimit?: number } = {},
): { signal: AbortSignal; stop(): void; lastFailure(): StorageStatus | undefined } {
  const controller = new AbortController();
  const deadlineMs = DEADLINE_INTERVALS * intervalMs;
  const limit = opts.inconclusiveLimit ?? INCONCLUSIVE_LIMIT;
  let failure: Failure | undefined;
  let busy = false;
  let stopped = false;
  let streak = 0;
  let dev: number | undefined;

  const stop = (): void => {
    stopped = true;
    clearInterval(timer);
  };

  const withDeadline = (): Promise<StorageStatus> => {
    let deadline: NodeJS.Timeout | undefined;
    const timeout = new Promise<Failure>((resolve) => {
      deadline = setTimeout(
        () => resolve({ ok: false, reason: "storage_watch_timeout", detail: `проверка хранилища не ответила за ${deadlineMs} мс` }),
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

  /** Отказ, после которого сторож объявляет offline, или undefined — продолжать. */
  const verdict = (status: StorageStatus): Failure | undefined => {
    if (status.dev !== undefined) {
      if (dev !== undefined && status.dev !== dev) {
        return { ok: false, reason: "volume_mismatch", detail: `устройство корня сменилось (st_dev ${dev} → ${status.dev}): том перемонтирован` };
      }
      dev = status.dev;
    }
    if (status.ok) {
      streak = 0;
      return undefined;
    }
    if (!isInconclusive(status)) return status;
    streak++;
    return streak >= limit ? { ...status, detail: `${status.detail} (${streak} неокончательных отказа подряд)` } : undefined;
  };

  const timer = setInterval(() => {
    if (busy || stopped) return;
    busy = true;
    void withDeadline()
      .then((status) => {
        if (stopped) return;
        const lost = verdict(status);
        if (!lost) return;
        failure = lost;
        stop();
        controller.abort(new StorageError(lost.reason, lost.detail));
      })
      .finally(() => {
        busy = false;
      });
  }, intervalMs);
  timer.unref();

  return { signal: controller.signal, stop, lastFailure: () => failure };
}
