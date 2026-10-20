# ECharts pie — `echarts/pie`

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

Круговая, кольцевая (`radius: [inner, outer]`) и роза Найтингейла
(`roseType`), выносные подписи с ломаными линиями, отступы `padAngle`,
серый круг при нулевой сумме.

## Когда использовать

Доли целого из 2–6 частей, donut с цифрой в центре. Иерархия —
`echarts/sunburst`, `echarts/treemap`.

## Фразы из озвучки

- «больше половины пользователей — с телефонов»
- «бюджет делится на три основные статьи»
- «каждый четвёртый выбрал второй вариант»

## Визуальный стиль

Плоские сектора с белой обводкой, `colorBy: 'data'`, подписи `outer`.

## Входные данные

`PieSeriesOption`: `data`, `center` (['50%','50%']), `radius` ([0,'50%']),
`roseType` (`'radius'`|`'area'`), `clockwise` (true), `startAngle` (90),
`endAngle` (`'auto'`), `padAngle` (0), `minAngle` (0),
`minShowLabelAngle` (0), `selectedOffset` (10), `avoidLabelOverlap`,
`percentPrecision` (2), `stillShowZeroSum` (true), `animationType`
(`'expansion'`|`'scale'`), `animationTypeUpdate`, `showEmptyCircle` (true),
`label` ({position 'outer', alignTo 'none', edgeDistance '25%'}),
`labelLine` ({length 15, length2 30}).

## Анимации

`expansion` — развёртка секторов от `startAngle`; `scale` — рост радиуса;
в SSR — scale-вход CSS-анимацией SVG (`PieView.ts`).

## Исходники и документация

- `templates/infografika/echarts/src/chart/pie/PieSeries.ts`
- `templates/infografika/echarts/src/chart/pie/PieView.ts` — `PiePiece`, входы
- `templates/infografika/echarts/test/pie.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

`complex`. `animation: false`; развёртка по кадру — `endAngle` от
`startAngle` на `360 * p` (направление при `clockwise` проверить
рендером) или значения + прозрачный «остаток». Подписи с
`avoidLabelOverlap` могут прыгать между кадрами. Общий рецепт —
`knowledge/compatibility/echarts.md`.

## Паттерны

`quantities`, `comparison`, `system-structure`
