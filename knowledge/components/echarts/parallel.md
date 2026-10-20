# ECharts parallel — `echarts/parallel`

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

Параллельные координаты: каждая запись — ломаная через ряд вертикальных
осей-показателей, полупрозрачные линии образуют пучки.

## Когда использовать

Многомерное сравнение множества объектов. Для 2–3 объектов понятнее
`echarts/radar`.

## Фразы из озвучки

- «дорогие модели проигрывают по расходу»
- «видно, как группы расходятся по каждому показателю»
- «лучшие по всем параметрам — вот эти три»

## Визуальный стиль

Линии width 1, opacity 0.45; неактивные — `inactiveOpacity` 0.05.

## Входные данные

`ParallelSeriesOption`: `data` ([number[]]), `parallelIndex` (0),
`lineStyle`, `smooth` (false), `inactiveOpacity` (0.05), `activeOpacity`
(1), `realtime`, `progressive` (300), `parallelAxisDefault`. Компоненты
`parallel` и `parallelAxis` ([{dim, name, type, min, max}]).

## Анимации

Проявление линий (easing `linear`); прогрессивный рендер по 300 линий;
выделение диапазона на оси мышью.

## Исходники и документация

- `templates/infografika/echarts/src/chart/parallel/ParallelSeries.ts`
- `templates/infografika/echarts/src/chart/parallel/ParallelView.ts`
- `templates/infografika/echarts/test/parallel-aqi.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`, `progressive: 0` (иначе дорисовка в
следующих кадрах); проявление — срез `data` или `lineStyle.opacity` от
кадра; выделение группы — цвет в данных. Общий рецепт —
`knowledge/compatibility/echarts.md`.

## Паттерны

`comparison`, `relationships`
