# ECharts scatter — `echarts/scatter`

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

Точечная/пузырьковая диаграмма в декартовых, полярных, гео-,
календарных, single- и matrix-координатах; размер и цвет — от данных;
режим `large` для десятков тысяч точек.

## Когда использовать

Корреляция, кластеры, выбросы, точки на карте. Пульсирующие маркеры —
`echarts/effect-scatter`.

## Фразы из озвучки

- «чем выше цена, тем ниже спрос»
- «вот эти точки выбиваются из общей картины»
- «компании разделились на две группы»

## Визуальный стиль

Символы 10 px, `itemStyle.opacity` 0.8; научный.

## Входные данные

`ScatterSeriesOption`: `data` (или плоский числовой массив),
`coordinateSystem`, `symbol`, `symbolSize` (10 или функция),
`symbolRotate`, `itemStyle`, `label`, `large` (false), `largeThreshold`
(2000), `progressive`, `progressiveThreshold`, `clip` (true), `encode`,
`stack`.

## Анимации

Вход — рост символов; update — перемещение,
`universalTransition: {divideShape: 'clone'}`; большие данные рисуются
прогрессивно в следующих кадрах zrender.

## Исходники и документация

- `templates/infografika/echarts/src/chart/scatter/ScatterSeries.ts`
- `templates/infografika/echarts/src/chart/scatter/ScatterView.ts`
- `templates/infografika/echarts/test/scatter.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`, `progressive: 0` (или ждать событие
`finished`); появление — `symbolSize`-функция с масштабом от кадра и
stagger по индексу либо срез `data`; оси фиксировать. Общий рецепт —
`knowledge/compatibility/echarts.md`.

## Паттерны

`relationships`, `comparison`, `spatial`
