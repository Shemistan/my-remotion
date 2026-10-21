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
 * Контент: safe area, сжатая под наезд ближнего слоя параллакса (1 + 0.08 · 1.3 = 1.104),
 * плюс воздух ~40 px: в последнем кадре ни один слой не подходит к краю зоны вплотную.
 */
export const CONTENT = { x: 235, y: 160, w: 1450, h: 760 };

const COL_GAP = 40;
const TEXT_W = 700;
const CARDS_H = 180;

/** Области элементов (px кадра): кикер, заголовок, подзаголовок, бейдж, график, карточки. */
export const REGIONS = {
  kicker: { x: CONTENT.x, y: CONTENT.y, w: 600, h: 44 },
  headline: { x: CONTENT.x, y: CONTENT.y + 64, w: TEXT_W, h: 176 },
  subtitle: { x: CONTENT.x, y: CONTENT.y + 260, w: TEXT_W, h: 124 },
  badge: { x: CONTENT.x, y: CONTENT.y + 410, w: 520, h: 100 },
  chart: { x: CONTENT.x + TEXT_W + COL_GAP, y: CONTENT.y + 10, w: CONTENT.w - TEXT_W - COL_GAP, h: 520 },
  cards: { x: CONTENT.x, y: CONTENT.y + CONTENT.h - CARDS_H, w: CONTENT.w, h: CARDS_H },
} as const;

/** Первая карточка ряда (4 колонки, gutter 32 у dark-premium): область профиля входа каскада. */
export const CARD0 = { x: REGIONS.cards.x, y: REGIONS.cards.y, w: Math.floor((REGIONS.cards.w - 3 * 32) / 4), h: REGIONS.cards.h };

/** Вид входа каждого элемента (как entrance в spec). */
export const ENTRANCES = { kicker: "type", headline: "mask", subtitle: "blur", badge: "pop", chart: "draw", cards: "rise" } as const;
