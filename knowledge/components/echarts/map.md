# ECharts map — `echarts/map`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other`, `async-data` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE); у GeoJSON — своя |

## Что визуализирует

Картограмма: регионы из GeoJSON или SVG, окрашенные по значению
(через `visualMap`), подписи регионов, несколько рядов на одной карте.

## Когда использовать

Сравнение регионов/стран по показателю, география продаж. Точки —
`echarts/scatter`/`echarts/effect-scatter` по geo, маршруты —
`echarts/lines`.

## Фразы из озвучки

- «больше всего клиентов — на юге страны»
- «продажи растут в каждом регионе»
- «посмотрим на карту присутствия»

## Визуальный стиль

Плоские полигоны с серыми границами, заливка по шкале.

## Входные данные

`MapSeriesOption` (+ `GeoCommonOptionMixin`): `map` (имя из
`echarts.registerMap`), `data` ([{name, value}]), `nameProperty`,
`nameMap`, `geoIndex`, `mapValueCalculation`
(`'sum'`|`'average'`|`'min'`|`'max'`), `showLegendSymbol`, `roam`,
`center`, `zoom`, `aspectScale`, `boundingCoords`,
`layoutCenter`/`layoutSize`, `left`/`top` (`'center'`), `itemStyle`,
`label`.

## Анимации

Переход цвета регионов при смене данных; `roam` — зум мышью.

## Исходники и документация

- `templates/infografika/echarts/src/chart/map/MapSeries.ts`
- `templates/infografika/echarts/src/chart/map/MapView.ts`
- `templates/infografika/echarts/test/map.html`

## Зависимости

`echarts`, `zrender`; GeoJSON-файл карты (в пакете карт нет).

## Совместимость и адаптация

`complex`. GeoJSON загрузить заранее (`staticFile` + `delayRender`),
`registerMap` до `setOption`. `animation: false`, `roam: false`;
заливка — значения или `visualMap.range` от кадра; «наезд камеры» —
`center`/`zoom` от `interpolate(frame)`. Общий рецепт —
`knowledge/compatibility/echarts.md`.

## Паттерны

`spatial`, `quantities`, `comparison`
