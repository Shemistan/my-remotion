# ECharts gauge — `echarts/gauge`

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

Спидометр/шкала: дуга от 225° до −45° с делениями и подписями,
стрелка, полоса прогресса, центральная цифра `detail` и заголовок.

## Когда использовать

Один KPI против нормы: загрузка, выполнение плана, NPS. Просто цифра —
`remotion-bits/animated-counter`.

## Фразы из озвучки

- «план выполнен на 87 процентов»
- «загрузка серверов в красной зоне»
- «скорость выросла почти до предела»

## Визуальный стиль

Дорожка width 10, стрелка 60 % радиуса, зоны цвета через
`axisLine.lineStyle.color: [[доля, цвет], …]`; приборный.

## Входные данные

`GaugeSeriesOption`: `data` ([{value, name, title, detail, pointer,
progress}]), `center`, `radius` ('75%'), `startAngle` (225), `endAngle`
(-45), `clockwise` (true), `min` (0), `max` (100), `splitNumber` (10),
`axisLine` ({roundCap, lineStyle {color, width 10}}), `progress` ({show
false, width 10, roundCap, overlap}), `splitLine`, `axisTick`
({splitNumber 5}), `axisLabel` ({distance 15}), `pointer` ({length
'60%', width 6, icon}), `anchor`, `title`, `detail` ({formatter,
valueAnimation}).

## Анимации

Поворот стрелки (`PointerPath`) и рост `progress` к значению;
`detail.valueAnimation` — докрутка числа.

## Исходники и документация

- `templates/infografika/echarts/src/chart/gauge/GaugeSeries.ts`
- `templates/infografika/echarts/src/chart/gauge/GaugeView.ts`
- `templates/infografika/echarts/src/chart/gauge/PointerPath.ts`
- `templates/infografika/echarts/test/gauge.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`, но адаптация самая простая: `animation: false`,
`data[0].value = interpolate(frame, …, [0, target])` — стрелка,
прогресс и число двигаются вместе; `detail.formatter` с `Math.round`.
Общий рецепт — `knowledge/compatibility/echarts.md`.

## Паттерны

`quantities`, `key-point-emphasis`
