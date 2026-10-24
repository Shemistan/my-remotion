// Строки сценарного проекта: вкладки «Сцены» и «Экспорт» (заполняет S9). Подмешивается в `ru`.
export const ruScriptOutput = {
  // S5: замечание проверки spec сцены сценария (окно речи, Р19)
  "qa.code.speech_window": "действие вне окна речи или короткое удержание",
  // S5: ошибки пакета генерации (idempotency_key_reused и unknown_item — общие, в ru.ts)
  "errors.no_style": "Сначала задайте стиль проекта.",
} as const satisfies Record<string, string>;
