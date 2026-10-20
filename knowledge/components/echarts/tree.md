# ECharts tree — `echarts/tree`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | chart-type |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE); `layoutHelper.ts` — код d3, BSD-3 |

## Что визуализирует

Дерево узлов: ортогональная раскладка (LR/TB/RL/BT) или радиальная,
кривые или ломаные рёбра, подписи, сворачиваемые ветки.

## Когда использовать

Оргструктура, дерево решений, состав продукта. Доли в иерархии —
`echarts/treemap`, `echarts/sunburst`.

## Фразы из озвучки

- «компания делится на три направления»
- «от корня решения расходятся две ветки»
- «у каждого модуля — свои подмодули»

## Визуальный стиль

Узлы `emptyCircle` 7 px, рёбра width 1.5 `curveness` 0.5; аккуратная схема.

## Входные данные

`TreeSeriesOption`: `data` ([{name, value, children, collapsed}]),
`layout` (`'orthogonal'`|`'radial'`), `orient` (`'LR'`), `edgeShape`
(`'curve'`|`'polyline'`), `edgeForkPosition` ('50%'), `expandAndCollapse`
(true), `initialTreeDepth` (2), `symbol`, `symbolSize` (7), `lineStyle`,
`label`, `leaves`, `left/top/right/bottom` ('12%'), `roam` (false),
`zoom` (1), `center`.

## Анимации

Узлы выезжают из родителя, рёбра растут; раскрытие веток кликом с
переходом; часы zrender.

## Исходники и документация

- `templates/infografika/echarts/src/chart/tree/TreeSeries.ts`
- `templates/infografika/echarts/src/chart/tree/TreeView.ts`
- `templates/infografika/echarts/src/chart/tree/layoutHelper.ts` — раскладка
- `templates/infografika/echarts/test/tree-vertical.html`, `test/tree-radial.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`, `expandAndCollapse: false` (или явные
`collapsed`). Поуровневое проявление: при полной раскладке —
прозрачность `itemStyle`/`lineStyle`/`label` узлов по глубине от кадра
(раскладка стабильна); смена `collapsed` по кадру перестраивает дерево
скачком. Общий рецепт — `knowledge/compatibility/echarts.md`.

## Паттерны

`system-structure`, `relationships`
