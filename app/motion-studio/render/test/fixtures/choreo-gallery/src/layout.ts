// Раскладка галереи хореографии в px кадра 1920×1080 (камера в покое). Общая для сцены и
// e2e-теста: тест сравнивает кадры в областях элементов. Без импортов — тест читает файл
// напрямую.

/** Поля из settings.json: safeRect = { x: 115, y: 86, w: 1690, h: 908 }. */
export const SAFE = { x: 0.06, y: 0.08 };

/** Наезд камеры до 1.08 (= camera.max_scale dark-premium) за всю сцену. */
export const CAMERA = [
  { frame: 0, scale: 1, x: 0, y: 0 },
  { frame: 179, scale: 1.08, x: 0, y: 0 },
];

/**
 * Контент: safe area, сжатая под наезд ближнего слоя параллакса (1 + 0.08 · 1.3 = 1.104):
 * в последнем кадре ни один слой не выходит за безопасную зону.
 */
export const CONTENT = { x: 195, y: 129, w: 1530, h: 822 };

const COL_GAP = 40;
const TEXT_W = 760;

/** Области элементов (px кадра): кикер, заголовок, подзаголовок, бейдж, график, карточки. */
export const REGIONS = {
  kicker: { x: CONTENT.x, y: CONTENT.y, w: 620, h: 44 },
  headline: { x: CONTENT.x, y: CONTENT.y + 64, w: TEXT_W, h: 176 },
  subtitle: { x: CONTENT.x, y: CONTENT.y + 264, w: TEXT_W, h: 124 },
  badge: { x: CONTENT.x, y: CONTENT.y + 420, w: 560, h: 104 },
  chart: { x: CONTENT.x + TEXT_W + COL_GAP, y: CONTENT.y + 10, w: CONTENT.w - TEXT_W - COL_GAP, h: 560 },
  cards: { x: CONTENT.x, y: CONTENT.y + CONTENT.h - 200, w: CONTENT.w, h: 200 },
} as const;
