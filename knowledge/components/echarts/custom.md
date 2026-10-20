# ECharts custom — `echarts/custom`

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

Произвольный ряд: `renderItem` для каждой точки данных возвращает
группу фигур (rect, path, text, image…) в координатах выбранной системы
— Гант, интервалы, «гантели», нестандартные глифы.

## Когда использовать

Нужного стандартного типа нет. Если стандартный ряд подходит — брать
его. Также самый гибкий путь покадровой анимации внутри ECharts.

## Фразы из озвучки

- «проект разбит на пять этапов»
- «вот как задачи накладываются по времени»
- «каждый рейс — отдельная полоса»

## Визуальный стиль

Любой — определяется `renderItem`; по умолчанию без клипа.

## Входные данные

`CustomSeriesOption`: `renderItem(params, api)` → элемент `{type,
shape, style, children, transition, enterFrom, morph,
keyframeAnimation}`; `params`: `dataIndex`, `dataIndexInside`,
`coordSys`, `encode`, `context`, `itemPayload`; `api`: `value`, `coord`,
`size`, `style`, `visual`…; `itemPayload`, `coordinateSystem`
(`'cartesian2d'` | `'none'` | polar/geo/singleAxis/calendar/matrix),
`data`, `encode`, `clip` (false).

## Анимации

`enterFrom`/`leaveTo`/`transition` по свойствам, `morph` путей,
`keyframeAnimation` с `loop` (`customGraphicKeyframeAnimation.ts`) — на
часах zrender.

## Исходники и документация

- `templates/infografika/echarts/src/chart/custom/CustomSeries.ts` — типы renderItem
- `templates/infografika/echarts/src/chart/custom/CustomView.ts`
- `templates/infografika/echarts/src/animation/customGraphicTransition.ts`
- `templates/infografika/echarts/src/animation/customGraphicKeyframeAnimation.ts`
- `templates/infografika/echarts/test/custom.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false` — keyframe/transition не применяются
(`applyKeyframeAnimation` проверяет `isAnimationEnabled`). Кадр
передавать через `itemPayload: {frame, p}` и считать геометрию в
`renderItem` — полностью детерминированно. Общий рецепт —
`knowledge/compatibility/echarts.md`.

## Паттерны

`timeline`, `abstract-concepts`, `sequence-steps`
