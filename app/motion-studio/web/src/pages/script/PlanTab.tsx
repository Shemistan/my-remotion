// Вкладка «План» сценария (S8): текст с подсветкой, карточки сцен, проблемы, «Утвердить и сгенерировать».
// S1 — заглушка без содержимого; сигнатуру не менять. Состояние — от ScriptWorkspace (`useScriptState`).
import type { ReactElement } from "react";
import type { ScriptStateDto } from "@ms/contracts";

export const PlanTab: (props: { state: ScriptStateDto; onGenerated: () => void }) => ReactElement = () => <div data-tab="plan" />;
