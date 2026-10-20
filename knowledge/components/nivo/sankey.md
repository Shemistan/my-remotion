# Sankey — `nivo/sankey`

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

Диаграмма Санкея (d3-sankey): узлы-столбики по слоям и ленты потоков
между ними, толщина ленты — величина. Ленты бывают градиентными
(`enableLinkGradient`), подписи стоят внутри или снаружи.

## Когда использовать

Куда уходит поток: бюджет → статьи, трафик → страницы → конверсия,
энергия по стадиям. Циклы не поддерживаются (A → B → A падает). Для
взаимных потоков без направления — `nivo/chord`.

## Фразы из озвучки

- «из каждого рубля бюджета сорок копеек уходит на зарплаты»
- «большая часть трафика приходит из поиска и сразу уходит»
- «проследим путь пользователя от рекламы до покупки»

## Визуальный стиль

Широкие полупрозрачные изогнутые ленты, тонкие узлы со скруглением.
Наглядно, «журнально».

## Входные данные

`SankeySvgProps` (`types.ts`): `data: {nodes: {id}[], links: {source,
target, value, startColor?, endColor?}[]}`, `width`, `height`, `margin`,
`layout` horizontal|vertical, `align` `center|justify|start|end|fn`, `sort`
`auto|input|ascending|descending|fn`, `colors`, `nodeOpacity`,
`nodeHoverOpacity`, `nodeHoverOthersOpacity`, `nodeThickness`,
`nodeSpacing`, `nodeInnerPadding`, `nodeBorderWidth`, `nodeBorderColor`,
`nodeBorderRadius`, `linkOpacity`, `linkHoverOpacity`,
`linkHoverOthersOpacity`, `linkContract`, `linkBlendMode`,
`enableLinkGradient`, `enableLabels`, `label`, `labelPosition`
`inside|outside`, `labelPadding`, `labelOrientation`, `labelTextColor`,
`labelComponent`, `legends`, `layers` + custom, `valueFormat`, `animate`,
`motionConfig`, `isInteractive`.

## Анимации

Узлы и ленты переходят через react-spring (`MotionProps`).

## Исходники и документация

- `templates/infografika/nivo/packages/sankey/src/Sankey.tsx`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/sankey/meta.yml`
- `templates/infografika/nivo/storybook/stories/sankey/Sankey.stories.tsx`

## Зависимости

`@nivo/sankey`, `@nivo/core`, `@nivo/legends`, `@react-spring/web`, `d3-sankey`, `d3-shape`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
«Течение» слева направо — `clip-path` по x или custom layer (`links`,
`nodes`), где ленты получают `opacity`/`stroke-dashoffset` по кадру. Менять
`value` по кадру можно, но раскладка будет перестраиваться.

## Паттерны

`cause-effect`, `relationships`, `transformation`, `sequence-steps`
