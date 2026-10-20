# ECharts sankey — `echarts/sankey`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | chart-type |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE) |

## Что визуализирует

Диаграмма потоков: узлы-столбики по уровням и ленты, толщина ленты —
величина потока; горизонтальная или вертикальная.

## Когда использовать

Бюджет, путь пользователя, энергобаланс. Цепочка без ветвлений —
`echarts/funnel`; React-вариант — `recharts/sankey`.

## Фразы из озвучки

- «откуда приходят деньги и куда они уходят»
- «из всех визитов только часть доходит до покупки»
- «основной поток идёт через поиск»

## Визуальный стиль

Узлы width 20, серые ленты opacity 0.2 `curveness` 0.5 (или
`lineStyle.color` `'source'`/`'gradient'`), подписи справа.

## Входные данные

`SankeySeriesOption`: `data`/`nodes` ([{name, value, depth,
itemStyle}]), `links`/`edges` ([{source, target, value}]), `orient`
(`'horizontal'`), `nodeWidth` (20), `nodeGap` (8), `nodeAlign`
(`'justify'`|`'left'`|`'right'`), `layoutIterations` (32), `sort`
(`'desc'`|null), `levels` ([{depth, itemStyle, lineStyle}]),
`lineStyle`, `label` ({position 'right'}), `edgeLabel`, `draggable`
(true), `roam` (false), `left/top/right/bottom`.

## Анимации

Проявление узлов и лент на входе; перетаскивание узлов, подсветка
соседей.

## Исходники и документация

- `templates/infografika/echarts/src/chart/sankey/SankeySeries.ts`
- `templates/infografika/echarts/src/chart/sankey/SankeyView.ts`
- `templates/infografika/echarts/test/sankey.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`, `draggable: false`. Поуровневое
появление — `levels[d].lineStyle.opacity`/`itemStyle.opacity` от кадра:
раскладка не меняется. Срез `links` переставит узлы. Общий рецепт —
`knowledge/compatibility/echarts.md`.

## Паттерны

`relationships`, `transformation`, `cause-effect`, `system-structure`
