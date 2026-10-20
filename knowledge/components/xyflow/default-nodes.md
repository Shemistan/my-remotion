# Встроенные узлы (default / input / output / group) — `xyflow/default-nodes`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, packages/react/package.json) |

## Что визуализирует

Прямоугольные узлы-карточки с подписью `data.label` и точками-ручками:
`default` (вход сверху, выход снизу), `input` (только выход), `output`
(только вход), `group` (пустая полупрозрачная рамка-контейнер для
дочерних узлов через `parentId`).

## Когда использовать

Быстрая схема «шаг → шаг» или «источник → обработка → результат» без
своих компонентов узлов. Нужны иконки, цифры, бренд — свой узел в
`nodeTypes` (см. `xyflow/example-custom-node`).

## Фразы из озвучки

- «заявка приходит на вход, проходит проверку и уходит на выход»
- «три этапа: сбор, очистка, отчёт»
- «эти сервисы входят в один контур»

## Визуальный стиль

CSS: `width: 150px`, `padding: 10px`, `font-size: 12px`, рамка `1px solid
#1a192b`, радиус 3px, белый фон (тёмная тема — `#1e1e1e`); `group` — фон
`rgba(240,240,240,0.25)`. Перекраска — `node.style`/`className` или
переменные `--xy-node-*`.

## Входные данные

Узел (`Node`, `packages/system/src/types/nodes.ts`): `id`, `position
{x,y}`, `data` (`{label}` — строка или JSX), `type` (`'default'` |
`'input'` | `'output'` | `'group'`), `sourcePosition` (Bottom),
`targetPosition` (Top), `width`, `height`, `initialWidth`,
`initialHeight`, `handles`, `parentId`, `extent`, `origin`, `zIndex`,
`hidden`, `style`, `className`. Компоненты получают `NodeProps`: `data`,
`isConnectable`, `sourcePosition`, `targetPosition`, `selected`…

## Анимации

Нет. Только CSS `:hover`/`.selected` box-shadow.

## Исходники и документация

- `templates/infografika/xyflow/packages/react/src/components/Nodes/DefaultNode.tsx`
- `templates/infografika/xyflow/packages/react/src/components/Nodes/InputNode.tsx`
- `templates/infografika/xyflow/packages/react/src/components/Nodes/OutputNode.tsx`
- `templates/infografika/xyflow/packages/react/src/components/Nodes/GroupNode.tsx` — `return null`
- `templates/infografika/xyflow/packages/react/src/components/NodeWrapper/utils.tsx` — `builtinNodeTypes`
- `templates/infografika/xyflow/packages/system/src/styles/style.css` — стили узлов
- https://reactflow.dev/api-reference/types/node

## Зависимости

`@xyflow/react`; работают только внутри `ReactFlow`.

## Совместимость и адаптация

`adaptable`. Рендер — чистый JSX, но обёртка `NodeWrapper` держит узел
`visibility: hidden`, пока нет размеров, и меряет его `ResizeObserver`.
Задать `width`/`height` узла (ширина CSS 150px — совпадает с
`width: 150`) и `handles` — тогда узел и рёбра видны с первого кадра.
Появление: `style: { opacity, transform: 'scale(..)' }` от кадра (не
трогать `transform` самого wrapper — он занят позицией; масштаб — на
внутреннем элементе своего узла или через `opacity`). `pointerEvents`
не важны — интеракцию выключить на холсте.

## Паттерны

`sequence-steps`, `system-structure`
