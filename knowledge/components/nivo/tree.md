# Tree — `nivo/tree`

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

Дерево или дендрограмма (d3-hierarchy): узлы-круги, связи кривыми
(`bump`, `linear`, `step`), четыре направления раскладки, подписи.
Подсвечиваются предки и потомки. `TreeCanvas` — для больших деревьев.

## Когда использовать

Иерархия без размеров: оргструктура, таксономия, дерево решений,
структура проекта. Если важны величины — `nivo/treemap`/`nivo/icicle`.

## Фразы из озвучки

- «компания делится на три направления, а те — на команды»
- «от одного решения ветвятся несколько сценариев»
- «посмотрим на структуру проекта»

## Визуальный стиль

Аккуратные кривые `bump`, цветные узлы по ветке (`fixNodeColorAtDepth`),
подписи вдоль раскладки. Схематичный, понятный.

## Входные данные

`TreeSvgProps` (`types.ts`): `data` (`{id, value?, children?}`), `width`,
`height`, `margin`, `identity`, `mode` `tree|dendogram`, `layout`
`top-to-bottom|right-to-left|bottom-to-top|left-to-right`, `nodeSize`,
`activeNodeSize`, `inactiveNodeSize`, `nodeColor`, `fixNodeColorAtDepth`,
`linkCurve` `bump|linear|step|step-before|step-after`, `linkThickness`,
`activeLinkThickness`, `inactiveLinkThickness`, `linkColor`,
`enableLabel`, `label`, `labelsPosition`
`outward|inward|layout|layout-opposite`, `orientLabel`, `labelOffset`,
`highlightAncestorNodes/DescendantNodes/AncestorLinks/DescendantLinks`,
`layers` (`links, nodes, labels, mesh` + custom), `nodeComponent`,
`linkComponent`, `labelComponent`, `useMesh`, `animate`, `motionConfig`,
`isInteractive`.

## Анимации

Узлы, связи и подписи получают `animatedProps` (react-spring, например
`LabelAnimatedProps` x/y/rotation).

## Исходники и документация

- `templates/infografika/nivo/packages/tree/src/Tree.tsx`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/tree/meta.yml`
- `templates/infografika/nivo/storybook/stories/tree/Tree.stories.tsx`

## Зависимости

`@nivo/tree`, `@nivo/core`, `@nivo/colors`, `@react-spring/web`, `d3-hierarchy`, `d3-shape`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Рост дерева по уровням — custom `nodeComponent`/`linkComponent` с
`opacity` и `stroke-dashoffset` от кадра и `node.depth`. Обрезать `data`
по глубине нельзя — раскладка перестроится.

## Паттерны

`system-structure`, `relationships`, `sequence-steps`
