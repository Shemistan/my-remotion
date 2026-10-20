# PolarBar — `nivo/polar-bar`

| Поле | Значение |
|---|---|
| Репозиторий | `nivo` (`templates/infografika/nivo`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `engine:other`, `engine:d3`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md, package.json) |

## Что визуализирует

Полярная столбчатая диаграмма (роза): на каждую категорию `indexBy` —
равный угловой сектор, столбцы растут от центра по радиусу, серии `keys`
стопкой. Радиальная и круговая сетка, оси.

## Когда использовать

Циклические данные: месяцы и сезоны, часы суток, стороны света (роза
ветров). Для обычного сравнения категорий — `nivo/bar`, для одной доли —
`nivo/radial-bar`.

## Фразы из озвучки

- «пик продаж приходится на зимние месяцы»
- «ночью активность почти нулевая, а к полудню растёт»
- «чаще всего ветер дует с северо-запада»

## Визуальный стиль

Круговая «роза» с сегментами-лепестками, `cornerRadius`, полярная сетка.
Эффектно, необычно, хорошо для заставок.

## Входные данные

`PolarBarSvgProps` (`types.ts`): `data: Record<string, string|number>[]`,
`indexBy`, `keys`, `width`, `height`, `margin`, `adjustValueRange`,
`valueSteps`, `valueFormat`, `startAngle`, `endAngle`, `innerRadius`,
`cornerRadius`, `colors`, `borderWidth`, `borderColor`, `enableArcLabels`
+ `ArcLabelsProps`, `enableRadialGrid`, `enableCircularGrid`,
`radialAxis`, `circularAxisInner`, `circularAxisOuter`, `legends`,
`forwardLegendData`, `layers` (`grid, arcs, axes, labels, legends` +
custom), `transitionMode`, `animate`, `motionConfig`, `isInteractive`.

## Анимации

Сегменты — дуги `@nivo/arcs` с переходами react-spring (`transitionMode`).

## Исходники и документация

- `templates/infografika/nivo/packages/polar-bar/src/PolarBar.tsx`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/polar-bar/meta.yml`

## Зависимости

`@nivo/polar-bar`, `@nivo/arcs`, `@nivo/polar-axes`, `@nivo/core`, `@react-spring/web`, d3.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Рост — значения `keys` × `progress` при фиксированном диапазоне шкалы.
Обход по кругу — поочерёдный прогресс по индексу категории или
`endAngle` по кадру. Storybook-истории в пакете не найдено.

## Паттерны

`comparison`, `timeline`, `quantities`
