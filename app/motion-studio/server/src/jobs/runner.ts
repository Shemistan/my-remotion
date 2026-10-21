// Раннер задач: цикл `claimNext` каждые `pollMs`, на попытку — AbortController и
// heartbeat-таймер. Итог пишется только через `finish` (fencing). Отмена пользователем
// (`cancel_requested`) проверяется на каждом такте и в heartbeat.
import type { Job, JobType } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as jobs from "../db/repos/jobs.js";
import { systemClock, type Clock } from "./clock.js";
import { EventBus } from "./events.js";
import { AGENT_CALLS, HEARTBEAT_MS, HEAVY, MAX_RUNNING, POLL_MS, RENDERS } from "./limits.js";
import { claimNext, fenceOk, finish, heartbeat, setProgress } from "./queue.js";
import { AttemptPermits, Semaphore } from "./semaphore.js";
import type { Claim, HandlerResult, Handlers, JobContext } from "./types.js";

export interface JobRunnerOptions {
  db: Db;
  root: string;
  owner: string;
  handlers: Handlers;
  clock?: Clock;
  maxRunning?: number;
  agentCalls?: number;
  renders?: number;
  heavy?: number;
  pollMs?: number;
  heartbeatMs?: number;
  /** Общая шина событий (SSE, Task 20); по умолчанию своя. */
  events?: EventBus;
  /**
   * Сбой такта раннера, не связанный с хранилищем (ошибка в коде, схеме). Пишется ещё и в
   * stderr; в `job_events` не попадает — у события нет задачи (`job_id NOT NULL`).
   */
  onError?: (e: unknown) => void;
}

/**
 * Ошибка доступа к базе из-за хранилища (`storage_offline`, Task 13) или временной
 * блокировки: такт пропускается молча — разбирается StorageSupervisor.
 */
export function isStorageError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (/database connection is not open/i.test(e.message)) return true;
  const code = (e as { code?: unknown }).code;
  return typeof code === "string" && /^SQLITE_(IOERR|CANTOPEN|FULL|READONLY|NOTADB|CORRUPT|BUSY|LOCKED)/.test(code);
}

interface Active {
  jobId: string;
  attempt: number;
  controller: AbortController;
  done: Promise<void>;
}

export class JobRunner {
  private readonly db: Db;
  private readonly clock: Clock;
  private readonly maxRunning: number;
  private readonly pollMs: number;
  private readonly heartbeatMs: number;
  private readonly types: JobType[];
  private readonly events: EventBus;
  private readonly agents: Semaphore;
  private readonly renders: Semaphore;
  private readonly heavy: Semaphore;
  private readonly active = new Map<string, Active>();
  private timer: NodeJS.Timeout | undefined;
  private paused = false;
  private lastError: string | undefined;
  private stopped = false;

  constructor(private readonly opts: JobRunnerOptions) {
    this.db = opts.db;
    this.clock = opts.clock ?? systemClock;
    this.maxRunning = opts.maxRunning ?? MAX_RUNNING;
    this.pollMs = opts.pollMs ?? POLL_MS;
    this.heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS;
    this.types = (Object.keys(opts.handlers) as JobType[]).filter((t) => opts.handlers[t]);
    this.events = opts.events ?? new EventBus(opts.db);
    this.agents = new Semaphore(opts.agentCalls ?? AGENT_CALLS);
    this.renders = new Semaphore(opts.renders ?? RENDERS);
    this.heavy = new Semaphore(opts.heavy ?? HEAVY);
  }

  start(): void {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => this.tick(), this.pollMs);
    this.tick();
  }

  /** Новые задачи не захватываются (`storage_offline`); идущие попытки не трогаются. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.tick();
  }

  running(): { jobId: string; attempt: number; controller: AbortController }[] {
    return [...this.active.values()].map(({ jobId, attempt, controller }) => ({ jobId, attempt, controller }));
  }

  /**
   * Останавливает захват. `abortRunning` — прервать попытки: их итог не пишется, задачи
   * остаются `running` до восстановления (Task 13). Без него — дождаться завершения.
   */
  async stop(opts: { abortRunning: boolean }): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (opts.abortRunning) for (const a of this.active.values()) a.controller.abort(new Error("runner остановлен"));
    await Promise.allSettled([...this.active.values()].map((a) => a.done));
  }

  private tick(): void {
    // до start() (в том числе resume() раньше start()) задачи не захватываются
    if (this.stopped || !this.timer) return;
    for (const a of this.active.values()) this.checkCancel(a);
    if (this.paused) return;
    for (;;) {
      let claim: Claim | undefined;
      try {
        claim = claimNext(this.db, this.opts.owner, this.clock.now(), { running: this.active.size, maxRunning: this.maxRunning }, { types: this.types });
      } catch (e) {
        if (!isStorageError(e)) this.reportError(e);
        return; // следующий такт
      }
      this.lastError = undefined;
      if (!claim) return;
      this.launch(claim);
    }
  }

  /** Сбой такта: в stderr и `onError`; одинаковые сообщения подряд не повторяются. */
  private reportError(e: unknown): void {
    const text = errText(e);
    if (text === this.lastError) return;
    this.lastError = text;
    console.error(`motion-studio runner_error: ${text}`);
    try {
      this.opts.onError?.(e);
    } catch {
      // обработчик ошибок не роняет раннер
    }
  }

  private checkCancel(a: Active): void {
    if (a.controller.signal.aborted) return;
    try {
      if (jobs.get(this.db, a.jobId)?.cancel_requested) a.controller.abort(new DOMException("задача отменена", "AbortError"));
    } catch {
      // БД недоступна — попытку прервёт StorageSupervisor
    }
  }

  private launch(claim: Claim): void {
    const { job, attempt } = claim;
    const controller = new AbortController();
    const active: Active = { jobId: job.id, attempt, controller, done: Promise.resolve() };
    this.active.set(job.id, active);
    active.done = this.execute(job, attempt, controller).finally(() => {
      this.active.delete(job.id);
      if (!this.stopped) this.tick();
    });
  }

  private emit(jobId: string, level: "debug" | "info" | "warn" | "error", kind: string, message: string, data?: unknown): void {
    try {
      this.events.emit(this.db, { job_id: jobId, level, kind, message, ...(data === undefined ? {} : { data }) });
    } catch {
      // журнал — не причина ронять попытку
    }
  }

  private async execute(job: Job, attempt: number, controller: AbortController): Promise<void> {
    const { db } = this;
    const hb = setInterval(() => {
      if (controller.signal.aborted) return;
      let ok: boolean;
      try {
        ok = heartbeat(db, job.id, attempt, this.clock.now());
      } catch {
        return;
      }
      if (!ok) {
        this.emit(job.id, "warn", "fenced_out", `попытка ${attempt} устарела`);
        controller.abort(new Error(`fenced_out: попытка ${attempt} устарела`));
      } else {
        this.checkCancel(this.active.get(job.id)!);
      }
    }, this.heartbeatMs);

    const permits = [new AttemptPermits(this.agents), new AttemptPermits(this.renders), new AttemptPermits(this.heavy)] as const;
    const ctx: JobContext = {
      db,
      job,
      attempt,
      signal: controller.signal,
      run: { root: this.opts.root, runId: job.id, attempt },
      emit: (kind, message, data) => this.emit(job.id, "info", kind, message, data),
      progress: (p, stage) => {
        if (setProgress(db, job.id, attempt, p, stage)) this.emit(job.id, "debug", "progress", stage, { progress: p, stage });
      },
      fenceOk: () => fenceOk(db, job.id, attempt),
      agents: permits[0],
      renders: permits[1],
      heavy: permits[2],
    };

    this.emit(job.id, "info", "started", `${job.type}: попытка ${attempt}`, { attempt });
    let result: HandlerResult | undefined;
    let thrown: unknown;
    try {
      result = await this.opts.handlers[job.type]!(ctx);
    } catch (e) {
      thrown = e;
    } finally {
      clearInterval(hb);
      // места, не отданные обработчиком (исключение, abort, забытый release), — обратно
      const leaked = permits.reduce((n, p) => n + p.releaseAll(), 0);
      if (leaked > 0) this.emit(job.id, "warn", "permits_released", `обработчик не вернул мест семафоров: ${leaked}`, { leaked });
    }

    const cancelled = this.cancelRequested(job.id);
    const aborted = controller.signal.aborted;
    // Прерывание не по отмене (stop, storage_offline, fencing): итог попытки, кроме
    // completed (публикация уже прошла с fencing), не пишется — задачу разберёт восстановление.
    if (aborted && !cancelled && result?.status !== "completed") {
      this.emit(job.id, "warn", "interrupted", `попытка ${attempt} прервана`);
      return;
    }
    if (cancelled && result?.status !== "completed" && result?.status !== "cancelled") {
      result = { status: "cancelled", error: { code: "cancelled", stage: "cancelled", message: "задача отменена" } };
    } else if (!result) {
      result = { status: "failed", error: { code: "pipeline", message: errText(thrown) } };
    }
    let ok: boolean;
    try {
      ok = finish(db, job.id, attempt, result);
    } catch (e) {
      this.emit(job.id, "error", "finish_failed", errText(e));
      return;
    }
    if (!ok) {
      this.emit(job.id, "warn", "fenced_out", `итог попытки ${attempt} не записан: попытка устарела`);
      return;
    }
    const final = jobs.get(db, job.id)!;
    this.emit(job.id, final.status === "failed" ? "error" : "info", final.status, final.error?.message ?? final.status);
  }

  private cancelRequested(jobId: string): boolean {
    try {
      return jobs.get(this.db, jobId)?.cancel_requested === true;
    } catch {
      return false;
    }
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
