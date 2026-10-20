# ECharts visualMap — `echarts/visual-map`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | component |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other`, `user-events` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE) |

## Что визуализирует

Шкала «значение → цвет/размер/прозрачность»: непрерывный градиентный
ползунок или кусочная легенда диапазонов; красит heatmap, map, scatter.

## Когда использовать

Тепловые карты, картограммы, раскраска точек по третьему измерению.

## Фразы из озвучки

- «чем темнее регион, тем выше продажи»
- «красным отмечены самые нагруженные часы»
- «зелёные — в норме»

## Визуальный стиль

Градиентная полоса с ручками (continuous) или квадратики-пункты
(piecewise), подписи на концах.

## Входные данные

Общие (`VisualMapOption`): `min`, `max`, `dimension`, `seriesIndex`,
`seriesTargets`, `inRange` ({color, symbolSize, opacity…}),
`outOfRange`, `orient`, `itemWidth`, `itemHeight`, `inverse`, `text`
([high, low]), `textGap`, `precision`, `formatter`, `show`,
`realtime`. Continuous: `calculable`, `range`, `unboundedRange`,
`hoverLink`. Piecewise: `pieces` ([{min, max, label}]), `categories`,
`splitNumber`, `minOpen`/`maxOpen`, `selected`, `selectedMode`.

## Анимации

Собственной нет; перекраска рядов при перетаскивании ручек.

## Исходники и документация

- `templates/infografika/echarts/src/component/visualMap/VisualMapModel.ts`
- `templates/infografika/echarts/src/component/visualMap/ContinuousModel.ts`
- `templates/infografika/echarts/src/component/visualMap/PiecewiseModel.ts`
- `templates/infografika/echarts/test/visualMap-continuous.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

Общий рецепт `knowledge/compatibility/echarts.md`; `calculable: false`;
`min`/`max` фиксировать, иначе цвета меняются при анимации данных;
«подсветка диапазона» — `range` от кадра.

## Паттерны

`quantities`
