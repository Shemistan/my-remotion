// Строки вкладки «Таймлайн» видеопроекта (Task 45). `timeline.*` занят таймлайном сцены — здесь `projectTimeline.*`. Подмешивается в `ru` (Task 35′).
export const ruTimeline = {
  "video.tab.timeline": "Таймлайн",
  "projectTimeline.stub": "Раздел готовится: здесь будет таймлайн ролика со сценами по словам.",
  "job.type.timeline.build": "Сборка таймлайна",
  "job.type.timeline.preview": "Превью таймлайна",
} as const satisfies Record<string, string>;
