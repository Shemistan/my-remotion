# Chord — `nivo/chord`

| Поле | Значение |
|---|---|
| Репозиторий | `nivo` (`templates/infografika/nivo`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `engine:other`, `engine:d3`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md, package.json) |

## Что визуализирует

Хордовая диаграмма (d3-chord): группы — дуги по окружности, потоки между
ними — ленты (ribbons), ширина ленты пропорциональна величине.

## Когда использовать

Взаимные потоки между 4–10 сущностями: миграция между странами, переходы
пользователей между продуктами, обмен между отделами. Направленный поток
по этапам лучше показать `nivo/sankey`.

## Фразы из озвучки

- «пользователи активно переходят между нашими тремя сервисами»
- «больше всего обмена — между Европой и Азией»
- «все отделы связаны друг с другом»

## Визуальный стиль

Круг с полупрозрачными цветными лентами (`ribbonOpacity` 0.5), дуги с
обводкой, подписи по окружности. Эффектно, «журнальный» вид.

## Входные данные

`ChordSvgProps` (`types.ts`, defaults в `defaults.ts`): `data: number[][]`
(квадратная матрица), `keys: string[]`, `width`, `height`, `margin`,
`padAngle` 0, `innerRadiusRatio` 0.9, `innerRadiusOffset` 0, `colors`,
`arcOpacity` 1, `activeArcOpacity`, `inactiveArcOpacity` 0.15,
`arcBorderWidth` 1, `arcBorderColor`, `ribbonOpacity` 0.5,
`activeRibbonOpacity`, `inactiveRibbonOpacity`, `ribbonBorderWidth` 1,
`ribbonBorderColor`, `ribbonBlendMode` normal, `enableLabel` true, `label`
`'id'`, `labelOffset` 12, `labelRotation` 0, `labelTextColor`,
`valueFormat`, `legends`, `layers` (`ribbons, arcs, labels, legends`),
`animate` (true), `motionConfig` (`'gentle'`). `ChordCanvas` — с
`pixelRatio`, без переходов.

## Анимации

Пружины по `startAngle/endAngle` дуг и углам источника/цели лент, по
цвету и прозрачности (`ArcAnimatedProps`, `RibbonAnimatedProps`).

## Исходники и документация

- `templates/infografika/nivo/packages/chord/src/Chord.tsx`, `types.ts`, `defaults.ts`
- `templates/infografika/nivo/website/src/data/components/chord/meta.yml`
- `templates/infografika/nivo/storybook/stories/chord/Chord.stories.tsx`

## Зависимости

`@nivo/chord`, `@nivo/core`, `@nivo/legends`, `@react-spring/web`, `d3-chord`, `d3-shape`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Появление — `rotate`/`opacity`/`clip-path` обёртки. Умножать всю матрицу
на прогресс бесполезно: d3-chord нормирует углы, и картинка не изменится.
Пошаговый показ лент — custom layer (`ribbons`, `ribbonGenerator` в
`CustomLayerProps`) с `opacity` по кадру.

## Паттерны

`relationships`, `system-structure`
