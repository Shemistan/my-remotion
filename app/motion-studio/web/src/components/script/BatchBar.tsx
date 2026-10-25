// Прогресс пакета генерации сцен (S9): «Готово N из M», ненулевые счётчики по статусам, полоса
// прогресса и «Отменить пакет», пока в пакете есть ждущие или идущие задачи.
import type { ScriptBatchDto } from "@ms/contracts";
import { useCancelBatch } from "../../api/script-client.js";
import { errorText, t } from "../../i18n/index.js";
import { batchActive } from "../../script/output.js";

const COUNTS = ["running", "pending", "failed", "cancelled", "blocked"] as const;

export function BatchBar({ projectId, batch }: { projectId: string; batch: ScriptBatchDto }) {
  const cancel = useCancelBatch(projectId);
  const c = batch.counts;
  const active = batchActive(batch);
  const pct = c.total > 0 ? Math.round((c.ready / c.total) * 100) : 0;
  return (
    <section className="panel batch-bar" data-testid="batch-bar" aria-label={t("scriptOutput.batch.title")}>
      <div className="row wrap">
        <strong>{t("scriptOutput.batch.progress", { ready: c.ready, total: c.total })}</strong>
        {COUNTS.filter((k) => c[k] > 0).map((k) => (
          <span key={k} className={`badge status-${k}`}>{t(`scriptOutput.batch.count.${k}`, { n: c[k] })}</span>
        ))}
        <span className="spacer" />
        {active ? (
          <button type="button" disabled={cancel.isPending} title={t("scriptOutput.batch.cancelHint")} onClick={() => cancel.mutate(batch.id)}>
            {t("scriptOutput.batch.cancel")}
          </button>
        ) : null}
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t("scriptOutput.batch.title")}>
        <div style={{ width: `${pct}%` }} />
      </div>
      {cancel.isError ? <p className="error">{errorText(cancel.error)}</p> : null}
    </section>
  );
}
