# Mosaic Reframe (bit) — `remotion-bits/bit-mosaic-reframe`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `media` |
| Совместимость с Remotion | native |
| Флаги | `external-service` |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Двенадцать фото-плиток: ровная сетка 4×3 → мозаика с крупным «главным»
кадром 2×2, четырьмя средними и полосой из семи маленьких → диагональный
каскад повёрнутых квадратов с глубиной. Плитки меняют и позицию, и размер
(обрезкой).

## Когда использовать

Галерея работ, портфолио, «одна история среди многих» (выделение главного
кадра), коллаж фото-материалов. Для бесконечной ленты — `bit-scrolling-columns`.

## Фразы из озвучки

- «из сотен проектов выделим главный»
- «вот наша галерея работ»
- «каждая фотография — отдельная история»

## Визуальный стиль

Фон `#09090b`, контейнер `vmin*75`, плитки с радиусом `vmin*1.2` и тенью,
лёгкая перспектива; smoothstep/easeInOutCubic, 270 кадров, 1080×1080,
fade-in/out всей композиции.

## Входные данные

Без props: `TILE_COUNT = 12`, раскладки `buildConfigA/B/C` (x, y, w, h,
rotate), `gap = vmin*1.5`; картинки
`https://picsum.photos/seed/${seed}/${w}/${h}`.

## Анимации

Позиция: `StaggeredMotion` `x/y/rotate: [A, B, hold(60), C]`, `z/rotateX`
только на третьей фазе, `frames: [90, 240]`, `delay: index*2`. Размер:
`interpolate(frame, …)` из `remotion` → `clipPath: inset(...)`. Общая
opacity `[0,1,1,0]` по кадрам 0/20/255/270.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/staggered-motion/MosaicReframe.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/mosaic-reframe.mdx` — страница bit

## Зависимости

`remotion` (`useCurrentFrame`, `interpolate`); `remotion-bits`:
`StaggeredMotion`, `hold`, `useViewportRect`.

## Совместимость и адаптация

Анимация `native`. Картинки — обычный `<img>` с внешнего picsum.photos:
заменить на `Img` из `remotion` и локальные `staticFile`, иначе кадры
могут уйти без изображений. Фото подставить свои (12 штук).

## Паттерны

`transformation`, `key-point-emphasis`, `comparison`
