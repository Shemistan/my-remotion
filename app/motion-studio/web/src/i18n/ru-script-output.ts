// Строки сценарного проекта: вкладки «Сцены» и «Экспорт» (заполняет S9). Подмешивается в `ru`.
export const ruScriptOutput = {
  // S5: замечание проверки spec сцены сценария (окно речи, Р19)
  "qa.code.speech_window": "действие вне окна речи или короткое удержание",
} as const satisfies Record<string, string>;
