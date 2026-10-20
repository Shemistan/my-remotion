# Cube Navigation 3D (bit) — `remotion-bits/bit-scene-3d-cube-nav`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `3d-camera` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Куб из шести граней с подписями (TEXT, MOTION, PARTICLES, GRADIENTS, 3D,
BITS): камера стартует с изометрического вида, облетает каждую грань
фронтально и возвращается в изометрию.

## Когда использовать

Обзор шести возможностей/модулей продукта, «у этой задачи шесть сторон»,
навигация по разделам. Для плоского списка — `bit-list-reveal`; для
кольца карточек — `bit-carousel-3d`.

## Фразы из озвучки

- «у продукта шесть ключевых возможностей»
- «посмотрим на задачу с каждой стороны»
- «всё складывается в единое целое»

## Визуальный стиль

Фон `#111`, грани 35 vmin цветов `var(--color-surface-light/dark)` и
`var(--color-primary)` с внутренней тенью, заголовок 15 % размера грани;
480 кадров, 1920×1080, `perspective` 2000.

## Входные данные

Без props: массив `faces` `{id, color, title, rot, pos}` зашит; шаги камеры
вычисляются `getCameraStep` (отступ 0.8 размера от грани), изометрия
`rotateX` 35.264°, `rotateY` 45°, `rotateOrder` "yxz". Вынести заголовки и
цвета в props для переиспользования.

## Анимации

`Scene3D` (`transitionDuration` 40, `stepDuration` 60, `easeInOutCubic`):
8 шагов (start, 6 граней, end); старт с `opacity [0,1]`; грани —
статичные `Element3D` (`centered`).

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/scene-3d/CubeNavigation.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/cube-navigation-3d.mdx` — документация

## Зависимости

`remotion-bits` (`Scene3D`, `Step`, `Element3D`, `useViewportRect`);
registry: `scene-3d` (use-viewport-rect не указан). См. `remotion-bits/scene-3d`.

## Совместимость и адаптация

`native`. Определить CSS-переменные `--color-surface-light`,
`--color-surface-dark`, `--color-primary`. У граней «right/back/left»
поворот по Z (90/180/−90) — подписи на них повёрнуты, это задумано
шагами камеры с тем же поворотом.

## Паттерны

`system-structure`, `sequence-steps`, `spatial`
