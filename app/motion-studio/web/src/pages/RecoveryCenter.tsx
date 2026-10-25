// Центр восстановления (Task 47): отчёт последнего запуска, прерванные и заблокированные задачи.
// Task 35′ — заглушка: страница зарегистрирована в маршрутах, тела нет.
import { t } from "../i18n/index.js";

export function RecoveryCenter() {
  return (
    <div className="page">
      <h1>{t("recovery.title")}</h1>
      <p className="muted">{t("recovery.stub")}</p>
    </div>
  );
}
