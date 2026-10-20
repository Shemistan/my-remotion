# ScatterPlot — `nivo/scatterplot`

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

Точечная диаграмма: серии точек в координатах x/y, опционально третье
измерение — размер точки (`nodeSize` по ключу). Шкалы linear, time, log.
Оси, сетка, маркеры, аннотации. `ScatterPlotCanvas` — для тысяч точек.

## Когда использовать

Связь двух метрик, корреляция, выбросы, кластеры: цена против качества,
затраты против результата. Для распределения по группам —
`nivo/swarmplot`.

## Фразы из озвучки

- «чем выше цена, тем выше рейтинг — но есть исключения»
- «вот этот выброс — наш самый успешный проект»
- «точки группируются в три кластера»

## Визуальный стиль

Круглые точки по цвету серии, `blendMode` для наложения, чистые оси.
Научно-аналитический.

## Входные данные

`ScatterPlotSvgProps` (`types.ts`): `data: {id, data: {x, y}[]}[]`,
`width`, `height`, `margin`, `nodeId`, `xScale`, `xFormat`, `yScale`,
`yFormat`, `nodeSize` (число | `{key, values, sizes}` | функция), `colors`,
`blendMode`, `enableGridX/Y`, `gridXValues/gridYValues`,
`axisTop/Right/Bottom/Left`, `markers`, `annotations`, `legends`,
`layers` + custom, `nodeComponent`, `useMesh`, `debugMesh`, `animate`,
`motionConfig`, `isInteractive`. Canvas: `renderNode`, `pixelRatio`.

## Анимации

Узлы переходят пружинами react-spring (позиция, размер, цвет).

## Исходники и документация

- `templates/infografika/nivo/packages/scatterplot/src/ScatterPlot.tsx`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/scatterplot/meta.yml`
- `templates/infografika/nivo/storybook/stories/scatterplot/ScatterPlot.stories.tsx`

## Зависимости

`@nivo/scatterplot`, `@nivo/core`, `@nivo/axes`, `@nivo/scales`, `@nivo/annotations`, `@react-spring/web`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, `useMesh={false}`,
явные размеры, `xScale/yScale` с явными `min/max`. Появление точек —
поочерёдно по кадру (срез серий) или custom `nodeComponent` с `r`/`opacity`
из кадра. Перелёт — интерполяция `x/y` в данных между двумя состояниями.

## Паттерны

`relationships`, `comparison`, `quantities`
