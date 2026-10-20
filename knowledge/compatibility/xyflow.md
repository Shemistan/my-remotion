# xyflow (React Flow) — совместимость с Remotion

Репозиторий `templates/infografika/xyflow` — монорепо React Flow и Svelte
Flow. Исследован пакет `@xyflow/react` 12.12.0 (`packages/react`) и ядро
`@xyflow/system` 0.0.83 (`packages/system`); `packages/svelte` пропущен.
Лицензия MIT: `LICENSE` («Copyright (c) 2019-2025 webkid GmbH»), `license:
MIT` в `package.json` обоих пакетов. Атрибуция по MIT. Отдельная просьба
авторов (не юридическое ограничение лицензии): плашку «React Flow» в
углу (`Attribution`) скрывать `proOptions={{hideAttribution:true}}`
только при подписке React Flow Pro; иначе — оставить и сдвинуть
`attributionPosition` в незаметный угол. Документации в репозитории нет
— ссылки на reactflow.dev.

Зависимости: `zustand` (store), `classcat`, через `@xyflow/system` —
`d3-zoom`, `d3-drag`, `d3-selection`, `d3-interpolate`; peer `react`,
`react-dom` ≥17. Стили обязательны: `@xyflow/react/dist/style.css`
(исходник `packages/react/src/styles/style.css` → `system/src/styles/*`,
классы `xy-flow__*` переименовываются в `react-flow__*`).

## Как рендерит

`ReactFlow` → `ReactFlowProvider` (zustand-store) → `GraphView`: слой
viewport с `transform: translate(x,y) scale(zoom)`, в нём рёбра (каждое —
свой `<svg>` с `<g>`/`<path>`) и узлы (`div.react-flow__node` с
`transform: translate(...)`). Пан/зум — d3-zoom на pane. Холст занимает
100% родителя (`wrapperStyle`), `width`/`height` лишь засевают размер в
store; реальный размер меряется `useResizeHandler` (`offsetWidth`,
`ResizeObserver`, `window.resize`).

## Главная DOM-зависимость: замер узлов

- `NodeWrapper` рендерит узел с `visibility: hidden`, пока у него нет
  размеров (`nodeHasDimensions`: `measured ?? width ?? initialWidth`).
- `useNodeObserver` подписывает узел на общий `ResizeObserver`
  (`container/NodeRenderer/useResizeObserver.ts`), пока узел не
  инициализирован (`handleBounds`); колбэк → `updateNodeInternals` →
  `measured` и `handleBounds` через `getBoundingClientRect` ручек
  (`system/src/utils/dom.ts`).
- Ребро (`EdgeWrapper` → `getEdgePosition`) возвращает `null`, пока у
  обоих концов нет `handleBounds` **или** `node.handles` и ширины
  (`measured.width || width || initialWidth`).

ResizeObserver срабатывает асинхронно после layout — в Remotion первый
кадр после монтирования рискует быть без рёбер. Детерминированный путь
(механизм SSR из `positions.ts`): каждому узлу задать `width`, `height` и
`handles: [{ type: 'target', position: 'top', x, y }, { type: 'source',
position: 'bottom', x, y }]`. Тогда узел видим и рёбра рисуются в первом
же рендере; поздний DOM-замер переопределит ручки — их `x/y` должны
совпадать с CSS (по умолчанию ручка 6px по центру стороны,
`translate(-50%, ±50%)`), иначе рёбра сдвинутся на кадр. Подстраховка —
`delayRender` до `useNodesInitialized()` (хук есть в `hooks/`, не
читался подробно).

## Анимация

- Собственных таймеров/rAF в рендере нет. Единственная встроенная
  анимация — `edge.animated`: `.animated path { stroke-dasharray: 5;
  animation: dashdraw 0.5s linear infinite }`, `@keyframes dashdraw {
  from { stroke-dashoffset: 10 } }` (`system/src/styles/init.css`).
- `fitView({duration})`, `setViewport(..., {duration})`, `Controls` —
  d3-zoom transitions на браузерных часах.

## Общий рецепт для Remotion

```tsx
const frame = useCurrentFrame(); const { fps, width: W, height: H } = useVideoConfig();
const p = (i: number) => interpolate(frame, [i * 8, i * 8 + 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
<div style={{ width: W, height: H }}>
  <ReactFlow width={W} height={H} nodes={nodes.map((n, i) => ({ ...n, style: { ...n.style, opacity: p(i) } }))}
    edges={edges.map((e, i) => ({ ...e, animated: false, style: { strokeDasharray: 5,
      strokeDashoffset: 10 * (1 - ((frame / fps / 0.5) % 1)), opacity: p(i + 2) } }))}
    viewport={{ x: camX, y: camY, zoom: camZoom }} onViewportChange={() => {}}
    nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
    panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false}
    preventScrolling={false} colorMode="light" />
</div>
```

1. Узлам — `width`, `height`, `handles` (см. выше); `nodeTypes`/`edgeTypes`
   объявлять вне компонента (стабильная ссылка).
2. Камера — controlled `viewport` из кадра; `fitView` не использовать
   (fit по немеренным узлам неверен) — нужный кадр посчитать
   `getViewportForBounds(bounds, W, H, minZoom, maxZoom, padding)`.
   `useViewportSync` применяет `viewport` в `useEffect` — возможен лаг в
   один коммит; если заметно, двигать камеру `transform` на обёртке, а
   `viewport` держать постоянным.
3. Появление — `style.opacity` узлов/рёбер от кадра со stagger.
   `node.style.transform` не трогать: он перекрывает `translate` позиции
   (`...node.style` идёт после `transform` в `NodeWrapper`). Масштаб —
   внутри своего узла. Перемещение — менять `position` от кадра.
4. Прорисовка рёбер — свой edge-тип на `BaseEdge` с `pathLength={1}
   strokeDasharray={1} strokeDashoffset={1 - p}` (`BaseEdge` пробрасывает
   SVG-атрибуты в `<path>`).
5. Подписи: `edge.label`/`EdgeText` меряется `getBBox()` в `useEffect`
   (до замера `visibility="hidden"`), `EdgeLabelRenderer`/`ViewportPortal`
   — порталы, цель которых появляется в store после монтирования. Шрифты
   грузить до первого кадра; анимацию подписей начинать не с кадра 0.
6. Убрать `MiniMap`, `Controls`, `NodeToolbar`, обработчики мыши,
   `confirm()`, `Math.random()` из примеров; `colorMode="system"` не
   использовать (зависит от `matchMedia`).
7. Вне холста стрелки рисовать напрямую `getBezierPath`/`getSmoothStepPath`
   (`xyflow/edge-path-utils`) — без store и DOM.

## Пропущено

- `NodeResizer`, `NodeToolbar`, `EdgeToolbar` — интерактивные
  инструменты редактирования (ресайз мышью, тулбары по выделению).
- `ConnectionLine` — линия при перетаскивании нового соединения (drag).
- Хуки (`useReactFlow`, `useNodesState`, `useEdgesState`, `useStore`,
  `useConnection`, `useKeyPress`…), `ReactFlowProvider`, `addEdge`,
  `applyNodeChanges` — служебные, упомянуты в карточках.
- `EdgeText`, `BaseEdge`, `ViewportPortal` — описаны внутри
  `xyflow/edge-types`, `xyflow/panel`, `xyflow/react-flow`.
- `packages/svelte` и всё вне `packages/react`, `packages/system`,
  `examples/react` (tooling, тесты, прочие примеры) — не исследовались.
- Примеры, кроме 7 записанных: интерактивные/служебные (DragNDrop,
  EasyConnect, Validation, UseKeyPress, Stress, Redux, DevTools, A11y,
  ReconnectEdge, Interaction, InteractiveMinimap, NodeResizer, NodeToolbar,
  EdgeToolbar…) или дубли визуала (Basic, DefaultNodes, Backgrounds —
  учтён в `xyflow/background`).

## Неясно

- Успевает ли `ResizeObserver` до снимка кадра в headless Chrome Remotion
  без `node.handles`; рендером не проверено.
- Насколько заметен лаг `useViewportSync` (effect) при камере от кадра.
- Как именно отложен начальный `fitView` до замера узлов — store
  (`packages/react/src/store/`) не читался.
- URL reactflow.dev для отдельных примеров (`/examples/...`) не
  проверялись открытием.
