# ReactFlow (холст) — `xyflow/react-flow`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom`, `user-events`, `svg`, `css-animation`, `engine:d3` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, packages/react/package.json) |

## Что визуализирует

Холст графа: HTML-узлы и SVG-рёбра между ручками, общий viewport
(pan/zoom), фон, панели — блок-схемы, пайплайны, архитектура, деревья.

## Когда использовать

Схема «узлы и связи» с аккуратными рёбрами, подписями и стрелками без
ручной геометрии. Диаграммы из текста — mermaid; одна-две стрелки —
`xyflow/edge-path-utils` в своём SVG.

## Фразы из озвучки

- «данные проходят через три сервиса и попадают в хранилище»
- «вот как устроен наш пайплайн от заявки до выплаты»
- «каждый модуль зависит от ядра»

## Визуальный стиль

Редакторский: белые узлы 150px, серые рёбра `#b1b1b7`; `colorMode="dark"`;
перекраска — переменные `--xy-*` и `style` узлов/рёбер.

## Входные данные

`ReactFlowProps` (`packages/react/src/types/component-props.ts`): `nodes`,
`edges`, `defaultNodes`, `defaultEdges`, `nodeTypes`, `edgeTypes`,
`defaultEdgeOptions`, `width`, `height` (числа), `viewport` + `onViewportChange`,
`defaultViewport` (`{x:0,y:0,zoom:1}`), `fitView`, `fitViewOptions`,
`minZoom` (0.5), `maxZoom` (2), `nodeOrigin` (`[0,0]`), `colorMode`
(`'light'`), `proOptions` (`{hideAttribution}`), `defaultMarkerColor`
(`'#b1b1b7'`), `onlyRenderVisibleElements` (false), интеракция:
`nodesDraggable`, `nodesConnectable`, `elementsSelectable` (true),
`panOnDrag` (true), `zoomOnScroll` (true), `zoomOnPinch` (true),
`zoomOnDoubleClick` (true), `panOnScroll` (false), `zIndexMode` (`'basic'`).
Дети: `Background`, `Panel`, `MiniMap`, `Controls`, `ViewportPortal`.

## Анимации

Покадровой нет. `edge.animated` — CSS `dashdraw` (dashoffset 10→0, 0.5s,
infinite); `fitView`/`setViewport` с `duration` — d3-zoom transition.

## Исходники и документация

- `templates/infografika/xyflow/packages/react/src/container/ReactFlow/index.tsx` — компонент, дефолты; `types/component-props.ts` — `ReactFlowProps`
- `.../components/NodeWrapper/`, `.../container/NodeRenderer/useResizeObserver.ts`, `.../hooks/useResizeHandler.ts`, `useViewportSync.ts`; `packages/system/src/styles/init.css`
- https://reactflow.dev/api-reference/react-flow

## Зависимости

`@xyflow/react` (`@xyflow/system`, `zustand`, `classcat`, d3-zoom/drag/selection),
peer `react` ≥17; CSS `@xyflow/react/dist/style.css`.

## Совместимость и адаптация

`adaptable`. Узлы меряются `ResizeObserver` после монтирования: без
размеров узел `visibility: hidden`; ребро не рисуется, пока у обоих узлов
нет `handleBounds` или `node.handles` + `width`/`height`. Рецепт: узлам
`width`, `height`, `handles`; холст в контейнере фиксированного размера;
интеракцию выключить (`nodesDraggable`, `nodesConnectable`,
`elementsSelectable`, `panOnDrag`, `zoomOnScroll`, `zoomOnPinch`,
`zoomOnDoubleClick` = false); вместо `fitView` — `viewport` от кадра;
появление — `style.opacity` от `interpolate(frame)`; `animated` →
`style.strokeDashoffset`. Подробно — `knowledge/compatibility/xyflow.md`.

## Паттерны

`system-structure`, `relationships`, `sequence-steps`, `cause-effect`
