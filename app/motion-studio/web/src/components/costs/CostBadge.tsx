// Значок расчётной стоимости (Task 49a): пакет генерации — сумма всех задач его сцен (генерации,
// повторы, правки; все попытки), состав пакета считает сервер (`?batchId=`), поэтому размер пакета
// не ограничен строкой запроса. Справочно, не счёт подписки; пока стоимость нулевая — не показывается.
import { useCosts, usd } from "../../api/diagnostics-client.js";
import { t } from "../../i18n/index.js";

export function CostBadge({ batchId, refetchMs }: { batchId: string; refetchMs?: number | false }) {
  const q = useCosts({ batchId }, { refetchMs: refetchMs ?? false });
  const v = q.data?.totalUsd;
  if (!v) return null;
  return (
    <span className="badge muted mono" data-testid="cost-badge" title={t("costs.badgeHint")}>
      {t("costs.badge", { usd: usd(v) })}
    </span>
  );
}
