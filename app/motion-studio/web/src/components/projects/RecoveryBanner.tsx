// Баннер после аварийного завершения (Task 47): последний отчёт старта со сбоем, ещё не
// просмотренный, — «восстановлено N задач, M заблокированы, K черновиков в карантине» и ссылка в
// центр восстановления. Ошибка запроса или штатный старт — ничего не показывается.
import { useRecovery } from "../../api/projects-client.js";
import { t } from "../../i18n/index.js";
import { Link } from "../Link.js";

export function RecoveryBanner() {
  const q = useRecovery();
  const boot = q.data?.boot;
  if (!boot || !boot.crashed || boot.acknowledged_at) return null;
  const s = boot.summary ?? { recovered: 0, blocked: 0, quarantined: q.data!.quarantined.length, failed: 0 };
  return (
    <div className="panel" role="status" data-testid="recovery-banner">
      <p>{t("recovery.banner", { recovered: s.recovered, blocked: s.blocked, quarantined: s.quarantined })}</p>
      <Link to={{ name: "recovery" }}>{t("recovery.open")}</Link>
    </div>
  );
}
