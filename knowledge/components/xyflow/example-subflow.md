# Пример Subflow (вложенные узлы) — `xyflow/example-subflow`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | example |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom`, `user-events`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE) |

## Что визуализирует

Узлы-контейнеры с дочерними узлами (`parentId`): полупрозрачный
красный блок 500×300, внутри — синий 300×200 со своими детьми, рёбра
между узлами разных уровней вложенности, стрелка с красным маркером;
`extent: 'parent'` и `expandParent` удерживают детей внутри рамки.

## Когда использовать

«Система из подсистем»: микросервисы внутри кластера, отделы внутри
департамента, модули внутри приложения. Зум камеры в контейнер —
переход от общего к частному.

## Фразы из озвучки

- «внутри платёжного контура живут три сервиса»
- «приблизимся к этому блоку — у него своя внутренняя кухня»
- «каждая команда входит в одно из направлений»

## Визуальный стиль

Цветные полупрозрачные рамки `rgba(255,50,50,0.5)` и
`rgba(50,50,255,0.5)`, внутри обычные узлы; `defaultViewport` с
`zoom: 1.5` объявлен, но перекрыт `fitView`.

## Входные данные

`initialNodes` (11 шт.: `parentId`, `origin`, `extent`, `expandParent`,
`style.width/height`), `initialEdges` (7 шт., `markerEnd {type: Arrow,
strokeWidth: 2, width: 15, height: 15, color: '#f00'}`), `nodeTypes =
{ default: DebugNode }`, `nodeExtent [[0,0],[1000,1000]]`,
`nodeOrigin [0,0]`.

## Анимации

Нет; кнопки меняют позиции через `Math.random()`.

## Исходники и документация

- `templates/infografika/xyflow/examples/react/src/examples/Subflow/index.tsx`
- https://reactflow.dev/learn/layouting/sub-flows

## Зависимости

`@xyflow/react`.

## Совместимость и адаптация

`adaptable`: позиция ребёнка считается от родителя
(`evaluateAbsolutePosition`), так что анимировать можно только
родителя — дети поедут вместе. Убрать `Math.random` (кнопка
`updatePos`), `MiniMap`, `Controls`, `Panel`; `DebugNode` заменить на
обычный узел; `fitView` → `viewport` от кадра (зум в контейнер —
`getViewportForBounds` по прямоугольнику родителя). Размеры
контейнеров уже заданы `style.width/height` — продублировать в
`width`/`height` узла.

## Паттерны

`system-structure`, `spatial`, `relationships`
