import type { JobEventDto } from "@ms/contracts";
import type { Db } from "../db/open.js";
import * as jobEvents from "../db/repos/job-events.js";

export type JobEventInput = Omit<JobEventDto, "id" | "ts">;
type Listener = (ev: JobEventDto) => void;

const PAGE = 500;

/**
 * Журнал задач для SSE: `emit` пишет `job_events` и рассылает подписчикам; `subscribe`
 * сначала догоняет из БД событиями с `id > sinceId`, затем получает живые (без дублей).
 * Всё синхронно, поэтому между догоном и подпиской событие не теряется.
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
    for (const l of [...this.listeners]) deliver(l, saved);
    return saved;
  }

  subscribe(sinceId: number, cb: Listener): () => void {
    const l = { cb, last: sinceId };
    for (;;) {
      const page = jobEvents.listSince(this.db(), l.last, { limit: PAGE });
      for (const ev of page) deliver(l, ev);
      if (page.length < PAGE) break;
    }
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
