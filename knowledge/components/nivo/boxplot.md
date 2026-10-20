# BoxPlot — `nivo/boxplot`

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

«Ящик с усами»: по сырым наблюдениям строится распределение —
межквартильный ящик, медиана, усы до крайних квантилей. Группы и
подгруппы стоят рядом.

## Когда использовать

Нужно показать разброс и сравнить распределения: зарплаты по грейдам,
время ответа по сервисам. Для одного числа на категорию лучше `nivo/bar`,
для облака точек — `nivo/swarmplot`.

## Фразы из озвучки

- «разброс зарплат у сеньоров гораздо шире»
- «медиана почти не изменилась, а вот хвосты выросли»
- «у половины пользователей время ответа укладывается в 200 мс»

## Визуальный стиль

Строгий научно-аналитический: прямоугольники, линия медианы темнее основного
цвета (`darker 2`), усы с засечками.

## Входные данные

`BoxPlotSvgProps` (`types.ts`, defaults в `props.ts`): `data` (наблюдения),
`width`, `height`, `value` (`'value'`), `groupBy` (`'group'`), `subGroupBy`
(null), `groups`, `subGroups`, `quantiles` (`[0.1,0.25,0.5,0.75,0.9]`),
`layout` vertical, `minValue/maxValue` auto, `valueScale` linear,
`indexScale` band, `padding` 0.1, `innerPadding` 6, `opacity`,
`activeOpacity`, `inactiveOpacity` 0.25, `borderRadius`, `borderWidth`,
`medianWidth` 2, `medianColor`, `whiskerWidth` 2, `whiskerColor`,
`whiskerEndSize` 0.6, `colorBy` `group|subGroup` (subGroup), `colors`,
`axisTop/Right/Bottom/Left`, `enableGridX/Y`, `markers`, `annotations`,
`legends`, `layers`, `boxPlotComponent`, `valueFormat`, `animate` (true),
`motionConfig` (`'default'`).

## Анимации

`useBoxPlotTransition`: `transform`, `valueInterval`, `valueDistance0..4`,
цвета и `opacity` анимируются react-spring.

## Исходники и документация

- `templates/infografika/nivo/packages/boxplot/src/BoxPlot.tsx`, `types.ts`, `props.ts`
- `templates/infografika/nivo/website/src/data/components/boxplot/meta.yml`
- `templates/infografika/nivo/storybook/stories/boxplot/BoxPlot.stories.tsx`

## Зависимости

`@nivo/boxplot`, `@nivo/core`, `@nivo/axes`, `@nivo/legends`, `@react-spring/web`, d3.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Появление — обёрткой (`scaleY` от медианы, `opacity`) или сжатием значений
к медиане по кадру. Шкалу (`minValue/maxValue`) зафиксировать.

## Паттерны

`comparison`, `quantities`
