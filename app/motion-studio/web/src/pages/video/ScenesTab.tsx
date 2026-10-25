// Вкладка «Сцены» видеопроекта (Task 40: сцены по плану, пакет генерации, Approval C, превью в контексте).
// Task 35′ — заглушка: вкладка зарегистрирована в VideoWorkspace, тела нет.
import type { ReactElement } from "react";
import { t } from "../../i18n/index.js";
import type { VideoTabProps } from "./tab-props.js";

export const ScenesTab: (props: VideoTabProps) => ReactElement = () => (
  <section className="panel" data-tab="scenes">
    <p className="muted">{t("videoScenes.stub")}</p>
  </section>
);
