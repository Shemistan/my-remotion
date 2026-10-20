# SwarmPlot — `nivo/swarmplot`

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

Swarm/beeswarm: каждая запись — кружок на оси значения, по группам.
Кружки не перекрываются (коллизии d3-force), размер может зависеть от
третьего поля.

## Когда использовать

Распределение множества отдельных объектов по группам: цены сделок по
регионам, оценки по командам. Сводная статистика — `nivo/boxplot`, две
непрерывные оси — `nivo/scatterplot`.

## Фразы из озвучки

- «каждая точка — отдельная сделка»
- «в Азии сделки мельче, но их гораздо больше»
- «вот как распределились оценки сотрудников»

## Визуальный стиль

Плотные «рои» кружков, цвет по группе, оси с сеткой. Живой, «облачный»
вид.

## Входные данные

`SwarmPlotSvgProps` (`types.ts`): `data`, `groups: string[]`
(обязательно), `width`, `height`, `margin`, `id`, `value`, `valueScale`
linear|time, `valueFormat`, `groupBy`, `size` (число | `{key, values,
sizes}` | функция), `spacing`, `layout` horizontal|vertical, `gap`,
`forceStrength`, `simulationIterations`, `colors`, `colorBy`,
`borderWidth`, `borderColor`, `enableGridX/Y`, `gridXValues/gridYValues`,
`axisTop/Right/Bottom/Left`, `annotations`, `layers` + custom,
`circleComponent`, `useMesh`, `animate`, `motionConfig`, `isInteractive`.
`SwarmPlotCanvas`: `renderCircle`, `pixelRatio`.

## Анимации

Кружки переходят пружинами (`CircleProps.style`: x, y, radius, color,
opacity). Симуляция синхронна: `compute.ts` вызывает
`forceSimulation(...).stop()` и `tick(simulationIterations)` внутри
`useMemo`.

## Исходники и документация

- `templates/infografika/nivo/packages/swarmplot/src/SwarmPlot.tsx`, `compute.ts`, `hooks.ts`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/swarmplot/meta.yml`
- `templates/infografika/nivo/storybook/stories/swarmplot/SwarmPlot.stories.tsx`

## Зависимости

`@nivo/swarmplot`, `@nivo/core`, `@nivo/axes`, `@nivo/voronoi`, `@react-spring/web`, `d3-force ^2.0.1`, `d3-scale`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Раскладка считается на каждый рендер с новыми данными. Начальные позиции
d3 ставит филлотаксисом (без `Math.random`), так что при одинаковых
данных результат один и тот же. Случайный `jiggle` срабатывает только при
точном совпадении точек. Поэтому данные **не менять по кадру**, иначе рой
пересчитывается и «скачет». Появление — custom `circleComponent` с `r`/
`opacity` от кадра и порядка узла.

## Паттерны

`comparison`, `quantities`
