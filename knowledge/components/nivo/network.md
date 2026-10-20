# Network — `nivo/network`

| Поле | Значение |
|---|---|
| Репозиторий | `nivo` (`templates/infografika/nivo`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `engine:other`, `engine:d3`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md, package.json) |

## Что визуализирует

Силовой граф: узлы-круги и связи-линии, раскладка d3-force
(`linkDistance`, `repulsivity`, `centeringStrength`). Размер, цвет и толщина
задаются из данных. `NetworkCanvas` — для больших графов.

## Когда использовать

Связи «многие ко многим» без иерархии: социальный граф, зависимости
сервисов, кластеры тем. Для деревьев — `nivo/tree`, для потоков —
`nivo/sankey`.

## Фразы из озвучки

- «все наши сервисы связаны друг с другом»
- «в центре сети — несколько ключевых узлов»
- «посмотрите, как образуются кластеры»

## Визуальный стиль

Круглые узлы с обводкой, тонкие связи, «органичная» раскладка. Похоже на
схемы из научно-популярных роликов.

## Входные данные

`NetworkSvgProps` (`types.ts`): `data: {nodes: {id,…}[], links: {source,
target,…}[]}`, `width`, `height`, `margin`, `linkDistance` (число или
функция), `centeringStrength`, `repulsivity`, `distanceMin`,
`distanceMax`, `iterations`, `nodeSize`, `activeNodeSize`,
`inactiveNodeSize`, `nodeColor`, `nodeBorderWidth`, `nodeBorderColor`,
`linkThickness`, `linkColor`, `linkBlendMode`, `annotations`,
`defaultActiveNodeIds`, `layers` (`links, nodes, annotations` + custom),
`nodeComponent`, `linkComponent`, `animate`, `motionConfig`,
`isInteractive`. Headless-хук `useNetwork`. Canvas: `renderNode`,
`renderLink`, `pixelRatio`.

## Анимации

Узлы и связи переходят пружинами react-spring. Сама симуляция не
анимируется: в `useEffect` вызываются `forceSimulation(...).stop()` и
`simulation.tick(iterations)`.

## Исходники и документация

- `templates/infografika/nivo/packages/network/src/Network.tsx`, `types.ts`, `hooks.ts`
- `templates/infografika/nivo/website/src/data/components/network/meta.yml`
- `templates/infografika/nivo/storybook/stories/network/Network.stories.tsx`

## Зависимости

`@nivo/network`, `@nivo/core`, `@nivo/annotations`, `@react-spring/web`, `d3-force ^2.0.1`.

## Совместимость и адаптация

`complex`: (1) раскладка считается в `useEffect` (`hooks.ts`), первый
рендер даёт `nodes: null`, то есть пустой кадр; (2) все узлы стартуют с
`x: 0, y: 0`, и d3-force v2 разводит совпадения через `Math.random()`
(`jiggle`), так что раскладка разная при каждом mount и в каждом воркере
рендера Remotion. Варианты: посчитать координаты один раз заранее (свой
d3-force с сидированным random, сохранить в JSON) и рисовать свой SVG или
custom layer; или подменить `Math.random` на `random(seed)` из remotion на
время mount и дождаться раскладки через `delayRender`. Анимация появления —
`opacity`/`r` узлов и `stroke-dashoffset` связей по кадру.

## Паттерны

`relationships`, `system-structure`
