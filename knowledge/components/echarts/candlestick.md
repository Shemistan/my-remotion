# ECharts candlestick — `echarts/candlestick`

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

Японские свечи OHLC: тело open–close, тени lowest–highest; рост
`#eb5454`, падение `#47b262` (по умолчанию); режим `large`.

## Когда использовать

Котировки, курсы, волатильность по дням. Просто тренд — `echarts/line`.

## Фразы из озвучки

- «акции росли пять дней подряд»
- «после отчёта бумага резко просела»
- «волатильность в марте зашкаливала»

## Визуальный стиль

Финансовый терминал: узкие свечи с тонкими тенями.

## Входные данные

`CandlestickSeriesOption`: `data` ([[open, close, lowest, highest]]),
`layout`, `barWidth`, `barMinWidth`, `barMaxWidth`, `itemStyle` ({color,
color0, borderColor, borderColor0, borderColorDoji}), `large` (true),
`largeThreshold` (600), `progressive` (3000), `progressiveThreshold`
(10000), `clip` (true).

## Анимации

Вход 300 мс, easing `linear`; прогрессивная дорисовка больших рядов.

## Исходники и документация

- `templates/infografika/echarts/src/chart/candlestick/CandlestickSeries.ts`
- `templates/infografika/echarts/src/chart/candlestick/CandlestickView.ts`
- `templates/infografika/echarts/test/candlestick.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`, `progressive: 0`; появление слева
направо — срез `data` при всех категориях на оси X и фиксированных
`yAxis.min/max`. Цвета по умолчанию — «рост красный»; для западной
конвенции поменять `color`/`color0`. Общий рецепт —
`knowledge/compatibility/echarts.md`.

## Паттерны

`growth-decline`, `timeline`
