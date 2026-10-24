// Живые события задач: `EventSource('/api/events?since=…')`. Событие задачи инвалидирует её
// запросы TanStack Query (задача, список задач; не прогресс — ещё сцену, чат и проект, в
// которых задача меняет версии и сообщения). `gap` (сервер не отдал часть догона) и
// переподключение — перечитать всё. Браузер переподключается сам и шлёт `Last-Event-ID`.
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export type EventSignal = { kind: "job"; jobId: string; eventKind: string } | { kind: "gap" };

interface Invalidator {
  invalidateQueries: (filters?: { queryKey: unknown[] }) => unknown;
}

export function invalidateForEvent(client: Invalidator, ev: EventSignal): void {
  if (ev.kind === "gap") {
    client.invalidateQueries();
    return;
  }
  client.invalidateQueries({ queryKey: ["job", ev.jobId] });
  client.invalidateQueries({ queryKey: ["jobs"] });
  if (ev.eventKind === "progress") return;
  client.invalidateQueries({ queryKey: ["scene"] });
  client.invalidateQueries({ queryKey: ["messages"] });
  client.invalidateQueries({ queryKey: ["project"] });
  // видеопроект (Task 29): задачи публикуют исходник, транскрипт, ревизии EDL и превью
  client.invalidateQueries({ queryKey: ["video"] });
  client.invalidateQueries({ queryKey: ["transcript"] });
  client.invalidateQueries({ queryKey: ["transcriptRevisions"] });
  client.invalidateQueries({ queryKey: ["edl"] });
  // анализ и план (Task 33): задачи публикуют анализ видеоряда, разметку, план и стиль
  client.invalidateQueries({ queryKey: ["plan"] });
  client.invalidateQueries({ queryKey: ["style"] });
  // сценарий (S9, C12): задачи генерации сцен и сборки папки меняют состояние сценария
  client.invalidateQueries({ queryKey: ["script"] });
}

/** Подписка на `/api/events` на всё время жизни приложения. */
export function useEvents(): void {
  const client = useQueryClient();
  useEffect(() => subscribeEvents(client), [client]);
}

export function subscribeEvents(client: QueryClient): () => void {
  if (typeof EventSource === "undefined") return () => undefined;
  let lastId = 0;
  let es: EventSource | undefined;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    es = new EventSource(lastId > 0 ? `/api/events?since=${lastId}` : "/api/events");
    es.addEventListener("job", (e) => {
      const msg = e as MessageEvent<string>;
      const id = Number(msg.lastEventId);
      if (Number.isInteger(id) && id > lastId) lastId = id;
      try {
        const data = JSON.parse(msg.data) as { job_id?: unknown; kind?: unknown };
        if (typeof data.job_id === "string") invalidateForEvent(client, { kind: "job", jobId: data.job_id, eventKind: String(data.kind ?? "") });
      } catch {
        invalidateForEvent(client, { kind: "gap" });
      }
    });
    es.addEventListener("gap", () => invalidateForEvent(client, { kind: "gap" }));
    es.onerror = () => {
      // поток закрыт сервером (перезапуск, 503): открыть заново с последнего id и перечитать
      if (es?.readyState === EventSource.CLOSED && !closed) {
        retry = setTimeout(() => {
          invalidateForEvent(client, { kind: "gap" });
          open();
        }, 3000);
      }
    };
  };
  open();
  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    es?.close();
  };
}
