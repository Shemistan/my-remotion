// Строки вкладки «Сцены» видеопроекта (Task 40: сцены по плану, пакет, Approval C, превью в контексте). Подмешивается в `ru` (Task 35′).
export const ruVideoScenes = {
  "video.tab.scenes": "Сцены",
  "videoScenes.stub": "Раздел готовится: здесь будут сцены по плану — генерация, правка и утверждение.",
  "job.type.scene.preview_context": "Превью в контексте",
} as const satisfies Record<string, string>;
