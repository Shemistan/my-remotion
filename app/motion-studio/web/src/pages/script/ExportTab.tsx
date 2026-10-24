// Вкладка «Экспорт» сценария (S9): сборка папок 16:9 / 9:16, пакеты, шпаргалка, «Показать в Finder».
// S1 — заглушка без содержимого; сигнатуру не менять. Состояние — от ScriptWorkspace (`useScriptState`).
import type { ReactElement } from "react";
import type { ScriptStateDto } from "@ms/contracts";

export const ExportTab: (props: { state: ScriptStateDto }) => ReactElement = () => <div data-tab="export" />;
