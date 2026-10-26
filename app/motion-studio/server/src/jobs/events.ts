import type { JobEventDto } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as jobEvents from "../db/repos/job-events.js";
import { afterCommit } from "../db/tx.js";

export type JobEventInput = Omit<JobEventDto, "id" | "ts">;
type Listener = (ev: JobEventDto) => void;

/** Пропуск в догоне: событий с `id` в (`afterId`, `skippedTo`] клиент не получит. */
export interface Gap {
  afterId: number;
  skippedTo: number;
  skipped: number;
}

export interface SubscribeOptions {
  /** Не больше стольких событий истории; старше — пропуск с `onGap`. */
  maxCatchup?: number;
  /** Сообщить клиенту о пропуске (SSE: событие `gap` — клиент перечитывает состояние). */
  onGap?: (gap: Gap) => void;
}

const PAGE = 500;
export const MAX_CATCHUP = 5_000;

/**
 * Журнал задач для SSE: `emit` пишет `job_events` и рассылает подписчикам; `subscribe`
 * сначала догоняет из БД событиями с `id > sinceId` (не больше `maxCatchup`, иначе пропуск
 * с `onGap`), затем получает живые (без дублей).
 *
 * Рассылка — только после коммита: `emit` внутри `tx` откладывает её до коммита внешней
 * транзакции, откат её отбрасывает (иначе подписчик увидел бы событие-фантом, а id,
 * повторно выданный AUTOINCREMENT после отката, отбросил бы как дубль). `emit` внутри
 * транзакции, открытой в обход `tx()`, — ошибка.
 *
 * Подписчики вызываются синхронно и не должны блокировать: писатель SSE (Task 20) обязан
 * сам буферизовать и учитывать `drain` потока, а при переполнении — закрыть соединение.
 */
export class EventBus {
  private readonly listeners = new Set<{ cb: Listener; last: number }>();
  private readonly db: () => Db;

  /** `db` — база или функция (после `storage_offline` база переоткрывается, Task 13). */
  constructor(db: Db | (() => Db)) {
    this.db = typeof db === "function" ? db : () => db;
  }

  emit(db: Db, ev: JobEventInput): JobEventDto {
    const saved = jobEvents.insert(db, ev);
    afterCommit(db, () => {
      for (const l of [...this.listeners]) deliver(l, saved);
    });
    return saved;
  }

  subscribe(sinceId: number, cb: Listener, opts: SubscribeOptions = {}): () => void {
    const db = this.db();
    const l = { cb, last: sinceId };
    const max = opts.maxCatchup ?? MAX_CATCHUP;
    const total = (db.prepare("SELECT count(*) FROM job_events WHERE id > ?").pluck().get(sinceId) as number);
    if (total > max) {
      const skippedTo = db.prepare("SELECT id FROM job_events WHERE id > ? ORDER BY id LIMIT 1 OFFSET ?").pluck().get(sinceId, total - max - 1) as number;
      opts.onGap?.({ afterId: sinceId, skippedTo, skipped: total - max });
      l.last = skippedTo;
    }
    for (;;) {
      const page = jobEvents.listSince(db, l.last, { limit: PAGE });
      for (const ev of page) deliver(l, ev);
      if (page.length < PAGE) break;
    }
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }

  /**
   * Только живые события, без догона из БД (журнал сервера, Task 48): каждое событие после
   * коммита — ровно один раз.
   */
  tail(cb: Listener): () => void {
    const l = { cb, last: jobEvents.maxId(this.db()) };
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }
}

function deliver(l: { cb: Listener; last: number }, ev: JobEventDto): void {
  if (ev.id <= l.last) return;
  l.last = ev.id;
  try {
    l.cb(ev);
  } catch {
    // Сбой подписчика (закрытый SSE-поток) не мешает остальным и записи события.
  }
}
