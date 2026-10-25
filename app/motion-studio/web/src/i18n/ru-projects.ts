// Строки управления проектами и центра восстановления (Task 47). Подмешивается в `ru` (Task 35′).
export const ruProjects = {
  "recovery.title": "Восстановление",
  "recovery.stub": "Раздел готовится: здесь будут прерванные задачи и отчёт о последнем запуске.",
  "job.type.trash.purge": "Очистка корзины",
} as const satisfies Record<string, string>;
