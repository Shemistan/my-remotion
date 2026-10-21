/** Счётный семафор с очередью FIFO; ожидание прерывается `AbortSignal`. */
export class Semaphore {
  private free: number;
  private readonly waiters: { grant: () => void }[] = [];

  constructor(private readonly n: number) {
    if (!Number.isInteger(n) || n < 1) throw new Error(`Semaphore: n должно быть целым >= 1: ${n}`);
    this.free = n;
  }

  /** Свободных мест сейчас. */
  available(): number {
    return this.free;
  }

  /** Ждёт место; возвращает release (повторный вызов ничего не делает). Abort ожидания — reject. */
  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    if (this.free > 0) {
      this.free--;
      return Promise.resolve(this.releaser());
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        grant: () => {
          signal?.removeEventListener("abort", onAbort);
          resolve(this.releaser());
        },
      };
      const onAbort = (): void => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(abortReason(signal!));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiters.push(waiter);
    });
  }

  private releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = this.waiters.shift();
      if (next) next.grant(); // место переходит ожидающему, free не меняется
      else this.free = Math.min(this.n, this.free + 1);
    };
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("aborted", "AbortError");
}

/** То, что видит обработчик: `Semaphore` или обёртка попытки. */
export interface Permits {
  acquire(signal?: AbortSignal): Promise<() => void>;
  available(): number;
}

/**
 * Места семафора, взятые одной попыткой: раннер после завершения обработчика (возврат,
 * исключение, abort) вызывает `releaseAll`, и забытые места возвращаются. Место, выданное
 * уже после `releaseAll` (ожидание не было прервано), сразу отдаётся обратно.
 */
export class AttemptPermits implements Permits {
  private readonly held = new Set<() => void>();
  private closed = false;

  constructor(private readonly sem: Semaphore) {}

  available(): number {
    return this.sem.available();
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    const release = await this.sem.acquire(signal);
    if (this.closed) {
      // обработчик уже завершён: место сразу обратно (без reject — его некому поймать)
      release();
      return () => undefined;
    }
    const own = (): void => {
      if (this.held.delete(own)) release();
    };
    this.held.add(own);
    return own;
  }

  /** Возвращает все места попытки; выданные позже сразу отдаются обратно. Число возвращённых. */
  releaseAll(): number {
    this.closed = true;
    const n = this.held.size;
    for (const r of [...this.held]) r();
    return n;
  }
}
