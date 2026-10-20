# ECharts markArea — `echarts/mark-area`

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

Подсвеченная полоса или прямоугольник между двумя значениями осей:
период, коридор нормы, зона риска.

## Когда использовать

Выделить интервал (кризис, акция) или диапазон (норма). Порог —
`echarts/mark-line`.

## Фразы из озвучки

- «весь этот период продажи стояли на месте»
- «пока показатель в зелёной зоне — всё в порядке»
- «во время кампании трафик удвоился»

## Визуальный стиль

Полупрозрачная заливка цвета ряда без рамки, подпись сверху.

## Входные данные

`series[i].markArea` (`MarkAreaOption`): `data` ([[{xAxis | yAxis |
coord | x/y | type, name, itemStyle}, {xAxis | yAxis | coord}]]), `label`
({position 'top'}), `itemStyle` ({borderWidth 0}), `precision`, `silent`.

## Анимации

В `defaultOption` `animation: false` — «зона фиксирована на
координатах».

## Исходники и документация

- `templates/infografika/echarts/src/component/marker/MarkAreaModel.ts`
- `templates/infografika/echarts/src/component/marker/MarkAreaView.ts`
- `templates/infografika/echarts/test/markArea.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

Общий рецепт `knowledge/compatibility/echarts.md`; заливка интервала —
вторая граница `xAxis` от кадра (числовая/временная ось) или
`itemStyle.opacity` от `interpolate(frame)`.

## Паттерны

`key-point-emphasis`, `timeline`
