// Прогресс пакета генерации сцен (S9): «Готово N из M», ненулевые счётчики по статусам, полоса
// прогресса и «Отменить пакет», пока в пакете есть ждущие или идущие задачи. Готовые сцены, не
// вошедшие в полный пакет (`readySkipped` по состоянию, S17a), — тоже «готово». Task 49a: значок
// расчётной стоимости пакета (`CostBadge`).
import type { ScriptBatchDto } from "@ms/contracts";
import { useCancelBatch } from "../../api/script-client.js";
import { errorText, t } from "../../i18n/index.js";
import { batchActive } from "../../script/output.js";
import { CostBadge } from "../costs/CostBadge.js";

const COUNTS = ["running", "pending", "failed", "cancelled", "blocked"] as const;

export function BatchBar({ projectId, batch, readySkipped = 0 }: { projectId: string; batch: ScriptBatchDto; readySkipped?: number }) {
  const cancel = useCancelBatch(projectId);
  const c = batch.counts;
  const active = batchActive(batch);
  const ready = c.ready + readySkipped;
  const total = c.total + readySkipped;
  const pct = total > 0 ? Math.round((ready / total) * 100) : 0;
  return (
    <section className="panel batch-bar" data-testid="batch-bar" aria-label={t("scriptOutput.batch.title")}>
      <div className="row wrap">
        <strong>{t("scriptOutput.batch.progress", { ready, total })}</strong>
        {COUNTS.filter((k) => c[k] > 0).map((k) => (
          <span key={k} className={`badge status-${k}`}>{t(`scriptOutput.batch.count.${k}`, { n: c[k] })}</span>
        ))}
        {/* Task 49a: расчётная стоимость пакета, справочно */}
        <CostBadge jobIds={batch.items.flatMap((i) => (i.job ? [i.job.id] : []))} refetchMs={active ? 5_000 : false} />
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
