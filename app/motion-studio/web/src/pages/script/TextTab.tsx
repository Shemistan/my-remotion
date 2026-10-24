// Вкладка «Текст» сценария (S8): блоки, счётчик слов и время чтения, «Сохранить», «Построить план».
// S1 — заглушка без содержимого; сигнатуру не менять.
import type { ReactElement } from "react";
import type { ProjectDto } from "@ms/contracts";

export const TextTab: (props: { project: ProjectDto; onPlan: () => void }) => ReactElement = () => <div data-tab="text" />;
