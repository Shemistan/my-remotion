// Значок расчётной стоимости (Task 49a): сумма вызовов агентов задач (пакет генерации — все его
// задачи, все попытки). Справочно, не счёт подписки; пока стоимость нулевая — не показывается.
import { useCosts, usd } from "../../api/diagnostics-client.js";
import { t } from "../../i18n/index.js";

export function CostBadge({ jobIds, refetchMs }: { jobIds: string[]; refetchMs?: number | false }) {
  const q = useCosts({ jobIds: [...jobIds].sort() }, { refetchMs: refetchMs ?? false });
  const v = q.data?.totalUsd;
  if (!v) return null;
  return (
    <span className="badge muted mono" data-testid="cost-badge" title={t("costs.badgeHint")}>
      {t("costs.badge", { usd: usd(v) })}
    </span>
  );
}
