# ECharts radar — `echarts/radar`

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

Лепестковая диаграмма: многоугольники значений по осям-индикаторам
компонента `radar`, полупрозрачная заливка, несколько профилей.

## Когда использовать

Профиль по 4–10 критериям, сравнение 2–3 объектов. React-вариант —
`recharts/radar-chart`.

## Фразы из озвучки

- «по скорости мы впереди, а по цене уступаем»
- «сравним два смартфона по шести параметрам»
- «профиль идеального кандидата»

## Визуальный стиль

Контур width 2 с round-стыками, заливка `areaStyle`, паутина-сетка
(polygon или circle).

## Входные данные

`RadarSeriesOption`: `data` ([{value: number[], name}]), `radarIndex` (0),
`symbol`, `symbolSize`, `lineStyle` ({width 2, join 'round'}),
`areaStyle`, `label` ({position 'top'}), `colorBy` (`'data'`). Компонент
`radar`: `indicator` [{name, max}], `shape`, `splitNumber`, `center`,
`radius`.

## Анимации

Многоугольник вырастает из центра; update — перетекание вершин.

## Исходники и документация

- `templates/infografika/echarts/src/chart/radar/RadarSeries.ts`
- `templates/infografika/echarts/src/chart/radar/RadarView.ts`
- `templates/infografika/echarts/test/radar.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`; рост — `value[i] * p` при заданных
`indicator[].max` (иначе шкала перестраивается); второй профиль со
сдвигом по времени. Общий рецепт — `knowledge/compatibility/echarts.md`.

## Паттерны

`comparison`, `abstract-concepts`
