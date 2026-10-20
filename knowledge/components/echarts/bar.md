# ECharts bar — `echarts/bar`

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

Столбцы на декартовой или полярной сетке: группы, стеки (`stack`),
скругления `itemStyle.borderRadius`, серая дорожка `showBackground`,
подписи, «гонка» с пересортировкой `realtimeSort`.

## Когда использовать

Сравнение категорий, рейтинги, разбивка в стеке. Если ECharts не нужен —
`recharts/bar-chart` (adaptable) или готовый native
`remotion-bits/bit-bar-chart`.

## Фразы из озвучки

- «больше всего продаж — в Москве, следом Петербург»
- «сравним выручку пяти продуктов»
- «лидер сменился в третьем квартале»

## Визуальный стиль

Плоские прямоугольники в палитре темы ECharts; дашбордный.

## Входные данные

`series: [{type: 'bar', …}]` (`BarSeriesOption` + `BaseBarSeriesOption`):
`data`, `coordinateSystem` (`'cartesian2d'`|`'polar'`), `stack`, `barWidth`,
`barMaxWidth`, `barMinWidth`, `barMinHeight`, `barGap` (30 %),
`barCategoryGap` (20 %), `roundCap` (false), `showBackground` (false),
`backgroundStyle`, `label`, `realtimeSort` (false), `large`,
`largeThreshold`, `clip` (true), `sampling`, `encode`; оси `xAxis`/`yAxis`.

## Анимации

Рост столбцов на входе (глобально `animationDuration` 1000 мс,
`cubicInOut`), перетекание значений, перестановка при `realtimeSort`,
`universalTransition`. Всё на часах zrender (rAF), в миллисекундах.

## Исходники и документация

- `templates/infografika/echarts/src/chart/bar/BarSeries.ts` — опции и умолчания
- `templates/infografika/echarts/src/chart/bar/BaseBarSeries.ts` — ширины и зазоры
- `templates/infografika/echarts/src/chart/bar/BarView.ts` — отрисовка
- `templates/infografika/echarts/src/animation/basicTransition.ts` — конфиг анимации
- `templates/infografika/echarts/test/bar.html` — примеры

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`: императивный движок с собственным rAF-циклом. Рецепт
(`knowledge/compatibility/echarts.md`): `renderer: 'svg'`,
`animation: false`, значения `data[i] * p` от `interpolate(frame)` со
stagger по индексу, `yAxis.max` фиксирован; init в `useEffect` +
`delayRender`/`continueRender` и покадровый `setOption`, либо
SSR-строка (`echarts/ssr-svg-string`). Гонку столбцов делать
перестановкой данных по кадру.

## Паттерны

`comparison`, `quantities`, `growth-decline`
