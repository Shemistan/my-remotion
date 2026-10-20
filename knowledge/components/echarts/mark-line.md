# ECharts markLine — `echarts/mark-line`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | component |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE) |

## Что визуализирует

Опорная линия на ряду: среднее/max/min/median, горизонталь или
вертикаль по значению оси, или отрезок между двумя точками; стрелка и
подпись.

## Когда использовать

Цель, норма, среднее, момент события. Точка — `echarts/mark-point`,
интервал — `echarts/mark-area`.

## Фразы из озвучки

- «вот целевой уровень — и мы его превысили»
- «всё, что выше этой линии, — прибыль»
- «в этот момент вышло обновление»

## Визуальный стиль

Пунктир `dashed`, круг в начале и стрелка в конце (`symbolSize`
[8, 16]), подпись у конца.

## Входные данные

`series[i].markLine` (`MarkLineOption`): `data` ([{type, xAxis, yAxis,
name, valueIndex, valueDim} | [{coord | x/y}, {coord | x/y}]]),
`symbol` (['circle','arrow']), `symbolSize` ([8,16]), `symbolRotate`,
`symbolOffset` (0), `precision` (2), `label` ({position 'end', distance
5}), `lineStyle` ({type 'dashed'}), `silent`.

## Анимации

Прорисовка линии на входе, easing `linear`.

## Исходники и документация

- `templates/infografika/echarts/src/component/marker/MarkLineModel.ts`
- `templates/infografika/echarts/src/component/marker/MarkLineView.ts`
- `templates/infografika/echarts/test/markLine.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

Общий рецепт `knowledge/compatibility/echarts.md`; `animation: false`;
прорисовка — вторая точка отрезка интерполируется от первой по кадру;
въезд уровня — `yAxis` от кадра при фиксированной оси. Среднее по
анимированным данным «плывёт» — задавать значение явно.

## Паттерны

`key-point-emphasis`, `comparison`
