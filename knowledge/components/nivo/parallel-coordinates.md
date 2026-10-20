# ParallelCoordinates — `nivo/parallel-coordinates`

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

Параллельные координаты: несколько вертикальных (или горизонтальных) осей
с собственными шкалами. Каждый объект — ломаная через все оси.
Поддерживается группировка с раскраской по группе. `ParallelCoordinatesCanvas` —
для больших наборов.

## Когда использовать

Сравнение объектов по многим метрикам сразу: модели авто, тарифы,
кандидаты. Если метрик 3–8 и объектов мало — `nivo/radar` проще читается.

## Фразы из озвучки

- «сравним пять моделей сразу по шести параметрам»
- «дорогие тарифы выигрывают по скорости, но проигрывают по цене»
- «видно, как группы расходятся по каждой метрике»

## Визуальный стиль

Тонкие полупрозрачные линии (`lineOpacity`), оси с тиками и подписями.
Аналитический, «научный».

## Входные данные

`ParallelCoordinatesProps` (`types.ts`): `data: {id,…}[]`, `variables:
{id, label?, value (числовой ключ), valueFormat?, min?, max?,
ticksPosition?, tickValues?, tickSize?, tickPadding?, tickRotation?,
tickFormat?, legendPosition?, legendOffset?}[]`, `width`, `height`,
`margin`, `groupBy`, `groups`, `layout` horizontal|vertical, `curve`,
`colors`, `lineWidth`, `lineOpacity`, `axesTicksPosition`, `legends`,
`forwardLegendData`, `layers` (`axes, lines, legends` + custom),
`animate`, `motionConfig`, `isInteractive`.

## Анимации

Линии переходят через react-spring (`MotionProps` в `CommonProps`).

## Исходники и документация

- `templates/infografika/nivo/packages/parallel-coordinates/src/svg/ParallelCoordinates.tsx`, `src/types.ts`
- `templates/infografika/nivo/website/src/data/components/parallel-coordinates/meta.yml`
- `templates/infografika/nivo/storybook/stories/parallel-coordinates/ParallelCoordinates.stories.tsx`

## Зависимости

`@nivo/parallel-coordinates`, `@nivo/core`, `@nivo/axes`, `@nivo/legends`, `@react-spring/web`, `d3-shape`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
`min/max` у каждой переменной задать явно. Появление линий — custom layer
(`computedData`, `lineGenerator`) с `stroke-dashoffset` или поочерёдной
`opacity` по кадру.

## Паттерны

`comparison`, `relationships`
