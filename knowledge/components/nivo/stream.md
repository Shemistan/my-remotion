# Stream — `nivo/stream`

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

Streamgraph: сглаженные слои-потоки стопкой во времени, смещение
базовой линии (`offsetType`) делает график симметричным «течением». Есть
точки и срезы.

## Когда использовать

Как меняется состав во времени: жанры музыки по годам, доли каналов
трафика, популярность тем. Для точных значений — `nivo/line`, для
состава в одной точке — `nivo/pie`.

## Фразы из озвучки

- «за десять лет вкусы слушателей сильно поменялись»
- «доля мобильного трафика постепенно вытеснила десктоп»
- «темы приходят и уходят волнами»

## Визуальный стиль

Плавные органические формы, насыщенная палитра, `fillOpacity`. Красиво
для заставок и сторителлинга.

## Входные данные

`StreamSvgProps` (`types.ts`): `data: Record<string, string|number>[]`
(строка на момент времени), `keys` (слои), `width`, `height`, `margin`,
`label`, `valueFormat`, `stack`, `order` (`StackOrder`), `offsetType`
(`StackOffset`), `curve` (`AreaCurve`), `axisTop/Right/Bottom/Left`,
`enableGridX/Y`, `gridXValues/gridYValues`, `colors`, `fillOpacity`,
`borderWidth`, `borderColor`, `enableDots`, `dotComponent`, `dotPosition`
`start|center|end`, `dotSize`, `dotColor`, `dotBorderWidth`,
`dotBorderColor`, `enableStackTooltip`, `legends`, `layers` (`grid, axes,
layers, dots, slices, legends` + custom), `defs/fill`, `animate`,
`motionConfig`, `isInteractive`.

## Анимации

Пути слоёв переходят через react-spring (`MotionProps`).

## Исходники и документация

- `templates/infografika/nivo/packages/stream/src/Stream.tsx`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/stream/meta.yml`
- `templates/infografika/nivo/storybook/stories/stream/Stream.stories.tsx`

## Зависимости

`@nivo/stream`, `@nivo/core`, `@nivo/axes`, `@nivo/legends`, `@react-spring/web`, `d3-shape`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
«Течение» во времени — `clip-path` слева направо по кадру. Срез `data`
поменяет x-шкалу (point), поэтому маска лучше. Рост слоёв — значения ×
`progress`. Список значений `order`/`offsetType` — в типах `@nivo/core`.

## Паттерны

`timeline`, `growth-decline`, `comparison`, `transformation`
