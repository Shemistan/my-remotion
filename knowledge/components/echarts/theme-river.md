# ECharts themeRiver — `echarts/theme-river`

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

«Река тем»: симметричные плавные потоки вокруг оси времени, толщина —
величина темы в момент времени.

## Когда использовать

Смена долей тем/жанров/каналов во времени, когда важна форма, а не
точные цифры. Точные значения — `echarts/line` со `stack`.

## Фразы из озвучки

- «интерес к теме вспыхнул весной и угас к осени»
- «со временем на первый план вышли видео»
- «жанры сменяли друг друга»

## Визуальный стиль

Плавные цветные слои `colorBy: 'data'`, подписи слева у начала потока.

## Входные данные

`ThemeRiverSeriesOption`: `data` ([[date, value, name]]),
`singleAxisIndex` (0), `boundaryGap` (['10%','10%']), `label` ({show
true, position 'left', margin 4, fontSize 11}), `itemStyle`, `color`.
Компонент `singleAxis` ({type 'time'}).

## Анимации

Проявление слоёв на входе, easing `linear`.

## Исходники и документация

- `templates/infografika/echarts/src/chart/themeRiver/ThemeRiverSeries.ts`
- `templates/infografika/echarts/src/chart/themeRiver/ThemeRiverView.ts`
- `templates/infografika/echarts/test/themeRiver.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`; течение — значения после текущей даты = 0
при фиксированных `singleAxis.min/max`, либо маска-прямоугольник
`graphic`, уезжающая вправо по кадру. Общий рецепт —
`knowledge/compatibility/echarts.md`.

## Паттерны

`timeline`, `growth-decline`, `comparison`
