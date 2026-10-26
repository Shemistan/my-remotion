// Очередь задачи сцены (Task 40): задача ждёт замка сцены или ресурса — «В очереди за: Правка
// сцены · впереди задач: 1». Задача, которая держит замок, — по `blocking_job_id` (её тип).
import type { VideoSceneDto } from "@ms/contracts";
import { useJob } from "../../api/queries.js";
import { t, tk } from "../../i18n/index.js";

export function QueueBadge({ queue }: { queue: VideoSceneDto["queue"] }) {
  const blocking = useJob(queue?.blocking_job_id);
  if (!queue || queue.ahead <= 0) return null;
  const type = blocking.data?.job.type;
  const what = type ? tk(`job.type.${type}`, t("videoScenes.queue.unknown")) : t("videoScenes.queue.unknown");
  return (
    <span className="badge status-pending" data-testid="queue-badge">
      {t("videoScenes.queue", { what })} · {t("videoScenes.queue.ahead", { n: queue.ahead })}
    </span>
  );
}
