# ECharts lines — `echarts/lines`

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

Набор отрезков/дуг между точками (обычно на карте): маршруты, перелёты,
потоки; опционально бегущая точка-комета со следом.

## Когда использовать

Маршруты и потоки между городами, логистика. Связи без географии —
`echarts/graph`, `echarts/sankey`.

## Фразы из озвучки

- «доставка идёт из трёх складов во все регионы»
- «самолёты летают по этим направлениям»
- «трафик течёт из Европы в Азию»

## Визуальный стиль

Тонкие дуги `curveness`, символы на концах, светящаяся комета с
хвостом `trailLength`; «диспетчерский».

## Входные данные

`LinesSeriesOption`: `data` ([{coords: [[x,y],[x,y]], fromName, toName,
value, lineStyle}] или плоский массив), `coordinateSystem` (`'geo'`),
`polyline` (false), `symbol` (['none','none']), `symbolSize` ([10,10]),
`lineStyle` ({curveness}), `effect` ({show false, period 4,
constantSpeed 0, symbol 'circle', symbolSize 3, loop true, trailLength
0.2}), `large` (false), `largeThreshold` (2000), `clip` (true), `label`.

## Анимации

`effect` — бесконечная бегущая точка (петля zrender); след —
`motionBlur` слоя Canvas (`zr.configLayer`), в SVG не поддерживается.

## Исходники и документация

- `templates/infografika/echarts/src/chart/lines/LinesSeries.ts`
- `templates/infografika/echarts/src/chart/lines/LinesView.ts` — след и слой
- `templates/infografika/echarts/test/lines-flight.html`, `test/lines-bus.html`

## Зависимости

`echarts`, `zrender`; для карты — `registerMap` (см. `echarts/map`).

## Совместимость и адаптация

`complex`. `effect.show: false`. Комету рисовать вторым рядом `scatter`
по координатам, интерполированным по кривой от `frame`; прорисовку —
укорачивать `coords` (polyline) по кадру. `animation: false`,
`roam: false`. Общий рецепт — `knowledge/compatibility/echarts.md`.

## Паттерны

`spatial`, `relationships`
