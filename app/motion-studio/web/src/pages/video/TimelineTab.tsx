// Вкладка «Таймлайн» видеопроекта (Task 45: таймлайн ролика, перемещения по якорям, превью).
// Task 35′ — заглушка: вкладка зарегистрирована в VideoWorkspace, тела нет.
import type { ReactElement } from "react";
import { t } from "../../i18n/index.js";
import type { VideoTabProps } from "./tab-props.js";

export const TimelineTab: (props: VideoTabProps) => ReactElement = () => (
  <section className="panel" data-tab="timeline">
    <p className="muted">{t("projectTimeline.stub")}</p>
  </section>
);
