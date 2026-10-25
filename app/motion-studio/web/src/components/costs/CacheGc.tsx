// Кнопка «Убрать кэш» (Task 49a): ставит задачу `cache.gc` — LRU бандлов, кадров и мастеров
// сверх `cache.maxBytes`; опубликованное, экспорты и папки клипов не трогаются. Ход и итог —
// в мониторе задач и журнале (событие `cache_gc`).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { diagnosticsApi } from "../../api/diagnostics-client.js";
import { Link } from "../Link.js";
import { errorText, t } from "../../i18n/index.js";

export function CacheGc() {
  const client = useQueryClient();
  const run = useMutation({
    mutationFn: () => diagnosticsApi.cacheGc(),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["jobs"] }),
  });
  return (
    <section className="panel" aria-label={t("costs.cacheGc.title")}>
      <h2>{t("costs.cacheGc.title")}</h2>
      <p className="hint small">{t("costs.cacheGc.hint")}</p>
      <div className="row wrap">
        <button type="button" disabled={run.isPending} onClick={() => run.mutate()}>{t("costs.cacheGc.run")}</button>
        {run.isSuccess ? <span className="muted">{t("costs.cacheGc.queued")} <Link to={{ name: "jobs" }}>{t("dashboard.allJobs")}</Link></span> : null}
      </div>
      {run.isError ? <p className="error">{errorText(run.error)}</p> : null}
    </section>
  );
}
