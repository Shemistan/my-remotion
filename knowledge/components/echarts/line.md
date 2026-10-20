# ECharts line — `echarts/line`

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

Линии и области под ними: несколько рядов, сглаживание, ступеньки,
стеки, маркеры точек, подпись у конца линии (`endLabel`).

## Когда использовать

Динамика во времени, тренды, сравнение 2–4 рядов. React-вариант без
движка — `recharts/line-chart`.

## Фразы из озвучки

- «за год аудитория выросла втрое»
- «после запуска кривая резко пошла вверх»
- «в марте был провал, но к лету восстановились»

## Визуальный стиль

Линия width 2, маркеры `emptyCircle` 6 px, `areaStyle` для заливки;
аналитический.

## Входные данные

`LineSeriesOption`: `data`, `coordinateSystem` (`'cartesian2d'`|`'polar'`),
`stack`, `smooth` (false | число), `smoothMonotone`, `step`
(false|`'start'`|`'end'`|`'middle'`), `connectNulls` (false), `showSymbol`
(true), `showAllSymbol` (`'auto'`), `symbol`, `symbolSize` (6),
`lineStyle` ({width 2}), `areaStyle` ({origin}), `label`, `endLabel`
({show false, valueAnimation true, distance 8}), `sampling` (`'none'`),
`clip` (true).

## Анимации

Вход — раскрытие clip-прямоугольником вдоль базовой оси
(`createGridClipPath`, easing `linear`); `endLabel.valueAnimation` —
докрутка числа; update — интерполяция точек; `universalTransition`.

## Исходники и документация

- `templates/infografika/echarts/src/chart/line/LineSeries.ts`
- `templates/infografika/echarts/src/chart/line/LineView.ts`
- `templates/infografika/echarts/src/chart/helper/createClipPathFromCoordSys.ts` — clip-раскрытие
- `templates/infografika/echarts/test/line.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. При `animation: false` clip-раскрытия нет — рост делать
данными: все категории в `xAxis.data`, значения после текущего индекса
`null`, последнюю точку интерполировать; оси фиксировать;
`endLabel.formatter` с числом от кадра. Остальное — общий рецепт
`knowledge/compatibility/echarts.md`.

## Паттерны

`growth-decline`, `timeline`, `comparison`
