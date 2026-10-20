# Funnel — `nivo/funnel`

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

Воронка: этапы друг за другом, ширина части пропорциональна значению,
переходы между частями сглажены (`shapeBlending`), есть разделители и
подписи. На сайте помечена как experimental.

## Когда использовать

Конверсия по шагам: визиты → регистрации → оплаты, найм, продажи. Для
сравнения без последовательности — `nivo/bar`.

## Фразы из озвучки

- «из тысячи посетителей до оплаты доходят только сорок»
- «самый большой отток — на шаге регистрации»
- «наша воронка продаж за квартал»

## Визуальный стиль

Толстые полупрозрачные обводки (`borderWidth` 6, `borderOpacity` 0.66),
сглаженные формы, подписи цветом фона. Маркетинговый, наглядный.

## Входные данные

`FunnelSvgProps` (`types.ts`, defaults в `props.tsx`): `data: {id, value,
label?}[]`, `width`, `height`, `margin`, `direction` vertical,
`interpolation` smooth, `spacing` 0, `shapeBlending` 0.66, `colors`,
`size`, `fillOpacity` 1, `borderWidth` 6, `borderColor`, `borderOpacity`
0.66, `enableLabel` true, `labelColor`, `enableBeforeSeparators`,
`beforeSeparatorLength/Offset`, `enableAfterSeparators`,
`afterSeparatorLength/Offset`, `currentPartSizeExtension` 0,
`currentBorderWidth`, `annotations`, `layers` (`separators, parts, labels,
annotations`), `valueFormat`, `animate`, `motionConfig`, `isInteractive`.
Headless-хук `useFunnel`.

## Анимации

`Part.tsx`: путь части и обводки — `useAnimatedPath`, цвет и толщина —
`useSpring`, `immediate: !animate`.

## Исходники и документация

- `templates/infografika/nivo/packages/funnel/src/Funnel.tsx`, `Part.tsx`, `types.ts`, `props.tsx`
- `templates/infografika/nivo/website/src/data/components/funnel/meta.yml`
- `templates/infografika/nivo/storybook/stories/funnel/Funnel.stories.tsx`

## Зависимости

`@nivo/funnel`, `@nivo/core`, `@nivo/annotations`, `@react-spring/web`, `d3-shape`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Пошаговый показ этапов — `clip-path` по оси направления или `opacity`
частей в custom layer (`parts`, `areaGenerator`). Акцент на «узком
месте» — `currentPartSizeExtension` через custom layer.

## Паттерны

`sequence-steps`, `quantities`, `growth-decline`
