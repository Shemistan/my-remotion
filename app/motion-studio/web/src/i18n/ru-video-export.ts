// Строки вкладки «Экспорт» видеопроекта (Task 5L: папка клипов; Task 45: финал). Подмешивается в `ru` (Task 35′).
export const ruVideoExport = {
  "video.tab.export": "Экспорт",
  "videoExport.stub": "Раздел готовится: здесь будут папка клипов со шпаргалкой и экспорт финального ролика.",
  "job.type.video.package": "Папка клипов",
  "job.type.final.render": "Финальный рендер",
  "job.type.final.reproduce": "Повтор финала",
} as const satisfies Record<string, string>;
