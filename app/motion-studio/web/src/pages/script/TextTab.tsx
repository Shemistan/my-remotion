// Вкладка «Текст» сценария (S8): блоки, счётчик слов и время чтения, «Сохранить», «Построить план».
// S1 — заглушка без содержимого; сигнатуру не менять. Состояние — от ScriptWorkspace (`useScriptState`).
import type { ReactElement } from "react";
import type { ScriptStateDto } from "@ms/contracts";

export const TextTab: (props: { state: ScriptStateDto; onPlan: () => void }) => ReactElement = () => <div data-tab="text" />;
