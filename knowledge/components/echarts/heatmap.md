# ECharts heatmap — `echarts/heatmap`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE) |

## Что визуализирует

Тепловая карта: сетка ячеек с цветом по значению (декартова, календарь,
matrix) или размытые пятна плотности на географии.

## Когда использовать

Активность по дням и часам, матрица корреляций, плотность событий на
карте. Цвет задаёт `echarts/visual-map`; год по дням — с
`echarts/calendar`.

## Фразы из озвучки

- «больше всего заказов — по пятницам вечером»
- «вот самые горячие часы нагрузки»
- «активность весь год по дням»

## Визуальный стиль

Ячейки по градиенту, опционально `borderRadius` и подписи; на geo —
мягкие пятна `blurSize` 30.

## Входные данные

`HeatmapSeriesOption`: `data` ([[x, y, value]]), `coordinateSystem`
(`'cartesian2d'`|`'geo'`|`'calendar'`|`'matrix'`), `itemStyle`
({borderRadius}), `label`; на geo: `blurSize` (30), `pointSize` (20),
`maxOpacity` (1), `minOpacity` (0).

## Анимации

Проявление ячеек; на geo — растровый слой.

## Исходники и документация

- `templates/infografika/echarts/src/chart/heatmap/HeatmapSeries.ts`
- `templates/infografika/echarts/src/chart/heatmap/HeatmapView.ts`
- `templates/infografika/echarts/test/heatmap.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`; заполнение — значения × p или срез по
строкам/дням при фиксированных `visualMap.min/max` (иначе цвета плывут).
Общий рецепт — `knowledge/compatibility/echarts.md`.

## Паттерны

`quantities`, `comparison`, `timeline`
