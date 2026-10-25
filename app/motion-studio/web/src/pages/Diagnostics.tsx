// Диагностика (Task 48): doctor в UI, журналы задач, трассировка, каталог ошибок.
// Task 35′ — заглушка: страница зарегистрирована в маршрутах, тела нет.
import { t } from "../i18n/index.js";

export function Diagnostics() {
  return (
    <div className="page">
      <h1>{t("diagnostics.title")}</h1>
      <p className="muted">{t("diagnostics.stub")}</p>
    </div>
  );
}
