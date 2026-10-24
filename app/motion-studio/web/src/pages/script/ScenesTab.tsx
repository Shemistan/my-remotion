// Вкладка «Сцены» сценария (S9): карточки сцен, статусы задач, превью, «Доработать», 16:9 / 9:16.
// S1 — заглушка без содержимого; сигнатуру не менять. Состояние — от ScriptWorkspace (`useScriptState`).
import type { ReactElement } from "react";
import type { ScriptStateDto } from "@ms/contracts";

export const ScenesTab: (props: { state: ScriptStateDto }) => ReactElement = () => <div data-tab="scenes" />;
