# ECharts treemap — `echarts/treemap`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE); `treemapLayout.ts` — код d3, BSD-3 |

## Что визуализирует

Дерево-карта: площадь плитки по значению (squarify, `squareRatio` —
золотое сечение), вложенные уровни с заголовками `upperLabel`,
градации цвета по уровням, хлебные крошки.

## Когда использовать

Бюджет, доли рынка, размер модулей. До 5–6 частей — `echarts/pie`;
кольцами — `echarts/sunburst`; React — `recharts/treemap`.

## Фразы из озвучки

- «из чего складывается бюджет города»
- «самый большой кусок рынка занимает лидер»
- «основную массу кода составляют три модуля»

## Визуальный стиль

Плотная мозаика, белые границы, подписи внутри (`overflow: 'truncate'`).

## Входные данные

`TreemapSeriesOption`: `data` ([{name, value, children, color}]), `sort`
(true), `squareRatio`, `leafDepth`, `levels` ([{itemStyle, upperLabel,
colorSaturation}]), `label` ({position 'inside'}), `upperLabel` ({show
false, height 20}), `itemStyle` ({gapWidth, borderWidth,
borderColorSaturation}), `breadcrumb` ({show true}), `roam` (true),
`nodeClick` (`'zoomToNode'`), `zoomToNodeRatio`, `clipWindow`,
`left/top/right/bottom`.

## Анимации

В `defaultOption` `animation: true`, `animationDurationUpdate` 900 мс,
`quinticInOut`; переходы плиток и drill-down кликом.

## Исходники и документация

- `templates/infografika/echarts/src/chart/treemap/TreemapSeries.ts`
- `templates/infografika/echarts/src/chart/treemap/TreemapView.ts`
- `templates/infografika/echarts/src/chart/treemap/treemapLayout.ts`
- `templates/infografika/echarts/test/treemap-simple.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. Ряд сам включает анимацию — `animation: false` ставить **на
ряду**; `breadcrumb.show: false`, `roam: false`, `nodeClick: false`.
Появление плиток — `itemStyle.opacity` по индексу от кадра в данных.
Общий рецепт — `knowledge/compatibility/echarts.md`.

## Паттерны

`system-structure`, `quantities`, `comparison`
