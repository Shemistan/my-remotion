// Строки диагностики: doctor в UI, журналы, каталог ошибок (Task 48). Подмешивается в `ru` (Task 35′).
export const ruDiagnostics = {
  "nav.diagnostics": "Диагностика",
  "diagnostics.title": "Диагностика",
  "diagnostics.stub": "Раздел готовится: здесь будут проверка окружения, журналы задач и каталог ошибок.",
  "job.type.cache.gc": "Уборка кэша",
} as const satisfies Record<string, string>;
