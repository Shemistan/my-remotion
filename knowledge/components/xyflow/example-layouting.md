# Пример Layouting (dagre) — `xyflow/example-layouting`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | example |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom`, `user-events`, `svg`, `engine:other` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE) |

## Что визуализирует

Автоматическая раскладка дерева/графа библиотекой `dagre`: узлы с
нулевыми позициями раскладываются по уровням сверху вниз (`TB`) или
слева направо (`LR`), ручки переставляются (`Top/Bottom` ↔ `Left/Right`),
стрелки на рёбрах (`MarkerType.Arrow`/`ArrowClosed`).

## Когда использовать

Иерархии и многоуровневые процессы, где позиции руками считать долго:
оргструктура, дерево зависимостей, воронка этапов. Переход «вертикальная
→ горизонтальная раскладка» — эффектная трансформация, если
интерполировать позиции между двумя раскладками по кадру.

## Фразы из озвучки

- «у компании три уровня управления»
- «развернём эту схему горизонтально, и станет видно весь путь»
- «от одного источника расходятся десятки зависимостей»

## Визуальный стиль

Стандартные белые узлы, ровная сетка уровней, стрелки на концах рёбер.

## Входные данные

`initialItems` из `initial-elements.ts` (узлы `input`/default с
`position {0,0}`, рёбра с маркерами); `onLayout(direction)` —
`dagreGraph.setGraph({rankdir})`, `setNode(id, {width:150, height:50})`,
`setEdge`, `dagre.layout`; `nodeExtent [[0,0],[1000,1000]]`.

## Анимации

Нет: смена раскладки — мгновенный `setNodes` по кнопке.

## Исходники и документация

- `templates/infografika/xyflow/examples/react/src/examples/Layouting/index.tsx`
- `templates/infografika/xyflow/examples/react/src/examples/Layouting/initial-elements.ts`
- https://reactflow.dev/examples/layout/dagre

## Зависимости

`@xyflow/react`, `dagre` (^0.8.5, в `examples/react/package.json`).

## Совместимость и адаптация

`adaptable`: dagre синхронный и детерминированный — посчитать раскладку
один раз в `useMemo` (не в `onInit`), обе раскладки заранее, позиции
`position = lerp(TB, LR, p)` от кадра. Учесть: dagre отдаёт центр узла,
а в примере позиция ставится как есть (левый верх) — для точного центра
вычесть `width/2`, `height/2` или `nodeOrigin={[0.5,0.5]}`. Кнопки
`Panel`, `Controls`, `ReactFlowDevTools` убрать; узлам `width: 150,
height: 50` и `handles`.

## Паттерны

`system-structure`, `transformation`, `sequence-steps`
