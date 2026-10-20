# ECharts sunburst — `echarts/sunburst`

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

Иерархия концентрическими кольцами: центр — корень, кольца — уровни,
угол — доля; радиальные подписи; `levels` со своим радиусом и стилем.

## Когда использовать

Иерархия 2–4 уровней с долями. Плоско — `echarts/pie`, прямоугольно —
`echarts/treemap`.

## Фразы из озвучки

- «внутри каждого направления — свои подразделения»
- «разложим расходы по уровням»
- «из чего состоит каждая категория»

## Визуальный стиль

Белые разделители `borderWidth` 1, подписи `rotate: 'radial'`,
blur-подсветка ветки; яркий инфографичный.

## Входные данные

`SunburstSeriesOption`: `data` ([{name, value, children}]), `center`,
`radius` ([0,'75%']), `clockwise` (true), `startAngle` (90), `minAngle`
(0), `levels` ([{radius, itemStyle, label}]), `sort` (`'desc'`|`'asc'`|
функция), `label`, `itemStyle`, `nodeClick` (`'rootToNode'`),
`animationType` (`'expansion'`|`'scale'`), `renderLabelForZeroData`
(false), `stillShowZeroSum` (true).

## Анимации

Вход `expansion` 1000 мс, update 500 мс, переход к узлу по клику.

## Исходники и документация

- `templates/infografika/echarts/src/chart/sunburst/SunburstSeries.ts`
- `templates/infografika/echarts/src/chart/sunburst/SunburstView.ts`
- `templates/infografika/echarts/test/sunburst-simple.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`, `nodeClick: false`. Поуровневое
проявление — `levels[d].itemStyle.opacity` от кадра; `endAngle` в
`SunburstSeriesOption` нет — рост по углу через значения листьев × p и
прозрачный «остаток». Общий рецепт — `knowledge/compatibility/echarts.md`.

## Паттерны

`system-structure`, `quantities`
