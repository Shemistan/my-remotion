# Radar — `nivo/radar`

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

Радар («паутина»): оси по кругу, по одной на метрику, каждая серия —
замкнутая полупрозрачная фигура. Сетка круглая или многоугольная, у
вершин точки и подписи.

## Когда использовать

Профиль по 4–8 характеристикам и сравнение 1–3 объектов: навыки, оценки
продукта, сильные и слабые стороны. Если объектов много —
`nivo/parallel-coordinates`.

## Фразы из озвучки

- «у нового тарифа выше скорость, но слабее поддержка»
- «сравним профили двух кандидатов»
- «наш продукт сильнее конкурентов почти по всем параметрам»

## Визуальный стиль

Полупрозрачные заливки (`fillOpacity`), `blendMode` для наложения,
сглаженные кривые (`curve`). Игриво-аналитический.

## Входные данные

`RadarSvgProps` (`types.ts`): `data: Record[]` (строка на ось), `keys`
(серии), `indexBy`, `width`, `height`, `margin`, `maxValue` auto,
`valueFormat`, `rotation`, `curve` (`ClosedCurveFactoryId`), `gridLevels`,
`gridShape` `circular|linear`, `gridLabel`, `gridLabelOffset`,
`enableDots`, `dotSymbol`, `dotSize`, `dotColor`, `dotBorderWidth`,
`dotBorderColor`, `enableDotLabel`, `dotLabel`, `dotLabelFormat`,
`dotLabelYOffset`, `colors`, `fillOpacity`, `blendMode`, `borderWidth`,
`borderColor`, `legends`, `layers` (`grid, layers, slices, dots, legends`
+ custom), `defs/fill`, `animate`, `motionConfig`, `isInteractive`,
`sliceTooltip`.

## Анимации

`RadarLayer.tsx`: форма серии морфится `useAnimatedPath` (путь из d3
`lineRadial`), цвета — `useSpring`.

## Исходники и документация

- `templates/infografika/nivo/packages/radar/src/Radar.tsx`, `RadarLayer.tsx`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/radar/meta.yml`
- `templates/infografika/nivo/storybook/stories/radar/Radar.stories.tsx`

## Зависимости

`@nivo/radar`, `@nivo/core`, `@nivo/legends`, `@react-spring/web`, `d3-shape`, `d3-scale`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
«Надувание» фигуры — значения × `progress` при **числовом** `maxValue`
(иначе шкала растёт вместе с данными и фигура не меняется). Серии по
очереди — свой прогресс на каждую серию.

## Паттерны

`comparison`, `quantities`
