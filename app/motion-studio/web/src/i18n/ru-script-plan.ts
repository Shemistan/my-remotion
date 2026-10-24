// Строки сценарного проекта: создание, вкладки «Текст» и «План», коды ошибок API сценария
// (спека §7). Подмешивается в `ru`; вкладки «Сцены» и «Экспорт» — в `ru-script-output.ts`.
export const ruScriptPlan = {
  "dashboard.createScript": "Сценарий",
  "project.kind.script": "Сценарий",

  "scriptPlan.tabs": "Разделы сценария",
  "scriptPlan.tab.text": "Текст",
  "scriptPlan.tab.plan": "План",
  "scriptPlan.tab.scenes": "Сцены",
  "scriptPlan.tab.export": "Экспорт",

  "errors.not_implemented": "Эта функция ещё не готова.",
  "errors.not_script_project": "Проект не сценарный.",
  "errors.empty_block": "Пустой блок текста: удалите его или впишите текст.",
  "errors.script_too_long": "Текст слишком длинный: не больше 6000 слов.",
  "errors.no_script": "Сначала сохраните текст сценария.",
  "errors.bad_range": "Неверный фрагмент: начало после конца или фрагмент в двух блоках.",
  "errors.overlap": "Фрагмент пересекается с другой сценой.",
  "errors.no_items": "В плане нет принятых сцен.",
  "errors.overlay_mp4": "Прозрачный фон возможен только в ProRes 4444.",
  "errors.overlay_unsupported": "Для этой версии прозрачный экспорт недоступен.",
} as const satisfies Record<string, string>;
