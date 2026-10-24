// Вкладка «План» сценария (S8): текст с подсветкой, карточки сцен, проблемы, «Утвердить и сгенерировать».
// S1 — заглушка без содержимого; сигнатуру не менять.
import type { ReactElement } from "react";
import type { ProjectDto } from "@ms/contracts";

export const PlanTab: (props: { project: ProjectDto; onGenerated: () => void }) => ReactElement = () => <div data-tab="plan" />;
