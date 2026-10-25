// Вкладка «Экспорт» видеопроекта (Task 5L: папка клипов со шпаргалкой; Task 45: экспорт финала).
// Task 35′ — заглушка: вкладка зарегистрирована в VideoWorkspace, тела нет.
import type { ReactElement } from "react";
import { t } from "../../i18n/index.js";
import type { VideoTabProps } from "./tab-props.js";

export const ExportTab: (props: VideoTabProps) => ReactElement = () => (
  <section className="panel" data-tab="export">
    <p className="muted">{t("videoExport.stub")}</p>
  </section>
);
